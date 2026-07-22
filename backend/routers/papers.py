import uuid
import asyncio
import logging
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from backend.db import get_db, storage_headers
from backend.deps import require_teacher, require_student
from backend.services.paper_service import extract_text_and_figures
from backend.config import get_settings
from backend.rate_limit import limiter
from backend.schemas.papers import PaperUploadResponse

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB
_PDF_HEADER = b"%PDF-"

try:
    import magic as _libmagic
    _HAS_LIBMAGIC = True
except Exception as _e:  # missing system lib, bad install, etc.
    _libmagic = None
    _HAS_LIBMAGIC = False
    logger.warning("libmagic unavailable (%s) — falling back to header byte check only", _e)


def _validate_pdf_content(pdf_bytes: bytes) -> None:
    """Reject anything that isn't actually a PDF, regardless of client-supplied MIME type.

    Defense in depth:
      1. Cheap prefix check rejects obvious garbage in nanoseconds.
      2. libmagic sniffs the actual content signature (catches polyglots).
    """
    if not pdf_bytes.startswith(_PDF_HEADER):
        raise HTTPException(status_code=400, detail="File is not a valid PDF")
    if _HAS_LIBMAGIC:
        detected = _libmagic.from_buffer(pdf_bytes[:4096], mime=True)
        if detected != "application/pdf":
            logger.info("rejected upload: libmagic detected %s, not PDF", detected)
            raise HTTPException(status_code=400, detail="File content does not appear to be a PDF")


async def _upload_to_storage(pdf_bytes: bytes, object_path: str) -> str:
    """Upload to Supabase Storage via httpx (no supabase-py dependency)."""
    url = f"{get_settings().supabase_url}/storage/v1/object/papers/{object_path}"
    headers = {**storage_headers(), "Content-Type": "application/pdf"}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(url, headers=headers, content=pdf_bytes)
    if r.status_code not in (200, 201):
        logger.error("Failed to store PDF: %s %s", r.status_code, r.text[:200])
        raise HTTPException(status_code=500, detail="Failed to store PDF")
    return object_path


@router.post("/upload", response_model=PaperUploadResponse)
@limiter.limit("10/hour")
async def upload_paper(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_PDF_BYTES:
                raise HTTPException(status_code=400, detail="PDF must be under 20 MB")
        except ValueError:
            pass

    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF must be under 20 MB")

    _validate_pdf_content(pdf_bytes)

    extracted = await asyncio.to_thread(extract_text_and_figures, pdf_bytes)

    paper_title = title.strip() or (
        file.filename.replace(".pdf", "").replace("_", " ") if file.filename else "Untitled"
    )

    object_path = f"{user['sub']}/{uuid.uuid4()}.pdf"
    await _upload_to_storage(pdf_bytes, object_path)
    pdf_path = f"papers/{object_path}"

    result = await db.from_("papers").insert({
        "title":          paper_title,
        "extracted_text": extracted["text"],
        "figures":        extracted["figures"],
        "pdf_path":       pdf_path,
        "uploaded_by":    user["sub"],
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save paper")
    paper = result.data[0]
    return {
        "id":           paper["id"],
        "title":        paper_title,
        "text_length":  len(extracted["text"]),
        "figure_count": len(extracted["figures"]),
        "pdf_path":     pdf_path,
    }


@router.get("/")
async def list_papers(user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("papers") \
        .select("id, title, extracted_text, figures, created_at") \
        .eq("uploaded_by", user["sub"]) \
        .order("created_at", desc=True) \
        .execute()
    papers = []
    for p in (result.data or []):
        papers.append({
            "id":           p["id"],
            "title":        p["title"],
            "created_at":   p["created_at"],
            "text_length":  len(p["extracted_text"] or ""),
            "figure_count": len(p["figures"] or []),
        })
    return papers


@router.get("/{paper_id}")
async def get_paper(paper_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("papers") \
        .select("id, title, extracted_text, figures, pdf_path, created_at") \
        .eq("id", paper_id) \
        .eq("uploaded_by", user["sub"]) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")
    return result.data


@router.get("/{paper_id}/pdf-url")
async def get_pdf_url(paper_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Return a signed URL (1 h expiry) for the paper's PDF in Supabase Storage."""
    # Authorization: student must either have uploaded this paper themselves
    # (self-study) or have an active session for an assignment using it.
    owned = await db.from_("papers").select("id") \
        .eq("id", paper_id).eq("uploaded_by", user["sub"]).single().execute()
    if not owned.data:
        assignment_match = await db.from_("assignments").select("id") \
            .eq("paper_id", paper_id).execute()
        assignment_ids = [a["id"] for a in (assignment_match.data or [])]
        authorized = False
        if assignment_ids:
            session = await db.from_("student_sessions").select("id") \
                .eq("student_id", user["sub"]).in_("assignment_id", assignment_ids) \
                .limit(1).execute()
            authorized = bool(session.data)
        if not authorized:
            raise HTTPException(status_code=404, detail="Paper not found")

    result = await db.from_("papers") \
        .select("pdf_path") \
        .eq("id", paper_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not result.data.get("pdf_path"):
        # Not an error: landmark-library and CORE-fetched papers are stored as
        # extracted text only. Say so plainly so the client can render an empty
        # state rather than a failure. 404 stays reserved for "not yours".
        logger.info("pdf-url: paper %s has no stored PDF", paper_id)
        return {"url": None}

    pdf_path = result.data["pdf_path"]
    object_path = pdf_path.removeprefix("papers/")
    logger.info("pdf-url: generating signed URL for paper %s, path=%s", paper_id, object_path[:40])

    try:
        url = f"{get_settings().supabase_url}/storage/v1/object/sign/papers/{object_path}"
        headers = {**storage_headers(), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(url, headers=headers, json={"expiresIn": "3600"})
        if r.status_code != 200:
            logger.error("Signed URL failed: %s %s", r.status_code, r.text[:200])
            raise HTTPException(status_code=500, detail="Failed to generate PDF URL")
        signed_path = r.json()["signedURL"]
        signed_url = f"{get_settings().supabase_url}/storage/v1{signed_path}"
        logger.info("pdf-url: success, URL length=%d", len(signed_url))
        return {"url": signed_url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("pdf-url unexpected error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate PDF URL")
