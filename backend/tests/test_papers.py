import pytest
import fitz  # PyMuPDF
import io
from backend.services.paper_service import extract_text_and_figures


def make_pdf_with_text(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def make_pdf_with_image() -> bytes:
    from PIL import Image
    doc = fitz.open()
    page = doc.new_page()
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)
    page.insert_image(fitz.Rect(50, 50, 150, 150), stream=img_buf.read())
    page.insert_text((50, 200), "Figure 1. A red square.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def test_extracts_text():
    pdf = make_pdf_with_text("Abstract\nThis is the abstract.")
    result = extract_text_and_figures(pdf)
    assert "text" in result
    assert "Abstract" in result["text"]


def test_returns_figures_list():
    pdf = make_pdf_with_text("No images here.")
    result = extract_text_and_figures(pdf)
    assert "figures" in result
    assert isinstance(result["figures"], list)


def test_extracts_images():
    pdf = make_pdf_with_image()
    result = extract_text_and_figures(pdf)
    assert len(result["figures"]) >= 1
    fig = result["figures"][0]
    assert "data" in fig       # base64-encoded image
    assert "page" in fig
    assert "width" in fig
    assert "height" in fig


def test_empty_pdf_returns_empty_text():
    doc = fitz.open()
    doc.new_page()
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    result = extract_text_and_figures(buf.getvalue())
    assert result["text"].strip() == ""
    assert result["figures"] == []


from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app
from backend.deps import require_teacher as _require_teacher
from backend.db import get_db as _get_db

api_client = TestClient(app)


def test_upload_requires_auth():
    response = api_client.post(
        "/api/v1/papers/upload",
        files={"file": ("test.pdf", b"%PDF-fake", "application/pdf")},
    )
    assert response.status_code == 401


def test_upload_rejects_non_pdf():
    mock_teacher = {"sub": "teacher-uuid-123"}
    app.dependency_overrides[_require_teacher] = lambda: mock_teacher
    try:
        response = api_client.post(
            "/api/v1/papers/upload",
            files={"file": ("notes.txt", b"just text", "text/plain")},
        )
    finally:
        app.dependency_overrides.pop(_require_teacher, None)
    assert response.status_code == 400
    assert "PDF" in response.json()["detail"]


def test_upload_returns_paper_metadata():
    import fitz, io
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Abstract\nTest content.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    pdf_bytes = buf.getvalue()

    mock_teacher = {"sub": "teacher-uuid-123"}
    mock_db = MagicMock()
    mock_db.from_ = MagicMock(return_value=mock_db)
    mock_db.insert = MagicMock(return_value=mock_db)
    mock_db.execute = AsyncMock(return_value=MagicMock(
        data=[{"id": "paper-uuid-1", "title": "test", "created_at": "2026-01-01"}]
    ))

    app.dependency_overrides[_require_teacher] = lambda: mock_teacher
    app.dependency_overrides[_get_db] = lambda: mock_db
    try:
        with patch("backend.routers.papers._upload_to_storage", new_callable=AsyncMock, return_value="papers/teacher-uuid-123/test.pdf"):
            response = api_client.post(
                "/api/v1/papers/upload",
                files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
                data={"title": "Test Paper"},
            )
    finally:
        app.dependency_overrides.pop(_require_teacher, None)
        app.dependency_overrides.pop(_get_db, None)

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Test Paper"
    assert "figure_count" in body
    assert "text_length" in body
