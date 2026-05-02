from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from backend.deps import require_teacher
from backend.ai_provider import generate_class_insights

router = APIRouter()


@router.get("/classes/{class_id}/progress")
async def get_class_progress(class_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    """
    Return all students in the class and their progress on each published assignment.
    """
    cls = await db.from_("classes").select("id, name") \
        .eq("id", class_id).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    enrollments = await db.from_("class_enrollments") \
        .select("student_id, student_name") \
        .eq("class_id", class_id).execute()

    assignments = await db.from_("assignments") \
        .select("id, status, difficulty, created_at, reading_guide") \
        .eq("class_id", class_id).eq("status", "published").execute()

    assignment_ids = [a["id"] for a in (assignments.data or [])]

    if assignment_ids:
        sessions = await db.from_("student_sessions") \
            .select("student_id, assignment_id, status, current_section_index, completed_at") \
            .in_("assignment_id", assignment_ids).execute()
    else:
        sessions = type("R", (), {"data": []})()

    sessions_by_student = {}
    for s in (sessions.data or []):
        sessions_by_student.setdefault(s["student_id"], []).append(s)

    students_progress = []
    for enrollment in (enrollments.data or []):
        sid = enrollment["student_id"]
        student_sessions = sessions_by_student.get(sid, [])
        students_progress.append({
            "student_id": sid,
            "student_name": enrollment["student_name"],
            "sessions": student_sessions,
        })

    return {
        "class": cls.data,
        "assignments": assignments.data or [],
        "students": students_progress,
    }


@router.get("/assignments/{assignment_id}/students/{student_id}/responses")
async def get_student_responses(
    assignment_id: str,
    student_id: str,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    """Return all checkpoint responses and the So What response for one student on one assignment."""
    asn = await db.from_("assignments").select("class_id") \
        .eq("id", assignment_id).single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = await db.from_("classes").select("id") \
        .eq("id", asn.data["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    session = await db.from_("student_sessions") \
        .select("id, status, current_section_index, started_at, completed_at") \
        .eq("assignment_id", assignment_id).eq("student_id", student_id).single().execute()

    if not session.data:
        return {"session": None, "checkpoints": [], "sowhat": None}

    checkpoints = await db.from_("checkpoint_responses") \
        .select("section_index, student_text, ai_feedback, submitted_at") \
        .eq("session_id", session.data["id"]) \
        .order("section_index").execute()

    sowhat = await db.from_("sowhat_responses") \
        .select("student_text, ai_feedback, submitted_at") \
        .eq("session_id", session.data["id"]).single().execute()

    return {
        "session": session.data,
        "checkpoints": checkpoints.data or [],
        "sowhat": sowhat.data,
    }


@router.get("/assignments/{assignment_id}/insights")
async def get_insights(assignment_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    """
    Return class-wide insights for this assignment.
    If insights don't exist yet, generate them from all student checkpoint responses.
    """
    asn = await db.from_("assignments") \
        .select("id, class_id, reading_guide") \
        .eq("id", assignment_id).single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = await db.from_("classes").select("id") \
        .eq("id", asn.data["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Return cached insights if they exist
    cached = await db.from_("assignment_insights").select("insights, generated_at") \
        .eq("assignment_id", assignment_id).single().execute()
    if cached.data:
        return cached.data

    # Generate insights from all student responses
    sections = asn.data["reading_guide"].get("sections", [])
    section_insights = []

    # Scope responses to sessions for THIS assignment only.
    # checkpoint_responses lacks assignment_id, so we filter via session_id IN (sessions for this assignment).
    sessions_for_assignment = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).execute()
    session_ids = [s["id"] for s in (sessions_for_assignment.data or [])]

    for idx, section in enumerate(sections):
        if not session_ids:
            response_texts: list[str] = []
        else:
            responses_result = await db.from_("checkpoint_responses") \
                .select("student_text, session_id") \
                .eq("section_index", idx) \
                .in_("session_id", session_ids) \
                .execute()
            response_texts = [r["student_text"] for r in (responses_result.data or [])]

        if len(response_texts) < 2:
            section_insights.append({
                "title": section.get("title", f"Section {idx + 1}"),
                "common_misconception": "Not enough responses yet to identify patterns.",
                "commonly_grasped": "Not enough responses yet.",
                "student_count": len(response_texts),
            })
            continue

        insight = await generate_class_insights(
            section_title=section.get("title", f"Section {idx + 1}"),
            responses=response_texts,
        )
        section_insights.append({
            "title": section.get("title", f"Section {idx + 1}"),
            **insight,
        })

    insights_payload = {"sections": section_insights}
    result = await db.from_("assignment_insights").upsert({
        "assignment_id": assignment_id,
        "insights": insights_payload,
    }, on_conflict="assignment_id").execute()

    return {"insights": insights_payload, "generated_at": result.data.get("generated_at") if result.data else None}
