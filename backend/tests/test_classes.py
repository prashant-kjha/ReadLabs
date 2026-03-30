import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock
from backend.main import app
from backend.deps import require_teacher
from backend.db import get_db

client = TestClient(app)


def mock_db_with(data):
    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.delete = MagicMock(return_value=db)
    db.update = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.order = MagicMock(return_value=db)
    db.execute = AsyncMock(return_value=MagicMock(data=data))
    return db


def test_create_class_requires_teacher():
    response = client.post("/api/v1/classes/", json={"name": "Bio 101"})
    assert response.status_code == 401


def test_create_class_returns_code():
    teacher = {"sub": "teacher-uuid-1"}
    # First execute call (collision check) returns empty; second (insert) returns the record
    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.delete = MagicMock(return_value=db)
    db.update = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.order = MagicMock(return_value=db)
    db.execute = AsyncMock(side_effect=[
        MagicMock(data=[]),  # collision check: no existing code
        MagicMock(data=[{"id": "cls-1", "name": "Bio 101", "class_code": "ABC123", "teacher_id": "teacher-uuid-1"}]),  # insert
    ])

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.post("/api/v1/classes/", json={"name": "Bio 101"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "class_code" in response.json()


def test_remove_student_from_class():
    teacher = {"sub": "teacher-uuid-1"}
    db = mock_db_with([{"id": "cls-1"}])

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.delete("/api/v1/classes/cls-1/students/student-uuid-1")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["ok"] is True
