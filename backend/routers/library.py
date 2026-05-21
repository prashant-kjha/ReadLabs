import uuid
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks, Request
from backend.db import get_db, storage_headers
from backend.deps import require_student
from backend.services.paper_service import extract_text_and_figures
from backend.services.core_api import search_core, fetch_core_full_text
from backend.ai_provider import generate_reading_guide
from backend.config import get_settings
from backend.rate_limit import limiter
from backend.schemas.library import (
    FetchCoreRequest,
    LibraryUploadResponse,
    LibraryStatusResponse,
    LibraryPaperResponse,
    CoreSearchResult,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


async def _process_self_study(
    assignment_id: str,
    extracted_text: str,
    figure_count: int,
) -> None:
    """Background task: generate reading guide for self-study paper, auto-publish."""
    db = get_db()
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        critical_prompts = full_result.pop("critical_prompts", [])

        await db.from_("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "published",
        }).eq("id", assignment_id).execute()

        if critical_prompts:
            for prompt in critical_prompts:
                prompt["assignment_id"] = assignment_id
            await db.from_("critical_prompts").insert(critical_prompts).execute()

    except Exception as e:
        logger.error("Self-study guide generation failed: %s", e)
        await db.from_("assignments").update({
            "status": "published",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()


@router.post("/upload", response_model=LibraryUploadResponse)
@limiter.limit("10/hour")
async def upload_paper(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(default=""),
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

    # Upload to Supabase Storage via httpx
    object_path = f"self-study/{user['sub']}/{uuid.uuid4()}.pdf"
    storage_url = f"{get_settings().supabase_url}/storage/v1/object/papers/{object_path}"
    upload_headers = {**storage_headers(), "Content-Type": "application/pdf"}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(storage_url, headers=upload_headers, content=pdf_bytes)
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"Failed to store PDF: {r.text}")

    # Insert paper
    paper_result = await db.from_("papers").insert({
        "title": paper_title,
        "extracted_text": extracted["text"],
        "figures": extracted["figures"],
        "pdf_path": f"papers/{object_path}",
        "uploaded_by": user["sub"],
    }).execute()

    if not paper_result.data:
        raise HTTPException(status_code=500, detail=f"Failed to create paper record: {paper_result.error}")
    paper = paper_result.data[0]

    # Create self-study assignment (class_id=null)
    assignment_result = await db.from_("assignments").insert({
        "class_id": None,
        "paper_id": paper["id"],
        "status": "processing",
    }).execute()

    if not assignment_result.data:
        raise HTTPException(status_code=500, detail=f"Failed to create assignment: {assignment_result.error}")
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


@router.get("/status/{assignment_id}", response_model=LibraryStatusResponse)
async def get_status(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Poll reading guide generation status."""
    result = await db.from_("assignments") \
        .select("id, status, reading_guide, difficulty") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result.data


@router.get("/search", response_model=list[CoreSearchResult])
async def search_papers(q: str = "", user=Depends(require_student)):
    """Search CORE API for open-access papers. Results are title-verified."""
    if not q.strip():
        return []
    results = await search_core(q.strip())
    return results


@router.get("/browse", response_model=list[LibraryPaperResponse])
async def browse_papers(
    category: str = "",
    limit: int = 20,
    offset: int = 0,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Browse the current user's self-study papers.
    Scoped to the caller — never expose other users' uploads."""
    result = await db.from_("papers") \
        .select("id, title, uploaded_by, created_at") \
        .eq("uploaded_by", user["sub"]) \
        .order("created_at", desc=True) \
        .limit(min(limit, 50)).execute()

    papers = result.data or []

    # Attach assignment status for each paper (has reading guide been generated?)
    paper_ids = [p["id"] for p in papers]
    if paper_ids:
        assignments = await db.from_("assignments") \
            .select("id, paper_id, status, difficulty") \
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
@limiter.limit("20/hour")
async def fetch_core_paper(
    request: Request,
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

    # Insert paper. core_id enables dedup on subsequent /library/fetch calls
    # for the same CORE record.
    paper_result = await db.from_("papers").insert({
        "title": core_data["title"],
        "extracted_text": core_data["full_text"],
        "figures": [],
        "uploaded_by": user["sub"],
        "core_id": core_data["core_id"],
    }).execute()
    if not paper_result.data:
        raise HTTPException(status_code=500, detail="Failed to create paper record")
    paper = paper_result.data[0]

    # Create assignment
    assignment_result = await db.from_("assignments").insert({
        "class_id": None,
        "paper_id": paper["id"],
        "status": "processing",
    }).execute()
    if not assignment_result.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")
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


# /categories endpoint removed 2026-05-01: was a stub returning [] — the
# `category` taxonomy was never implemented in the schema. Re-add this when
# you add a category column and decide on the taxonomy.
