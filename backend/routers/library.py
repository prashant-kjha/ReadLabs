import uuid
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from supabase import create_client as _supabase_client
from backend.db import get_db
from backend.deps import require_student
from backend.services.paper_service import extract_text_and_figures
from backend.services.core_api import search_core, fetch_core_full_text
from backend.ai_provider import generate_reading_guide
from backend.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


def _get_storage_client():
    return _supabase_client(settings.supabase_url, settings.supabase_service_role_key)


async def _process_self_study(
    assignment_id: str,
    extracted_text: str,
    figure_count: int,
) -> None:
    """Background task: generate reading guide for self-study paper, auto-publish."""
    sb = _get_storage_client()
    try:
        reading_guide = await generate_reading_guide(extracted_text, figure_count)
        sb.table("assignments").update({
            "reading_guide": reading_guide,
            "difficulty": reading_guide.get("difficulty", "intermediate"),
            "status": "published",  # skip draft — auto-publish
        }).eq("id", assignment_id).execute()

        # Update paper category from AI difficulty if not set
        # (category is set by user on upload or auto-detected)
    except Exception as e:
        logger.error("Self-study guide generation failed: %s", e)
        sb.table("assignments").update({
            "status": "published",  # still publish so student can see error
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()


@router.post("/upload")
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    category: str = Form(default=""),
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Student uploads a PDF for self-study. Auto-generates reading guide."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF must be under 20 MB")

    extracted = extract_text_and_figures(pdf_bytes)

    paper_title = title.strip() or (
        file.filename.replace(".pdf", "").replace("_", " ") if file.filename else "Untitled"
    )

    # Upload to Supabase Storage
    object_path = f"self-study/{user['sub']}/{uuid.uuid4()}.pdf"

    def _do_upload():
        client = _get_storage_client()
        client.storage.from_("papers").upload(
            object_path,
            pdf_bytes,
            {"content-type": "application/pdf", "upsert": "false"},
        )

    try:
        await asyncio.to_thread(_do_upload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store PDF: {e}")

    # Insert paper
    paper_result = await db.from_("papers").insert({
        "title": paper_title,
        "extracted_text": extracted["text"],
        "figures": extracted["figures"],
        "pdf_path": f"papers/{object_path}",
        "uploaded_by": user["sub"],
        "is_self_study": True,
        "category": category.strip() or None,
        "source": "upload",
    }).execute()

    paper = paper_result.data[0]

    # Create self-study assignment (class_id=null)
    assignment_result = await db.from_("assignments").insert({
        "class_id": None,
        "paper_id": paper["id"],
        "status": "processing",
    }).execute()
    assignment = assignment_result.data[0]

    # Trigger background guide generation
    background_tasks.add_task(
        _process_self_study,
        assignment_id=assignment["id"],
        extracted_text=extracted["text"],
        figure_count=len(extracted["figures"]),
    )

    return {
        "assignment_id": assignment["id"],
        "paper_id": paper["id"],
        "title": paper_title,
        "status": "processing",
    }


@router.get("/status/{assignment_id}")
async def get_status(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Poll reading guide generation status."""
    result = await db.from_("assignments") \
        .select("id, status, reading_guide, difficulty") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result.data
