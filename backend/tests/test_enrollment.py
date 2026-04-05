import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock
from backend.main import app
from backend.deps import require_student, get_db

client = TestClient(app)


def make_db(*return_values):
    """Returns a mock db whose execute() cycles through return_values in order."""
    call_count = 0
    results = list(return_values)

    async def mock_execute():
        nonlocal call_count
        val = results[call_count] if call_count < len(results) else results[-1]
        call_count += 1
        return MagicMock(data=val)

    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.delete = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.in_ = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = mock_execute
    return db


def test_join_class_requires_student():
    app.dependency_overrides.clear()
    r = client.post("/api/v1/enrollment/join", json={"class_code": "ABC123"})
    assert r.status_code == 401


def test_join_class_not_found():
    student = {"sub": "student-1"}
    db = make_db(None)  # class lookup returns no data

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/enrollment/join", json={"class_code": "BADCODE"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 404


def test_join_class_success():
    student = {"sub": "student-1"}
    class_data = {"id": "cls-1", "name": "Biology 101", "teacher_id": "t-1"}
    no_enrollment = None
    profile_data = {"name": "Alice"}
    inserted = [{"class_id": "cls-1", "student_id": "student-1"}]

    db = make_db(class_data, no_enrollment, profile_data, inserted)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/enrollment/join", json={"class_code": "BIO-001"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["class_name"] == "Biology 101"


def test_join_class_duplicate():
    student = {"sub": "student-1"}
    class_data = {"id": "cls-1", "name": "Biology 101", "teacher_id": "t-1"}
    existing_enrollment = {"class_id": "cls-1"}  # already enrolled

    db = make_db(class_data, existing_enrollment)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/enrollment/join", json={"class_code": "BIO-001"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 409


def test_list_enrolled_classes_empty():
    student = {"sub": "student-1"}
    db = make_db([])  # no enrollments

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.get("/api/v1/enrollment/classes")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json() == []
