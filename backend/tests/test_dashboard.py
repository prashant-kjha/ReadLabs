import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app
from backend.deps import require_teacher, get_db

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
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "single", "order"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


def test_get_class_progress_requires_teacher():
    response = client.get("/api/v1/dashboard/classes/cls-1/progress")
    assert response.status_code == 401


def test_get_class_progress_returns_students():
    teacher = {"sub": "teacher-uuid-1"}

    cls_data = {"id": "cls-1", "name": "Bio 101"}
    enrollments = [
        {"student_id": "s-1", "student_name": "Alice"},
        {"student_id": "s-2", "student_name": "Bob"},
    ]
    assignments = [{"id": "asn-1", "status": "published", "difficulty": "intermediate", "created_at": "2026-01-01", "reading_guide": {"sections": [{"title": "A"}, {"title": "B"}]}}]
    sessions = [{"student_id": "s-1", "assignment_id": "asn-1", "status": "in_progress", "current_section_index": 2, "completed_at": None}]

    db = make_db(cls_data, enrollments, assignments, sessions)

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.get("/api/v1/dashboard/classes/cls-1/progress")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert "students" in body
    assert len(body["students"]) == 2


def test_get_student_responses_returns_checkpoints():
    teacher = {"sub": "teacher-uuid-1"}
    asn_data = {"class_id": "cls-1"}
    cls_data = {"id": "cls-1"}
    session_data = {"id": "ses-1", "student_id": "s-1", "assignment_id": "asn-1", "status": "in_progress", "current_section_index": 1, "started_at": "2026-01-01", "completed_at": None}
    checkpoints = [
        {"section_index": 0, "student_text": "My answer", "ai_feedback": "Good job!", "submitted_at": "2026-01-01"},
    ]
    sowhat_data = None

    db = make_db(asn_data, cls_data, session_data, checkpoints, [])

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        response = client.get("/api/v1/dashboard/assignments/asn-1/students/s-1/responses")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "checkpoints" in response.json()


def test_get_insights_triggers_generation_when_missing():
    teacher = {"sub": "teacher-uuid-1"}
    asn_data = {"id": "asn-1", "class_id": "cls-1", "reading_guide": {
        "sections": [{"title": "Methods", "text": "..."}]
    }}
    cls_data = {"id": "cls-1"}
    # cached insights not found (returns None)
    # responses
    responses = [
        {"student_text": "The study used 42 patients"},
        {"student_text": "They measured blood pressure"},
    ]
    # upsert result
    inserted = MagicMock(data={"insights": {"sections": []}, "generated_at": "2026-01-01"})

    call_count = [0]
    results = [asn_data, cls_data, None, responses]

    async def mock_execute():
        idx = call_count[0]
        call_count[0] += 1
        if idx < len(results):
            return MagicMock(data=results[idx])
        return inserted

    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "single", "order"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute

    mock_insights = {"common_misconception": "...", "commonly_grasped": "...", "student_count": 2}

    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.dashboard.generate_class_insights",
                   new_callable=AsyncMock, return_value=mock_insights):
            response = client.get("/api/v1/dashboard/assignments/asn-1/insights")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
