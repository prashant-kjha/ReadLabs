import secrets
import string
from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from backend.deps import require_teacher
from backend.schemas.classes import CreateClassRequest

router = APIRouter()

_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _make_code(length: int = 6) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


@router.post("/")
async def create_class(body: CreateClassRequest, user=Depends(require_teacher), db=Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Class name cannot be empty")

    for _ in range(5):
        code = _make_code()
        existing = await db.from_("classes").select("id").eq("class_code", code).execute()
        if not existing.data:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique class code")

    result = await db.from_("classes").insert({
        "teacher_id": user["sub"],
        "name": body.name.strip(),
        "class_code": code,
    }).execute()
    return result.data[0]


@router.get("/")
async def list_classes(user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("classes") \
        .select("id, name, class_code, created_at") \
        .eq("teacher_id", user["sub"]) \
        .order("created_at", desc=True) \
        .execute()
    return result.data or []


@router.get("/{class_id}")
async def get_class(class_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    cls = await db.from_("classes") \
        .select("id, name, class_code, created_at") \
        .eq("id", class_id) \
        .eq("teacher_id", user["sub"]) \
        .single() \
        .execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    enrollments = await db.from_("class_enrollments") \
        .select("student_id, student_name, enrolled_at") \
        .eq("class_id", class_id) \
        .execute()

    return {**cls.data, "students": enrollments.data or []}


@router.delete("/{class_id}/students/{student_id}")
async def remove_student(
    class_id: str,
    student_id: str,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    cls = await db.from_("classes").select("id") \
        .eq("id", class_id).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    await db.from_("class_enrollments") \
        .delete() \
        .eq("class_id", class_id) \
        .eq("student_id", student_id) \
        .execute()
    return {"ok": True}
