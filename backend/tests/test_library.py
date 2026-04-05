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


def test_search_returns_verified_results():
    student = {"sub": "student-uuid-1"}

    mock_results = [
        {"core_id": "core-1", "title": "Transformer Attention", "authors": "A. Vaswani", "year_published": 2017, "download_url": "https://example.com/1.pdf", "similarity": 0.6},
    ]

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: MagicMock()
    try:
        with patch("backend.routers.library.search_core", new_callable=AsyncMock, return_value=mock_results):
            response = client.get("/api/v1/library/search?q=transformer+attention")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert len(response.json()) >= 1


def test_fetch_core_paper_creates_assignment():
    student = {"sub": "student-uuid-1"}

    core_data = {
        "core_id": "core-1",
        "title": "Transformer Attention Mechanism",
        "authors": "A. Vaswani",
        "year_published": 2017,
        "full_text": "Full text of paper...",
    }
    paper_row = {"id": "paper-1", "title": "Transformer Attention Mechanism"}
    assignment_row = {"id": "asn-1", "status": "processing", "class_id": None}

    call_count = [0]
    results = [None, [paper_row], [assignment_row]]  # None=no existing paper, lists for inserts

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
        with patch("backend.routers.library.fetch_core_full_text", new_callable=AsyncMock, return_value=core_data), \
             patch("backend.routers.library._process_self_study"):
            response = client.post("/api/v1/library/fetch", json={
                "core_id": "core-1",
                "title": "Transformer Attention Mechanism",
            })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "processing"


def test_fetch_core_paper_rejects_title_mismatch():
    student = {"sub": "student-uuid-1"}

    # Mock the database check for existing paper (returns None)
    db = make_db(None)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library.fetch_core_full_text", new_callable=AsyncMock, return_value=None):
            response = client.post("/api/v1/library/fetch", json={
                "core_id": "core-bad",
                "title": "Some Title",
            })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "title" in response.json()["detail"].lower() or "mismatch" in response.json()["detail"].lower()


def test_browse_returns_library_papers():
    student = {"sub": "student-uuid-1"}
    papers_data = [
        {"id": "p-1", "title": "Paper One", "authors": "Author A", "year_published": 2024, "category": "Biology", "is_self_study": True, "created_at": "2026-01-01"},
        {"id": "p-2", "title": "Paper Two", "authors": "Author B", "year_published": 2023, "category": "Biology", "is_self_study": True, "created_at": "2026-01-02"},
    ]

    db = make_db(papers_data)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.get("/api/v1/library/browse?category=Biology")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert len(response.json()) == 2
