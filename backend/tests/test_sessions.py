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
    """Build a mock DB whose execute() returns successive values.

    Each value can be either a plain data object (data=val, status_code=200)
    or a tuple (data, status_code) for explicit status control.
    """
    call_count = 0
    results = list(return_values)

    async def mock_execute():
        nonlocal call_count
        val = results[call_count] if call_count < len(results) else results[-1]
        call_count += 1
        if isinstance(val, tuple) and len(val) == 2:
            data, status_code = val
        else:
            data = val
            status_code = 200 if data is not None else -1
        return MagicMock(data=data, status_code=status_code)

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
    new_session = [{"id": "sess-1", "status": "in_progress", "current_section_index": 0}]
    paper = {"title": "Test Paper"}

    db = make_db(assignment, enrollment, new_session, paper)

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


def test_submit_checkpoint_returns_pending():
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    assignment = {"reading_guide": GUIDE}
    checkpoint = [{"id": "cp-1", "section_index": 0, "student_text": "My answer", "ai_feedback": None}]

    db = make_db(session, assignment, checkpoint)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.sessions._run_checkpoint_feedback", new=AsyncMock()):
            r = client.post("/api/v1/sessions/sess-1/checkpoint",
                            json={"section_index": 0, "student_text": "My answer"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["feedback_pending"] is True


def test_submit_sowhat_returns_pending():
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    assignment = {"reading_guide": GUIDE, "paper_id": "p-1"}
    paper = {"title": "Test Paper"}
    sowhat = [{"id": "sw-1", "student_text": "It matters because...", "ai_feedback": None}]

    db = make_db(session, assignment, paper, sowhat)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.sessions._run_sowhat_feedback", new=AsyncMock()):
            r = client.post("/api/v1/sessions/sess-1/sowhat",
                            json={"student_text": "It matters because..."})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["feedback_pending"] is True


def test_jargon_lookup_returns_explanation_synchronously():
    """Jargon lookup is synchronous — it generates and returns the explanation
    in the same request, so feedback_pending is always False."""
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    no_existing = None
    inserted = [{"id": "jargon-1", "term": "rct", "explanation": "Randomized controlled trial."}]

    db = make_db(session, no_existing, inserted)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.sessions.generate_jargon_explanation",
                   new_callable=AsyncMock, return_value="Randomized controlled trial."):
            r = client.post("/api/v1/sessions/sess-1/jargon",
                            json={"term": "RCT", "context_snippet": "...RCT was used..."})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["feedback_pending"] is False
    assert body["term"] == "RCT"
    assert "Randomized" in body["explanation"]


def test_keyterm_returns_cached():
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    cached = {"explanation": "RCT means randomized controlled trial."}

    db = make_db(session, cached)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/sessions/sess-1/keyterm",
                        json={"term": "RCT", "context_snippet": "..."})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["cached"] is True
    assert "randomized" in r.json()["explanation"]


def test_keyterm_returns_generated():
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    no_cached = None
    upserted = [{"explanation": "RCT is a randomized controlled trial."}]

    db = make_db(session, no_cached, upserted)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.sessions.generate_jargon_explanation",
                   new=AsyncMock(return_value="RCT is a randomized controlled trial.")):
            r = client.post("/api/v1/sessions/sess-1/keyterm",
                            json={"term": "RCT", "context_snippet": "..."})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["cached"] is False
    assert "randomized" in r.json()["explanation"]


def test_start_session_self_study_skips_enrollment():
    student = {"sub": "s-1"}
    assignment = {"id": "asn-1", "class_id": None, "paper_id": "p-1", "reading_guide": None, "difficulty": "intermediate", "status": "published"}
    new_session = [{"id": "sess-1", "status": "in_progress", "current_section_index": 0}]
    paper = {"title": "Self-Study Paper"}

    db = make_db(assignment, new_session, paper)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/sessions/", json={"assignment_id": "asn-1"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["session_id"] == "sess-1"
