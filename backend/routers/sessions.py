import logging
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from backend.db import get_db
from backend.deps import require_student, require_teacher
from backend.rate_limit import limiter
from backend.ai_provider import generate_checkpoint_feedback, generate_sowhat_feedback, generate_jargon_explanation
from backend.schemas.sessions import (
    StartSessionRequest, ProgressRequest, CheckpointRequest,
    SoWhatRequest, JargonRequest, KeyTermRequest,
    PreviewCheckpointRequest, PreviewSoWhatRequest,
    PreviewJargonRequest, PreviewKeyTermRequest,
    SessionStartResponse, SessionListItem, SessionDetailResponse,
    CheckpointPendingResponse, SoWhatPendingResponse,
    JargonResponse, KeyTermResponse, ProgressUpdateResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Core session endpoints ────────────────────────────────────────────────────

@router.post("/", response_model=SessionStartResponse)
async def start_session(body: StartSessionRequest, user=Depends(require_student), db=Depends(get_db)):
    assignment = await db.from_("assignments") \
        .select("id, class_id, paper_id, reading_guide, difficulty, status") \
        .eq("id", body.assignment_id).single().execute()
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.data["status"] != "published":
        raise HTTPException(status_code=403, detail="Assignment is not published")

    # Only check enrollment for classroom assignments (not self-study)
    if assignment.data.get("class_id"):
        enrollment = await db.from_("class_enrollments").select("class_id") \
            .eq("class_id", assignment.data["class_id"]).eq("student_id", user["sub"]).single().execute()
        if not enrollment.data:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")

    # Insert a new session.  If a row already exists (race condition /
    # React StrictMode double-fire), the unique constraint catches it and
    # we fall back to fetching the existing row — preserving progress.
    result = await db.from_("student_sessions").insert({
        "student_id": user["sub"],
        "assignment_id": body.assignment_id,
        "status": "in_progress",
        "current_section_index": 0,
    }).execute()

    if result.data:
        session = result.data[0]
    elif result.status_code == 409:
        # Unique-constraint violation: re-opening assignment OR true race condition.
        # Fetch the existing row to preserve current_section_index.
        existing = await db.from_("student_sessions") \
            .select("id, status, current_section_index") \
            .eq("student_id", user["sub"]) \
            .eq("assignment_id", body.assignment_id) \
            .single().execute()
        if not existing.data:
            raise HTTPException(status_code=500, detail="Session conflict but row not found")
        session = existing.data
    else:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {result.error}")

    paper = await db.from_("papers").select("title") \
        .eq("id", assignment.data["paper_id"]).single().execute()

    return {
        "session_id": session["id"],
        "assignment_id": body.assignment_id,
        "paper_id": assignment.data["paper_id"],
        "status": session["status"],
        "current_section_index": session["current_section_index"],
        "reading_guide": assignment.data["reading_guide"],
        "paper_title": paper.data["title"] if paper.data else "Unknown",
        "difficulty": assignment.data["difficulty"],
    }


@router.get("/", response_model=list[SessionListItem])
async def list_sessions(user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("student_sessions") \
        .select("id, assignment_id, status, current_section_index") \
        .eq("student_id", user["sub"]).execute()
    return result.data or []


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions") \
        .select("id, assignment_id, status, current_section_index") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    checkpoints = await db.from_("checkpoint_responses") \
        .select("id, section_index, student_text, ai_feedback, submitted_at") \
        .eq("session_id", session_id).execute()

    sowhat = await db.from_("sowhat_responses") \
        .select("id, student_text, ai_feedback, submitted_at") \
        .eq("session_id", session_id).single().execute()

    jargon = await db.from_("jargon_lookups") \
        .select("id, term, explanation, created_at") \
        .eq("session_id", session_id).execute()

    return {
        **session.data,
        "checkpoints": checkpoints.data or [],
        "sowhat": sowhat.data,
        "jargon_lookups": jargon.data or [],
    }


@router.patch("/{session_id}/progress", response_model=ProgressUpdateResponse)
async def update_progress(session_id: str, body: ProgressRequest, user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("student_sessions") \
        .update({"current_section_index": body.current_section_index}) \
        .eq("id", session_id).eq("student_id", user["sub"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


# ── Background task helpers ───────────────────────────────────────────────────

async def _run_checkpoint_feedback(
    checkpoint_id: str,
    section_title: str,
    guiding_questions: list[str],
    student_text: str,
) -> None:
    feedback = await generate_checkpoint_feedback(section_title, guiding_questions, student_text)
    db = get_db()
    await db.from_("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()


async def _run_sowhat_feedback(
    sowhat_id: str,
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> None:
    feedback = await generate_sowhat_feedback(paper_title, section_titles, difficulty, student_text)
    db = get_db()
    await db.from_("sowhat_responses").update({"ai_feedback": feedback}).eq("id", sowhat_id).execute()


async def _run_jargon_explanation(
    lookup_id: str,
    term: str,
    context_snippet: str,
) -> None:
    explanation = await generate_jargon_explanation(term, context_snippet)
    db = get_db()
    await db.from_("jargon_lookups").update({"explanation": explanation}).eq("id", lookup_id).execute()


# ── Checkpoint ────────────────────────────────────────────────────────────────

@router.post("/{session_id}/checkpoint", response_model=CheckpointPendingResponse)
@limiter.limit("30/minute")
async def submit_checkpoint(
    request: Request,
    session_id: str,
    body: CheckpointRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id, assignment_id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    assignment = await db.from_("assignments").select("reading_guide") \
        .eq("id", session.data["assignment_id"]).single().execute()
    sections = assignment.data["reading_guide"]["sections"]
    if body.section_index >= len(sections):
        raise HTTPException(status_code=400, detail="Invalid section index")
    section = sections[body.section_index]

    result = await db.from_("checkpoint_responses").upsert({
        "session_id": session_id,
        "section_index": body.section_index,
        "student_text": body.student_text,
        "ai_feedback": None,
    }, on_conflict="session_id,section_index").execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save checkpoint")
    checkpoint_id = result.data[0]["id"]

    background_tasks.add_task(
        _run_checkpoint_feedback,
        checkpoint_id=checkpoint_id,
        section_title=section["title"],
        guiding_questions=section["guiding_questions"],
        student_text=body.student_text,
    )
    return {"id": checkpoint_id, "feedback_pending": True}


# ── So What? ─────────────────────────────────────────────────────────────────

@router.post("/{session_id}/sowhat", response_model=SoWhatPendingResponse)
@limiter.limit("20/minute")
async def submit_sowhat(
    request: Request,
    session_id: str,
    body: SoWhatRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id, assignment_id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    assignment = await db.from_("assignments").select("reading_guide, paper_id") \
        .eq("id", session.data["assignment_id"]).single().execute()
    guide = assignment.data["reading_guide"]
    section_titles = [s["title"] for s in guide["sections"]]

    paper = await db.from_("papers").select("title") \
        .eq("id", assignment.data["paper_id"]).single().execute()
    paper_title = paper.data["title"] if paper.data else "Unknown"

    result = await db.from_("sowhat_responses").upsert({
        "session_id": session_id,
        "student_text": body.student_text,
        "ai_feedback": None,
    }, on_conflict="session_id").execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save So What? response")
    sowhat_id = result.data[0]["id"]

    background_tasks.add_task(
        _run_sowhat_feedback,
        sowhat_id=sowhat_id,
        paper_title=paper_title,
        section_titles=section_titles,
        difficulty=guide.get("difficulty", "intermediate"),
        student_text=body.student_text,
    )
    return {"id": sowhat_id, "feedback_pending": True}


# ── Preview endpoints (teacher, stateless) — must be before /{session_id}/jargon ──

@router.post("/preview/checkpoint")
async def preview_checkpoint(body: PreviewCheckpointRequest, user=Depends(require_teacher)):
    feedback = await generate_checkpoint_feedback(
        section_title=body.section_title,
        guiding_questions=body.guiding_questions,
        student_text=body.student_text,
    )
    return {"feedback": feedback}


@router.post("/preview/sowhat")
async def preview_sowhat(body: PreviewSoWhatRequest, user=Depends(require_teacher)):
    feedback = await generate_sowhat_feedback(
        paper_title=body.paper_title,
        section_titles=body.section_titles,
        difficulty=body.difficulty,
        student_text=body.student_text,
    )
    return {"feedback": feedback}


@router.post("/preview/jargon")
async def preview_jargon(body: PreviewJargonRequest, user=Depends(require_teacher)):
    explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    return {"term": body.term, "explanation": explanation}


@router.post("/preview/keyterm")
async def preview_keyterm(body: PreviewKeyTermRequest, user=Depends(require_teacher), db=Depends(get_db)):
    cached = await db.from_("key_term_definitions").select("explanation") \
        .eq("assignment_id", body.assignment_id).eq("term", body.term.lower()).single().execute()
    if cached.data:
        return {"term": body.term, "explanation": cached.data["explanation"], "cached": True}

    explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    await db.from_("key_term_definitions").upsert({
        "assignment_id": body.assignment_id,
        "term": body.term.lower(),
        "explanation": explanation,
    }, on_conflict="assignment_id,term").execute()

    return {"term": body.term, "explanation": explanation, "cached": False}


# ── Jargon lookup (ad-hoc, async) ────────────────────────────────────────────

@router.post("/{session_id}/jargon", response_model=JargonResponse)
@limiter.limit("60/minute")
async def lookup_jargon(
    request: Request,
    session_id: str,
    body: JargonRequest,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # Deduplicate within session
    existing = await db.from_("jargon_lookups").select("id, explanation") \
        .eq("session_id", session_id).eq("term", body.term.lower()).single().execute()
    if existing.data and existing.data.get("explanation"):
        return {"id": existing.data["id"], "term": body.term, "explanation": existing.data["explanation"], "feedback_pending": False}

    logger.info("jargon: generating explanation for term=%r, context=%d chars", body.term, len(body.context_snippet))
    try:
        explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    except Exception as e:
        logger.error("jargon: generate_jargon_explanation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")
    logger.info("jargon: got explanation type=%s len=%s repr=%.100s", type(explanation).__name__, len(explanation) if explanation else "None", repr(explanation))

    if not explanation:
        logger.warning("jargon: explanation is empty/falsy, using placeholder")
        explanation = f"{body.term}: definition not available."

    result = await db.from_("jargon_lookups").insert({
        "session_id": session_id,
        "term": body.term.lower(),
        "explanation": explanation,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save jargon lookup")

    return {"id": result.data[0]["id"], "term": body.term, "explanation": explanation, "feedback_pending": False}


# ── Key term lookup (cached, near-synchronous) ────────────────────────────────

@router.post("/{session_id}/keyterm", response_model=KeyTermResponse)
@limiter.limit("60/minute")
async def lookup_keyterm(
    request: Request,
    session_id: str,
    body: KeyTermRequest,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("assignment_id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    assignment_id = session.data["assignment_id"]

    cached = await db.from_("key_term_definitions").select("explanation") \
        .eq("assignment_id", assignment_id).eq("term", body.term.lower()).single().execute()
    if cached.data:
        return {"term": body.term, "explanation": cached.data["explanation"], "cached": True}

    explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    await db.from_("key_term_definitions").upsert({
        "assignment_id": assignment_id,
        "term": body.term.lower(),
        "explanation": explanation,
    }, on_conflict="assignment_id,term").execute()

    return {"term": body.term, "explanation": explanation, "cached": False}
