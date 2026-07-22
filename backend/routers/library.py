import asyncio
import uuid
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks, Request
from backend.db import get_db, storage_headers
from backend.deps import require_student, require_teacher
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
    LandmarkPaper,
    LandmarkLevel,
    LandmarkLibraryResponse,
    AssignLandmarkRequest,
    AssignLandmarkResponse,
    LandmarkProgressItem,
    LandmarkProgressResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB

LANDMARK_PAGE_SIZE = 24
LANDMARK_FEATURED_TITLES = [
    "Attention Is All You Need",
    "Deep Residual Learning for Image Recognition",
    "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    "Generative Adversarial Networks",
    "Denoising Diffusion Probabilistic Models",
    "Playing Atari with Deep Reinforcement Learning",
]
_DIFFICULTY_ORDER = ["beginner", "intermediate", "advanced"]


def _difficulty_rank(difficulty: str | None) -> int:
    return _DIFFICULTY_ORDER.index(difficulty) if difficulty in _DIFFICULTY_ORDER else 99


async def _landmark_papers_with_levels(db, papers: list[dict]) -> list[LandmarkPaper]:
    """Attach each paper's published landmark (class_id IS NULL) difficulty levels,
    sorted beginner -> advanced. Shared by the list and featured endpoints.

    Papers with no published level are dropped: there is nothing to read, and the
    card would render with a dead disabled button. This is what makes
    unpublishing a landmark paper's guides remove it from the library.
    """
    paper_ids = [p["id"] for p in papers]
    levels_by_paper: dict[str, list[dict]] = {pid: [] for pid in paper_ids}
    if paper_ids:
        asn_res = await db.from_("assignments").select("id, paper_id, difficulty") \
            .in_("paper_id", paper_ids).eq("status", "published").is_("class_id", "null").execute()
        for a in (asn_res.data or []):
            levels_by_paper.setdefault(a["paper_id"], []).append(
                {"difficulty": a["difficulty"], "assignment_id": a["id"]}
            )
    return [
        LandmarkPaper(
            paper_id=p["id"],
            title=p["title"],
            created_at=p.get("created_at"),
            levels=sorted(
                levels_by_paper[p["id"]],
                key=lambda lvl: _difficulty_rank(lvl["difficulty"]),
            ),
        )
        for p in papers
        if levels_by_paper.get(p["id"])
    ]


async def _copy_child_rows(db, table: str, source_id: str, new_id: str) -> None:
    """Copy critical_prompts / quiz_questions rows from a source assignment to a
    new one. Drops the source primary key (so the insert gets fresh ids) and
    re-points assignment_id. No-op when the source has none."""
    res = await db.from_(table).select("*").eq("assignment_id", source_id).execute()
    rows = res.data or []
    if not rows:
        return
    for row in rows:
        row.pop("id", None)
        row["assignment_id"] = new_id
    await db.from_(table).insert(rows).execute()


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

    extracted = await asyncio.to_thread(extract_text_and_figures, pdf_bytes)

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
        logger.error("storage upload failed (%s): %s", r.status_code, r.text[:300])
        raise HTTPException(status_code=500, detail="Failed to store PDF")

    # Insert paper
    paper_result = await db.from_("papers").insert({
        "title": paper_title,
        "extracted_text": extracted["text"],
        "figures": extracted["figures"],
        "pdf_path": f"papers/{object_path}",
        "uploaded_by": user["sub"],
    }).execute()

    if not paper_result.data:
        logger.error("paper insert failed: %s", paper_result.error)
        raise HTTPException(status_code=500, detail="Failed to create paper record")
    paper = paper_result.data[0]

    # Create self-study assignment (class_id=null)
    assignment_result = await db.from_("assignments").insert({
        "class_id": None,
        "paper_id": paper["id"],
        "status": "processing",
    }).execute()

    if not assignment_result.data:
        logger.error("assignment insert failed: %s", assignment_result.error)
        raise HTTPException(status_code=500, detail="Failed to create assignment")
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
    """Poll reading guide generation status. Only the paper's uploader or a
    student with a session for this assignment may read its status."""
    result = await db.from_("assignments") \
        .select("id, status, reading_guide, difficulty, paper_id") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Authorize: caller uploaded the underlying paper...
    paper = await db.from_("papers").select("uploaded_by") \
        .eq("id", result.data["paper_id"]).single().execute()
    authorized = bool(paper.data) and paper.data.get("uploaded_by") == user["sub"]

    # ...or the caller has a session for this assignment.
    if not authorized:
        session = await db.from_("student_sessions").select("id") \
            .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
        authorized = bool(session.data)

    if not authorized:
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


