from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student, require_teacher
from backend.config import get_settings
from backend.ai_provider import generate_checkpoint_feedback, generate_sowhat_feedback, generate_jargon_explanation

router = APIRouter()
settings = get_settings()


# ── Request models ────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    assignment_id: str

class ProgressRequest(BaseModel):
    current_section_index: int

class CheckpointRequest(BaseModel):
    section_index: int
    student_text: str

class SoWhatRequest(BaseModel):
    student_text: str

class JargonRequest(BaseModel):
    term: str
    context_snippet: str

class KeyTermRequest(BaseModel):
    term: str
    context_snippet: str

class PreviewCheckpointRequest(BaseModel):
    section_title: str
    guiding_questions: list[str]
    student_text: str

class PreviewSoWhatRequest(BaseModel):
    paper_title: str
    section_titles: list[str]
    difficulty: str
    student_text: str

class PreviewJargonRequest(BaseModel):
    term: str
    context_snippet: str

class PreviewKeyTermRequest(BaseModel):
    assignment_id: str
    term: str
    context_snippet: str


# ── Core session endpoints ────────────────────────────────────────────────────

@router.post("/")
async def start_session(body: StartSessionRequest, user=Depends(require_student), db=Depends(get_db)):
    assignment = await db.from_("assignments") \
        .select("id, class_id, paper_id, reading_guide, difficulty, status") \
        .eq("id", body.assignment_id).single().execute()
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.data["status"] != "published":
        raise HTTPException(status_code=403, detail="Assignment is not published")

    enrollment = await db.from_("class_enrollments").select("class_id") \
        .eq("class_id", assignment.data["class_id"]).eq("student_id", user["sub"]).single().execute()
    if not enrollment.data:
        raise HTTPException(status_code=403, detail="Not enrolled in this class")

    existing = await db.from_("student_sessions") \
        .select("id, status, current_section_index") \
        .eq("student_id", user["sub"]).eq("assignment_id", body.assignment_id).single().execute()

    if existing.data:
        session = existing.data
    else:
        result = await db.from_("student_sessions").insert({
            "student_id": user["sub"],
            "assignment_id": body.assignment_id,
            "status": "in_progress",
            "current_section_index": 0,
        }).execute()
        session = result.data[0]

    paper = await db.from_("papers").select("title") \
        .eq("id", assignment.data["paper_id"]).single().execute()

    return {
        "session_id": session["id"],
        "assignment_id": body.assignment_id,
        "status": session["status"],
        "current_section_index": session["current_section_index"],
        "reading_guide": assignment.data["reading_guide"],
        "paper_title": paper.data["title"] if paper.data else "Unknown",
        "difficulty": assignment.data["difficulty"],
    }


@router.get("/")
async def list_sessions(user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("student_sessions") \
        .select("id, assignment_id, status, current_section_index") \
        .eq("student_id", user["sub"]).execute()
    return result.data or []


@router.get("/{session_id}")
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


@router.patch("/{session_id}/progress")
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
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    feedback = await generate_checkpoint_feedback(section_title, guiding_questions, student_text)
    supa.table("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()


async def _run_sowhat_feedback(
    sowhat_id: str,
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    feedback = await generate_sowhat_feedback(paper_title, section_titles, difficulty, student_text)
    supa.table("sowhat_responses").update({"ai_feedback": feedback}).eq("id", sowhat_id).execute()


async def _run_jargon_explanation(
    lookup_id: str,
    term: str,
    context_snippet: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    explanation = await generate_jargon_explanation(term, context_snippet)
    supa.table("jargon_lookups").update({"explanation": explanation}).eq("id", lookup_id).execute()


# ── Checkpoint ────────────────────────────────────────────────────────────────

@router.post("/{session_id}/checkpoint")
async def submit_checkpoint(
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

@router.post("/{session_id}/sowhat")
async def submit_sowhat(
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
