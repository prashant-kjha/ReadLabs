import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app
from backend.deps import require_student, require_teacher, get_db

client = TestClient(app)

GUIDE = {
    "sections": [
        {"title": "Abstract", "text": "This paper studies X.", "guiding_questions": ["Look for: what is X?"], "key_terms": ["X"], "teacher_notes": ""},
        {"title": "Methods", "text": "We used Y method.", "guiding_questions": ["Look for: why Y?"], "key_terms": ["Y"], "teacher_notes": ""},
    ],
    "difficulty": "intermediate",
}


def make_db(*return_values):
    call_count = 0
    results = list(return_values)

    async def mock_execute():
        nonlocal call_count
        val = results[call_count] if call_count < len(results) else results[-1]
        call_count += 1
        return MagicMock(data=val)

    db = MagicMock()
    for method in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "single", "delete"]:
        setattr(db, method, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


def test_start_session_requires_student():
    app.dependency_overrides.clear()
    r = client.post("/api/v1/sessions/", json={"assignment_id": "asn-1"})
    assert r.status_code == 401


def test_start_session_creates_new_session():
    student = {"sub": "s-1"}
    assignment = {"id": "asn-1", "class_id": "cls-1", "paper_id": "p-1", "reading_guide": GUIDE, "difficulty": "intermediate", "status": "published"}
    enrollment = {"class_id": "cls-1"}
    no_session = None
    new_session = [{"id": "sess-1", "status": "in_progress", "current_section_index": 0}]
    paper = {"title": "Test Paper"}

    db = make_db(assignment, enrollment, no_session, new_session, paper)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/sessions/", json={"assignment_id": "asn-1"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == "sess-1"
    assert data["paper_title"] == "Test Paper"
    assert "reading_guide" in data


def test_start_session_assignment_not_published():
    student = {"sub": "s-1"}
    assignment = {"id": "asn-1", "class_id": "cls-1", "paper_id": "p-1", "reading_guide": GUIDE, "difficulty": "intermediate", "status": "draft"}

    db = make_db(assignment)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/sessions/", json={"assignment_id": "asn-1"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 403


def test_list_sessions():
    student = {"sub": "s-1"}
    sessions = [{"id": "sess-1", "assignment_id": "asn-1", "status": "in_progress", "current_section_index": 0}]
    db = make_db(sessions)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.get("/api/v1/sessions/")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert len(r.json()) == 1


def test_update_progress():
    student = {"sub": "s-1"}
    updated = [{"id": "sess-1", "current_section_index": 1}]
    db = make_db(updated)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.patch("/api/v1/sessions/sess-1/progress", json={"current_section_index": 1})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["ok"] is True
