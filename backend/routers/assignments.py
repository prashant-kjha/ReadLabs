from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from supabase import create_client as _supabase_client
from backend.db import get_db
from backend.deps import require_teacher
from backend.ai_provider import generate_reading_guide
from backend.config import get_settings

router = APIRouter()
settings = get_settings()


def _one(data):
    """Normalize Supabase .single() data which may be a dict or a list."""
    if isinstance(data, list):
        return data[0] if data else None
    return data


async def _process_assignment(assignment_id: str, extracted_text: str, figure_count: int) -> None:
    """Background task: call Gemini and store reading guide + superpowers data."""
    sb = _supabase_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        methodology_elements = full_result.pop("methodology_elements", [])
        critical_prompts = full_result.pop("critical_prompts", [])

        sb.table("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "draft",
        }).eq("id", assignment_id).execute()

        if methodology_elements:
            for elem in methodology_elements:
                elem["assignment_id"] = assignment_id
            sb.table("methodology_elements").insert(methodology_elements).execute()

        if critical_prompts:
            for prompt in critical_prompts:
                prompt["assignment_id"] = assignment_id
            sb.table("critical_prompts").insert(critical_prompts).execute()

    except Exception as e:
        sb.table("assignments").update({
            "status": "draft",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()


class CreateAssignmentRequest(BaseModel):
    class_id: str
    paper_id: str


class UpdateAssignmentRequest(BaseModel):
    reading_guide: Optional[dict] = None
    difficulty: Optional[str] = None
    status: Optional[str] = None


@router.post("/")
async def create_assignment(
    body: CreateAssignmentRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    cls = await db.from_("classes").select("id") \
        .eq("id", body.class_id).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Class not found or not yours")

    paper = await db.from_("papers").select("id, extracted_text, figures") \
        .eq("id", body.paper_id).eq("uploaded_by", user["sub"]).single().execute()
    if not paper.data:
        raise HTTPException(status_code=403, detail="Paper not found or not yours")

    result = await db.from_("assignments").insert({
        "class_id": body.class_id,
        "paper_id": body.paper_id,
        "status": "processing",
    }).execute()
    assignment = result.data[0]

    paper_record = _one(paper.data)
    figure_count = len(paper_record.get("figures") or [])
    background_tasks.add_task(
        _process_assignment,
        assignment["id"],
        paper_record.get("extracted_text") or "",
        figure_count,
    )
    return assignment


@router.get("/{assignment_id}")
async def get_assignment(assignment_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("assignments") \
        .select("id, class_id, paper_id, reading_guide, status, difficulty, created_at") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment_record = _one(result.data)
    cls = await db.from_("classes").select("id") \
        .eq("id", assignment_record["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    return assignment_record


@router.patch("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    body: UpdateAssignmentRequest,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    existing = await db.from_("assignments").select("class_id, status") \
        .eq("id", assignment_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    existing_record = _one(existing.data)
    cls = await db.from_("classes").select("id") \
        .eq("id", existing_record["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    if existing_record["status"] == "published":
        raise HTTPException(status_code=400, detail="Cannot modify a published assignment")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.from_("assignments").update(updates).eq("id", assignment_id).execute()
    return result.data[0]
