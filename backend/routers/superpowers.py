from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from typing import Optional
from supabase import create_client as _supabase_client
from backend.db import get_db
from backend.deps import require_student
from backend.rate_limit import limiter
from backend.ai_provider import (
    generate_annotation_socratic_prompt,
    generate_quiz_questions,
    grade_short_answer,
)
from backend.config import get_settings
from backend.schemas.superpowers import (
    CreateAnnotationRequest, UpdateAnnotationRequest,
    XpRequest, QuizAttemptRequest,
)

router = APIRouter()
settings = get_settings()

UTC = timezone.utc


# ── XP Constants ──────────────────────────────────────────────────────────────

XP_BY_ACTION = {
    "section": 5,
    "checkpoint": 10,
    "sowhat": 15,
    "daily": 20,
    "quiz_correct": 25,
}

LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000]


def compute_level(xp: int) -> int:
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
    return level


# ── Annotations ───────────────────────────────────────────────────────────────

@router.get("/annotations/{session_id}")
async def list_annotations(session_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.from_("annotations").select("*") \
        .eq("session_id", session_id).execute()
    return result.data or []


@router.post("/annotations")
async def create_annotation(body: CreateAnnotationRequest, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("id", body.session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.from_("annotations").insert({
        "session_id": body.session_id,
        "section_index": body.section_index,
        "start_char": body.start_char,
        "end_char": body.end_char,
        "highlight_text": body.highlight_text,
        "color": body.color,
        "category": body.category,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save annotation")
    return result.data[0]


@router.patch("/annotations/{annotation_id}")
async def update_annotation(
    annotation_id: str, body: UpdateAnnotationRequest,
    user=Depends(require_student), db=Depends(get_db),
):
    annotation = await db.from_("annotations").select("session_id") \
        .eq("id", annotation_id).single().execute()
    if not annotation.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    session = await db.from_("student_sessions").select("id") \
        .eq("id", annotation.data["session_id"]).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="Not your annotation")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    await db.from_("annotations").update(updates).eq("id", annotation_id).execute()
    return {"ok": True}


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(annotation_id: str, user=Depends(require_student), db=Depends(get_db)):
    annotation = await db.from_("annotations").select("session_id") \
        .eq("id", annotation_id).single().execute()
    if not annotation.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    session = await db.from_("student_sessions").select("id") \
        .eq("id", annotation.data["session_id"]).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="Not your annotation")

    await db.from_("annotations").delete().eq("id", annotation_id).execute()
    return {"ok": True}


@router.post("/annotations/{annotation_id}/ai-prompt")
@limiter.limit("60/minute")
async def get_annotation_ai_prompt(
    request: Request,
    annotation_id: str, user=Depends(require_student), db=Depends(get_db),
):
    annotation = await db.from_("annotations").select("session_id, highlight_text, section_index") \
        .eq("id", annotation_id).single().execute()
    if not annotation.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    ann = annotation.data
    session = await db.from_("student_sessions").select("id, assignment_id") \
        .eq("id", ann["session_id"]).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="Not your annotation")

    assignment = await db.from_("assignments").select("reading_guide") \
        .eq("id", session.data["assignment_id"]).single().execute()
    sections = assignment.data["reading_guide"]["sections"]
    section_title = sections[ann["section_index"]]["title"] if ann["section_index"] < len(sections) else "Unknown"

    prompt = await generate_annotation_socratic_prompt(ann["highlight_text"], section_title)
    await db.from_("annotations").update({"ai_prompt_shown": True}).eq("id", annotation_id).execute()
    return {"prompt": prompt}


# ── Methodology ───────────────────────────────────────────────────────────────

@router.get("/methodology/{assignment_id}/{section_index}")
async def get_methodology_elements(
    assignment_id: str, section_index: int,
    user=Depends(require_student), db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    result = await db.from_("methodology_elements").select("*") \
        .eq("assignment_id", assignment_id).eq("section_index", section_index).execute()
    return result.data or []


# ── Critical Prompts ──────────────────────────────────────────────────────────

@router.get("/critical-prompts/{assignment_id}/{section_index}")
async def get_critical_prompt(
    assignment_id: str, section_index: int,
    user=Depends(require_student), db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    result = await db.from_("critical_prompts").select("*") \
        .eq("assignment_id", assignment_id).eq("section_index", section_index).single().execute()
    return result.data


# ── Quiz ─────────────────────────────────────────────────────────────────────

@router.get("/quiz/{assignment_id}")
async def get_quiz(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    questions = await db.from_("quiz_questions").select("*") \
        .eq("assignment_id", assignment_id).execute()
    return questions.data or []


@router.post("/quiz/{assignment_id}/generate")
@limiter.limit("10/hour")
async def generate_quiz(request: Request, assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    existing = await db.from_("quiz_questions").select("id") \
        .eq("assignment_id", assignment_id).execute()
    if existing.data:
        questions = await db.from_("quiz_questions").select("*") \
            .eq("assignment_id", assignment_id).execute()
        return questions.data

    assign_full = await db.from_("assignments").select("reading_guide, difficulty, paper_id") \
        .eq("id", assignment_id).single().execute()
    if not assign_full.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    paper_result = await db.from_("papers").select("title") \
        .eq("id", assign_full.data["paper_id"]).single().execute()
    paper_title = paper_result.data["title"] if paper_result.data else "Unknown"

    sections = assign_full.data["reading_guide"]["sections"]
    difficulty = assign_full.data.get("difficulty", "intermediate")

    questions = await generate_quiz_questions(paper_title, sections, difficulty)
    rows = [{**q, "assignment_id": assignment_id} for q in questions]
    result = await db.from_("quiz_questions").insert(rows).execute()
    return result.data or []


@router.post("/quiz/attempt")
@limiter.limit("30/hour")
async def submit_quiz_attempt(request: Request, body: QuizAttemptRequest, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", body.assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    questions = await db.from_("quiz_questions").select("*") \
        .eq("assignment_id", body.assignment_id).execute()
    if not questions.data:
        raise HTTPException(status_code=404, detail="Quiz not generated yet")

    total_score = 0
    max_score = 0
    results = []

    for q in questions.data:
        student_answer = body.answers.get(q["id"], "")
        if q["question_type"] == "multiple_choice":
            max_score += 1
            correct = student_answer.strip() == (q["correct_answer"] or "").strip()
            score = 1 if correct else 0
            total_score += score
            results.append({
                "question_id": q["id"],
                "score": score,
                "max": 1,
                "correct_answer": q["correct_answer"],
                "explanation": q["explanation"],
            })
        else:
            max_score += 2
            grading = await grade_short_answer(q["question_text"], q["correct_answer"] or "", student_answer)
            total_score += grading["score"]
            results.append({
                "question_id": q["id"],
                "score": grading["score"],
                "max": 2,
                "correct_answer": q["correct_answer"],
                "explanation": grading["explanation"],
            })

    await db.from_("quiz_attempts").insert({
        "student_id": user["sub"],
        "assignment_id": body.assignment_id,
        "answers": body.answers,
        "score": total_score,
        "max_score": max_score,
    }).execute()

    return {"score": total_score, "max_score": max_score, "results": results}


# ── Reading Stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("reading_stats").select("*") \
        .eq("student_id", user["sub"]).single().execute()
    if not result.data:
        return {
            "student_id": user["sub"], "papers_read": 0, "quizzes_passed": 0,
            "current_streak": 0, "longest_streak": 0, "last_read_at": None,
            "level": 1, "xp": 0, "total_sections_completed": 0,
            "checkpoints_completed": 0, "average_comprehension_score": 0,
        }
    return result.data


@router.post("/stats/xp")
async def add_xp(body: XpRequest, user=Depends(require_student), db=Depends(get_db)):
    if body.action not in XP_BY_ACTION:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    earned_xp = XP_BY_ACTION[body.action]

    existing = await db.from_("reading_stats").select("*") \
        .eq("student_id", user["sub"]).single().execute()

    now = datetime.now(UTC)
    today = now.date()

    if not existing.data:
        bonus = XP_BY_ACTION["daily"] if body.action != "daily" else 0
        new_xp = earned_xp + bonus
        new_level = compute_level(new_xp)
        await db.from_("reading_stats").insert({
            "student_id": user["sub"],
            "xp": new_xp,
            "level": new_level,
            "current_streak": 1,
            "longest_streak": 1,
            "last_read_at": now.isoformat(),
            "total_sections_completed": 1 if body.action == "section" else 0,
            "checkpoints_completed": 1 if body.action == "checkpoint" else 0,
        }).execute()
        return {"xp": new_xp, "level": new_level, "streak": 1, "xp_earned": new_xp}

    stats = existing.data
    last_read_at = stats.get("last_read_at")
    last_date = datetime.fromisoformat(last_read_at).date() if last_read_at else None

    current_streak = stats["current_streak"]
    longest_streak = stats["longest_streak"]
    daily_bonus = 0

    if last_date is None or last_date != today:
        if body.action != "daily":
            daily_bonus = XP_BY_ACTION["daily"]

        if last_date is None:
            current_streak = 1
        elif (today - last_date).days == 1:
            current_streak += 1
        else:
            current_streak = 1
        longest_streak = max(current_streak, longest_streak)

    new_xp = stats["xp"] + earned_xp + daily_bonus
    new_level = compute_level(new_xp)

    updates = {
        "xp": new_xp,
        "level": new_level,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "last_read_at": now.isoformat(),
    }
    if body.action == "section":
        updates["total_sections_completed"] = stats["total_sections_completed"] + 1
    elif body.action == "checkpoint":
        updates["checkpoints_completed"] = stats["checkpoints_completed"] + 1

    await db.from_("reading_stats").update(updates).eq("student_id", user["sub"]).execute()
    return {"xp": new_xp, "level": new_level, "streak": current_streak, "xp_earned": earned_xp + daily_bonus}


# ── Recommendations ────────────────────────────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations(user=Depends(require_student), db=Depends(get_db)):
    """Recommend self-study papers the user has uploaded but not yet started reading.

    Uses only columns that exist in the current schema. A "self-study" paper is
    one whose assignment has class_id IS NULL (the convention set by /library/upload
    and /library/fetch). To preserve privacy, we only recommend papers the *current*
    user uploaded — we don't expose other users' uploads.
    """
    # Assignments the student has already started a session for (any status)
    sessions = await db.from_("student_sessions").select("assignment_id") \
        .eq("student_id", user["sub"]).execute()
    started_assignment_ids = {s["assignment_id"] for s in (sessions.data or [])}

    # Papers the current user uploaded
    user_papers = await db.from_("papers").select("id, title") \
        .eq("uploaded_by", user["sub"]).execute()
    paper_map = {p["id"]: p for p in (user_papers.data or [])}
    if not paper_map:
        return []

    # Self-study assignments (class_id IS NULL) for those papers, published only
    assignments = await db.from_("assignments") \
        .select("id, paper_id, status, created_at") \
        .in_("paper_id", list(paper_map.keys())) \
        .is_("class_id", "null") \
        .eq("status", "published") \
        .order("created_at", desc=True) \
        .execute()

    candidates = [
        a for a in (assignments.data or [])
        if a["id"] not in started_assignment_ids and a["paper_id"] in paper_map
    ][:3]

    return [
        {
            "paper": {
                "id": paper_map[a["paper_id"]]["id"],
                "title": paper_map[a["paper_id"]]["title"],
            },
            "assignment_id": a["id"],
            "reason": "You haven't started reading this yet",
        }
        for a in candidates
    ]
