import uuid
import asyncio
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from supabase import create_client
from backend.db import get_db
from backend.deps import require_teacher, require_student
from backend.services.paper_service import extract_text_and_figures
from backend.config import get_settings

router = APIRouter()
settings = get_settings()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


def _get_storage_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


async def _upload_to_storage(pdf_bytes: bytes, object_path: str) -> str:
    """Upload to Supabase Storage using the Python client (run in thread to avoid blocking)."""
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
    return object_path


@router.post("/upload")
async def upload_paper(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF must be under 20 MB")

    extracted = extract_text_and_figures(pdf_bytes)

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
    result = await db.from_("papers") \
        .select("pdf_path") \
        .eq("id", paper_id) \
        .single() \
        .execute()
    if not result.data or not result.data.get("pdf_path"):
        raise HTTPException(status_code=404, detail="Paper not found or no PDF attached")

    pdf_path = result.data["pdf_path"]
    # pdf_path is stored as "papers/{user_id}/{uuid}.pdf" but the storage API
    # expects the object path *inside* the bucket (without the "papers/" prefix).
    object_path = pdf_path.removeprefix("papers/")

    def _create_signed_url():
        client = _get_storage_client()
        return client.storage.from_("papers").create_signed_url(object_path, expires_in=3600)

    signed = await asyncio.to_thread(_create_signed_url)
    signed_url = f"{settings.supabase_url}{signed['signedURL']}"
    return {"url": signed_url}
