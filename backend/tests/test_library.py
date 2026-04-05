import pytest
import io
import fitz
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app
from backend.deps import require_student, get_db

client = TestClient(app)


def make_db(*return_values):
    call_count = [0]
    results = list(return_values)

    async def mock_execute():
        idx = call_count[0]
        call_count[0] += 1
        if idx < len(results):
            return MagicMock(data=results[idx])
        return MagicMock(data=[])

    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "single", "order", "limit"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


def _make_pdf(text: str = "Abstract\nTest paper content.") -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def test_library_upload_requires_auth():
    response = client.post(
        "/api/v1/library/upload",
        files={"file": ("test.pdf", b"%PDF-fake", "application/pdf")},
    )
    assert response.status_code == 401


def test_library_upload_creates_paper_and_assignment():
    student = {"sub": "student-uuid-1"}
    pdf_bytes = _make_pdf("Abstract\nThis is a research paper about machine learning.")

    paper_row = {"id": "paper-1", "title": "Test Paper"}
    assignment_row = {"id": "asn-1", "status": "processing", "class_id": None}

    call_count = [0]
    results = [[paper_row], [assignment_row]]

    async def mock_execute():
        idx = call_count[0]
        call_count[0] += 1
        if idx < len(results):
            return MagicMock(data=results[idx])
        return MagicMock(data=[])

    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "single", "order", "limit"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library._process_self_study"), \
             patch("asyncio.to_thread"):
            response = client.post(
                "/api/v1/library/upload",
                files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
                data={"title": "Test Paper", "category": "Computer Science"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"
    assert "assignment_id" in body
