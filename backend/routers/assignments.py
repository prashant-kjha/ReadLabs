from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from backend.db import get_db
from backend.deps import require_teacher
from backend.ai_provider import generate_reading_guide
from backend.schemas.assignments import CreateAssignmentRequest, UpdateAssignmentRequest

router = APIRouter()


def _one(data):
    """Normalize Supabase .single() data which may be a dict or a list."""
    if isinstance(data, list):
        return data[0] if data else None
    return data


async def _process_assignment(assignment_id: str, extracted_text: str, figure_count: int) -> None:
    """Background task: call Gemini and store reading guide + superpowers data."""
    db = get_db()
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        # A valid reading guide must carry a list of sections; otherwise the
        # student reading page has nothing to render. Treat a malformed result
        # as a generation failure (handled by the except branch below).
        if not isinstance(full_result.get("sections"), list):
            raise ValueError("reading guide missing list 'sections'")

        critical_prompts = full_result.pop("critical_prompts", [])

        await db.from_("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "draft",
        }).eq("id", assignment_id).execute()

        if critical_prompts:
            for prompt in critical_prompts:
                prompt["assignment_id"] = assignment_id
            await db.from_("critical_prompts").insert(critical_prompts).execute()

    except Exception as e:
        await db.from_("assignments").update({
            "status": "draft",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()



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
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")
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

    if body.status is not None and body.status not in ("draft", "published"):
        raise HTTPException(status_code=400, detail="status must be 'draft' or 'published'")

    if body.reading_guide is not None and not isinstance(body.reading_guide.get("sections"), list):
        raise HTTPException(status_code=400, detail="reading_guide must contain a list 'sections'")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.from_("assignments").update(updates).eq("id", assignment_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update assignment")
    return result.data[0]
