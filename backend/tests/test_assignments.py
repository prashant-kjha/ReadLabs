import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app
from backend.deps import require_teacher, get_db

client = TestClient(app)


def mock_db_chain(return_data):
    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.update = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = AsyncMock(return_value=MagicMock(data=return_data))
    return db


def test_create_assignment_requires_teacher():
    app.dependency_overrides.clear()
    response = client.post("/api/v1/assignments/", json={"class_id": "c1", "paper_id": "p1"})
    assert response.status_code == 401


def test_create_assignment_returns_processing_status():
    teacher = {"sub": "teacher-uuid-1"}

    class_data = [{"id": "cls-1"}]
    paper_data = [{"id": "paper-1", "extracted_text": "Some text", "figures": []}]
    assignment_data = [{"id": "asn-1", "status": "processing", "class_id": "cls-1", "paper_id": "paper-1"}]

    call_count = 0
    async def mock_execute():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MagicMock(data=class_data)
        elif call_count == 2:
            return MagicMock(data=paper_data)
        return MagicMock(data=assignment_data)

    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = mock_execute

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.assignments._process_assignment"):
            response = client.post("/api/v1/assignments/", json={"class_id": "cls-1", "paper_id": "paper-1"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "processing"


def test_update_assignment_reading_guide():
    teacher = {"sub": "teacher-uuid-1"}
    existing = [{"class_id": "cls-1", "status": "draft"}]
    cls_data = [{"id": "cls-1"}]
    updated = [{"id": "asn-1", "status": "draft", "reading_guide": {"sections": []}}]

    call_count = 0
    async def mock_execute():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MagicMock(data=existing)
        elif call_count == 2:
            return MagicMock(data=cls_data)
        return MagicMock(data=updated)

    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.update = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = mock_execute

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.patch("/api/v1/assignments/asn-1", json={
            "reading_guide": {"sections": []},
            "status": "published"
        })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
