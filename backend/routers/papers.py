import uuid
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from backend.db import get_db
from backend.deps import require_teacher
from backend.services.paper_service import extract_text_and_figures
from backend.config import get_settings

router = APIRouter()
settings = get_settings()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


async def _upload_to_storage(pdf_bytes: bytes, path: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.supabase_url}/storage/v1/object/{path}",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/pdf",
            },
            content=pdf_bytes,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail="Failed to store PDF in storage")
    return path


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

    pdf_path = f"papers/{user['sub']}/{uuid.uuid4()}.pdf"
    await _upload_to_storage(pdf_bytes, pdf_path)

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
        .select("id, title, created_at") \
        .eq("uploaded_by", user["sub"]) \
        .order("created_at", desc=True) \
        .execute()
    return result.data or []


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
