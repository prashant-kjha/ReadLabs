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
from backend.deps import require_student as _require_student
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


def test_upload_rejects_disguised_non_pdf():
    """File with application/pdf MIME header but non-PDF bytes must be rejected.

    The MIME header is client-controlled — only the file content is trustworthy.
    Covers the header-byte check in _validate_pdf_content; libmagic adds an extra
    layer on top when installed.
    """
    mock_teacher = {"sub": "teacher-uuid-123"}
    app.dependency_overrides[_require_teacher] = lambda: mock_teacher
    try:
        response = api_client.post(
            "/api/v1/papers/upload",
            files={"file": ("fake.pdf", b"<html>not a pdf</html>", "application/pdf")},
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


def test_get_pdf_url_requires_auth():
    """Unauthenticated requests to GET /papers/{id}/pdf-url should return 401."""
    response = api_client.get("/api/v1/papers/some-id/pdf-url")
    assert response.status_code == 401


def test_get_pdf_url_returns_signed_url_when_student_has_session():
    """Authenticated student with a session for the paper's assignment receives a signed URL.

    Auth flow added in 2026-05-01 security review:
      1. owned check  (paper.uploaded_by == student?) → no
      2. assignment lookup by paper_id → [asn-1]
      3. session lookup (student has session for asn-1?) → yes
      4. paper.pdf_path lookup
      5. POST to /storage/v1/object/sign → signed URL
    """
    mock_student = {"sub": "student-uuid-123"}

    # Sequence of execute() return values for the 4 DB queries:
    db_results = [
        MagicMock(data=None),  # not owner
        MagicMock(data=[{"id": "asn-1"}]),  # one assignment uses this paper
        MagicMock(data=[{"id": "sess-1"}]),  # student has a session for it
        MagicMock(data={"pdf_path": "papers/teacher-uuid-999/abc-123.pdf"}),
    ]
    call_count = [0]

    async def mock_execute():
        idx = call_count[0]
        call_count[0] += 1
        return db_results[idx]

    mock_db = MagicMock()
    for attr in ["from_", "select", "eq", "in_", "single", "limit", "order"]:
        setattr(mock_db, attr, MagicMock(return_value=mock_db))
    mock_db.execute = mock_execute

    # Mock the httpx POST to Supabase Storage's signing endpoint
    storage_resp = MagicMock()
    storage_resp.status_code = 200
    storage_resp.json.return_value = {
        "signedURL": "/object/sign/papers/teacher-uuid-999/abc-123.pdf?token=xyz",
    }

    storage_ctx = AsyncMock()
    storage_ctx.post = AsyncMock(return_value=storage_resp)
    storage_ctx.__aenter__ = AsyncMock(return_value=storage_ctx)
    storage_ctx.__aexit__ = AsyncMock(return_value=False)

    app.dependency_overrides[_require_student] = lambda: mock_student
    app.dependency_overrides[_get_db] = lambda: mock_db
    try:
        with patch("backend.routers.papers.httpx.AsyncClient", return_value=storage_ctx):
            response = api_client.get("/api/v1/papers/paper-uuid-1/pdf-url")
    finally:
        app.dependency_overrides.pop(_require_student, None)
        app.dependency_overrides.pop(_get_db, None)

    assert response.status_code == 200
    body = response.json()
    assert "url" in body
    assert "teacher-uuid-999/abc-123.pdf" in body["url"]
    assert "token=xyz" in body["url"]


def test_get_pdf_url_rejects_student_without_access():
    """Student with no ownership and no session for an assignment using the paper
    must get 404 — they cannot enumerate papers by ID."""
    mock_student = {"sub": "outsider-uuid"}

    db_results = [
        MagicMock(data=None),         # not owner
        MagicMock(data=[]),           # no assignments use this paper
    ]
    call_count = [0]

    async def mock_execute():
        idx = call_count[0]
        call_count[0] += 1
        return db_results[idx]

    mock_db = MagicMock()
    for attr in ["from_", "select", "eq", "in_", "single", "limit", "order"]:
        setattr(mock_db, attr, MagicMock(return_value=mock_db))
    mock_db.execute = mock_execute

    app.dependency_overrides[_require_student] = lambda: mock_student
    app.dependency_overrides[_get_db] = lambda: mock_db
    try:
        response = api_client.get("/api/v1/papers/paper-uuid-1/pdf-url")
    finally:
        app.dependency_overrides.pop(_require_student, None)
        app.dependency_overrides.pop(_get_db, None)

    assert response.status_code == 404
