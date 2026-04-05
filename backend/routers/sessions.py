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
