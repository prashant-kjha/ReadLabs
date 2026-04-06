import uuid
import asyncio
import logging
from pydantic import BaseModel
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
    sb = _supabase_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        methodology_elements = full_result.pop("methodology_elements", [])
        critical_prompts = full_result.pop("critical_prompts", [])

        sb.table("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "published",
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
        logger.error("Self-study guide generation failed: %s", e)
        sb.table("assignments").update({
            "status": "published",
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
) -> dict:
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
async def get_status(assignment_id: str, user=Depends(require_student), db=Depends(get_db)) -> dict:
    """Poll reading guide generation status."""
    result = await db.from_("assignments") \
        .select("id, status, reading_guide, difficulty") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result.data


class FetchCoreRequest(BaseModel):
    core_id: str
    title: str


@router.get("/search")
async def search_papers(q: str = "", user=Depends(require_student)):
    """Search CORE API for open-access papers. Results are title-verified."""
    if not q.strip():
        return []
    results = await search_core(q.strip())
    return results


@router.get("/browse")
async def browse_papers(
    category: str = "",
    limit: int = 20,
    offset: int = 0,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Browse community library papers, optionally filtered by category."""
    query = db.from_("papers") \
        .select("id, title, authors, year_published, category, is_self_study, source, core_id, created_at") \
        .eq("is_self_study", True)

    if category.strip():
        query = query.eq("category", category.strip())

    result = await query.order("created_at", desc=True) \
        .limit(min(limit, 50)).execute()

    papers = result.data or []

    # Attach assignment status for each paper (has reading guide been generated?)
    paper_ids = [p["id"] for p in papers]
    if paper_ids:
        assignments = await db.from_("assignments") \
            .select("paper_id, status, difficulty") \
            .in_("paper_id", paper_ids).execute()
        asn_map = {a["paper_id"]: a for a in (assignments.data or [])}
    else:
        asn_map = {}

    return [
        {
            **p,
            "assignment": asn_map.get(p["id"]),
        }
        for p in papers
    ]


@router.post("/fetch")
async def fetch_core_paper(
    body: FetchCoreRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Fetch a paper from CORE API, create self-study assignment. Title-verified."""
    # Check if already in library
    existing = await db.from_("papers").select("id, title") \
        .eq("core_id", body.core_id).single().execute()

    if existing.data:
        # Paper already exists — create assignment if none
        paper = existing.data
        existing_asn = await db.from_("assignments").select("id, status") \
            .eq("paper_id", paper["id"]).is_("class_id", "null").single().execute()

        if existing_asn.data:
            return {
                "assignment_id": existing_asn.data["id"],
                "paper_id": paper["id"],
                "title": paper["title"],
                "status": existing_asn.data["status"],
            }

    # Fetch full text from CORE with title verification
    core_data = await fetch_core_full_text(body.core_id, body.title)
    if not core_data:
        raise HTTPException(
            status_code=400,
            detail="Paper title doesn't match what was selected. Please search again or upload PDF directly.",
        )

    # Insert paper
    paper_result = await db.from_("papers").insert({
        "title": core_data["title"],
        "extracted_text": core_data["full_text"],
        "figures": [],
        "uploaded_by": user["sub"],
        "is_self_study": True,
        "category": None,  # will be set by AI during guide generation
        "source": "core_api",
        "core_id": core_data["core_id"],
        "authors": core_data.get("authors"),
        "year_published": core_data.get("year_published"),
    }).execute()
    paper = paper_result.data[0]

    # Create assignment
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
        extracted_text=core_data["full_text"] or "",
        figure_count=0,
    )

    return {
        "assignment_id": assignment["id"],
        "paper_id": paper["id"],
        "title": core_data["title"],
        "status": "processing",
    }


@router.get("/categories")
async def list_categories(user=Depends(require_student), db=Depends(get_db)):
    """List all categories that have papers in the library."""
    result = await db.from_("papers") \
        .select("category") \
        .eq("is_self_study", True) \
        .order("category").execute()

    cats = list({p["category"] for p in (result.data or []) if p["category"]})
    return cats