@router.get("/landmark", response_model=LandmarkLibraryResponse)
async def list_landmark(
    q: str = "",
    sort: str = "created",
    limit: int = LANDMARK_PAGE_SIZE,
    offset: int = 0,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Browse the curated landmark library (service-user-owned papers) with the
    available difficulty level for each. Search is case-insensitive title ilike."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        raise HTTPException(status_code=503, detail="Landmark library not configured")

    limit = max(1, min(int(limit), 50))
    offset = max(0, int(offset))

    papers_q = db.from_("papers").select("id, title, created_at").eq("uploaded_by", landmark_user)
    if q.strip():
        papers_q = papers_q.ilike("title", f"%{q.strip()}%")
    if sort == "title":
        papers_q = papers_q.order("title", desc=False)
    else:
        papers_q = papers_q.order("created_at", desc=True)
    papers_res = await papers_q.limit(limit + 1).offset(offset).execute()
    rows = papers_res.data or []
    has_more = len(rows) > limit
    papers = rows[:limit]

    items = await _landmark_papers_with_levels(db, papers)
    return LandmarkLibraryResponse(items=items, has_more=has_more)


@router.get("/landmark/featured", response_model=list[LandmarkPaper])
async def list_landmark_featured(
    user=Depends(require_student),
    db=Depends(get_db),
):
    """A small curated set of iconic landmark papers for the dashboard widget."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        return []
    papers_res = await db.from_("papers").select("id, title, created_at") \
        .eq("uploaded_by", landmark_user).in_("title", LANDMARK_FEATURED_TITLES).execute()
    papers = papers_res.data or []
    return await _landmark_papers_with_levels(db, papers)


# /categories endpoint removed 2026-05-01: was a stub returning [] — the
# `category` taxonomy was never implemented in the schema. Re-add this when
# you add a category column and decide on the taxonomy.


@router.post("/landmark/assign", response_model=AssignLandmarkResponse)
async def assign_landmark(
    body: AssignLandmarkRequest,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    """Assign a landmark paper at a chosen level to a class by COPYING the
    pre-built reading guide (no Gemini). Idempotent: re-assigning the same
    class+paper+difficulty returns the existing class assignment."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        raise HTTPException(status_code=503, detail="Landmark library not configured")

    # 1. Class must belong to this teacher.
    cls = await db.from_("classes").select("id") \
        .eq("id", body.class_id).eq("teacher_id", user["sub"]).maybe_single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Class not found or not yours")

    # 2. Paper must be a landmark (service-user-owned) paper.
    paper = await db.from_("papers").select("uploaded_by") \
        .eq("id", body.paper_id).maybe_single().execute()
    if not paper.data or paper.data.get("uploaded_by") != landmark_user:
        raise HTTPException(status_code=404, detail="Paper not found in landmark library")

    # 3. Dedup: an existing class assignment for this class+paper+level is returned as-is.
    existing = await db.from_("assignments").select("id, status") \
        .eq("class_id", body.class_id).eq("paper_id", body.paper_id) \
        .eq("difficulty", body.difficulty).maybe_single().execute()
    if existing.data:
        return AssignLandmarkResponse(
            assignment_id=existing.data["id"],
            class_id=body.class_id,
            paper_id=body.paper_id,
            difficulty=body.difficulty,
            status=existing.data.get("status", "published"),
        )

    # 4. Load the source landmark (class_id IS NULL, published) guide for this level.
    source = await db.from_("assignments").select("id, reading_guide") \
        .eq("paper_id", body.paper_id).eq("difficulty", body.difficulty) \
        .is_("class_id", "null").eq("status", "published").maybe_single().execute()
    guide = source.data.get("reading_guide") if source.data else None
    if not guide or not isinstance(guide.get("sections"), list):
        raise HTTPException(status_code=404, detail="No reading guide available for this level")

    # 5. Insert the new class assignment with the copied guide (published, no Gemini).
    inserted = await db.from_("assignments").insert({
        "class_id": body.class_id,
        "paper_id": body.paper_id,
        "difficulty": body.difficulty,
        "status": "published",
        "reading_guide": guide,
    }).execute()
    if not inserted.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")
    new_id = inserted.data[0]["id"]

    # 6. Copy critical_prompts + quiz_questions from the source (re-point assignment_id).
    await _copy_child_rows(db, "critical_prompts", source.data["id"], new_id)
    await _copy_child_rows(db, "quiz_questions", source.data["id"], new_id)

    return AssignLandmarkResponse(
        assignment_id=new_id,
        class_id=body.class_id,
        paper_id=body.paper_id,
        difficulty=body.difficulty,
        status="published",
    )


@router.get("/landmark/progress", response_model=LandmarkProgressResponse)
async def landmark_progress(
    user=Depends(require_student),
    db=Depends(get_db),
):
    """The caller's reading status across landmark library assignments
    (status + last section + completion). Powers the browse page's status badges,
    the 'Continue reading' CTA, and the Phase-3 progress summary. Returns only
    sessions whose assignment is a landmark (service-user-owned, class_id IS NULL,
    published) assignment — class assignments are excluded."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        raise HTTPException(status_code=503, detail="Landmark library not configured")

    # PostgREST can't express the papers→assignments join through this query
    # builder, so resolve the landmark assignment ids in two steps.
    papers_res = await db.from_("papers").select("id").eq("uploaded_by", landmark_user).execute()
    paper_ids = [p["id"] for p in (papers_res.data or [])]
    if not paper_ids:
        return LandmarkProgressResponse(progress=[])

    asn_res = await db.from_("assignments").select("id") \
        .in_("paper_id", paper_ids).is_("class_id", "null").eq("status", "published").execute()
    landmark_ids = [a["id"] for a in (asn_res.data or [])]
    if not landmark_ids:
        return LandmarkProgressResponse(progress=[])

    sessions_res = await db.from_("student_sessions") \
        .select("assignment_id, status, current_section_index, completed_at") \
        .eq("student_id", user["sub"]).in_("assignment_id", landmark_ids).execute()

    return LandmarkProgressResponse(
        progress=[LandmarkProgressItem(**row) for row in (sessions_res.data or [])]
    )
