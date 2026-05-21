from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student
from backend.rate_limit import limiter

router = APIRouter()


class JoinRequest(BaseModel):
    class_code: str


@router.post("/join")
@limiter.limit("20/minute")
async def join_class(request: Request, body: JoinRequest, user=Depends(require_student), db=Depends(get_db)):
    # Look up class by code (case-insensitive)
    cls = await db.from_("classes").select("id, name, teacher_id") \
        .eq("class_code", body.class_code.upper()).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    class_id = cls.data["id"]

    # Check not already enrolled
    existing = await db.from_("class_enrollments").select("class_id") \
        .eq("class_id", class_id).eq("student_id", user["sub"]).single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Already enrolled in this class")

    # Get student display name
    profile = await db.from_("user_profiles").select("name") \
        .eq("user_id", user["sub"]).single().execute()
    student_name = profile.data["name"] if profile.data else "Student"

    await db.from_("class_enrollments").insert({
        "class_id": class_id,
        "student_id": user["sub"],
        "student_name": student_name,
    }).execute()

    return {"class_id": class_id, "class_name": cls.data["name"]}


@router.get("/classes")
async def list_enrolled_classes(user=Depends(require_student), db=Depends(get_db)):
    enrollments = await db.from_("class_enrollments").select("class_id, enrolled_at") \
        .eq("student_id", user["sub"]).execute()
    if not enrollments.data:
        return []

    class_ids = [e["class_id"] for e in enrollments.data]
    enrollment_map = {e["class_id"]: e["enrolled_at"] for e in enrollments.data}

    classes = await db.from_("classes").select("id, name, class_code, teacher_id") \
        .in_("id", class_ids).execute()
    if not classes.data:
        return []

    class_map = {c["id"]: c for c in classes.data}
    teacher_ids = list({c["teacher_id"] for c in classes.data})

    teachers = await db.from_("user_profiles").select("user_id, name") \
        .in_("user_id", teacher_ids).execute()
    teacher_map = {t["user_id"]: t["name"] for t in (teachers.data or [])}

    assignments = await db.from_("assignments").select("id, class_id, paper_id, difficulty, created_at") \
        .in_("class_id", class_ids).eq("status", "published").execute()

    paper_ids = list({a["paper_id"] for a in (assignments.data or [])})
    if paper_ids:
        papers = await db.from_("papers").select("id, title").in_("id", paper_ids).execute()
        paper_map = {p["id"]: p["title"] for p in (papers.data or [])}
    else:
        paper_map = {}

    assignment_map: dict = {}
    for a in (assignments.data or []):
        assignment_map.setdefault(a["class_id"], []).append({
            "id": a["id"],
            "paper_title": paper_map.get(a["paper_id"], "Unknown"),
            "difficulty": a["difficulty"],
            "created_at": a["created_at"],
        })

    return [
        {
            "class_id": cid,
            "class_name": class_map[cid]["name"],
            "class_code": class_map[cid]["class_code"],
            "teacher_name": teacher_map.get(class_map[cid]["teacher_id"], "Unknown"),
            "enrolled_at": enrollment_map[cid],
            "assignments": assignment_map.get(cid, []),
        }
        for cid in class_ids if cid in class_map
    ]


@router.delete("/classes/{class_id}")
async def leave_class(class_id: str, user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("class_enrollments").delete() \
        .eq("class_id", class_id).eq("student_id", user["sub"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return {"ok": True}
