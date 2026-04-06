import pytest
from unittest.mock import MagicMock, AsyncMock
from fastapi.testclient import TestClient
from backend.main import app
from backend.deps import require_student, get_db


def make_db(*return_values):
    call_count = 0
    results = list(return_values)

    async def mock_execute():
        nonlocal call_count
        val = results[call_count] if call_count < len(results) else results[-1]
        call_count += 1
        return MagicMock(data=val)

    db = MagicMock()
    for method in ["from_", "select", "insert", "update", "upsert", "eq",
                   "in_", "single", "delete"]:
        setattr(db, method, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


STUDENT = {"sub": "student-uuid-1"}


def test_superpowers_routes_exist():
    routes = [r.path for r in app.routes]
    assert any("/superpowers" in r for r in routes), f"No superpowers routes found"


def test_list_annotations_requires_student():
    app.dependency_overrides.clear()
    r = TestClient(app).get("/api/v1/superpowers/annotations/sess-1")
    assert r.status_code == 401


def test_list_annotations_returns_list():
    session = {"id": "sess-1"}
    annotations = [{"id": "ann-1", "highlight_text": "X", "category": "important"}]
    db = make_db(session, annotations)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/annotations/sess-1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()[0]["highlight_text"] == "X"


def test_create_annotation_returns_created():
    session = {"id": "sess-1"}
    new_ann = [{"id": "ann-2", "highlight_text": "Y", "category": "question"}]
    db = make_db(session, new_ann)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).post("/api/v1/superpowers/annotations", json={
            "session_id": "sess-1", "section_index": 0,
            "start_char": 10, "end_char": 20, "highlight_text": "Y",
        })
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()["id"] == "ann-2"


def test_get_stats_returns_defaults_for_new_student():
    db = make_db(None)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/stats")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    data = r.json()
    assert data["level"] == 1
    assert data["xp"] == 0


def test_add_xp_rejects_unknown_action():
    db = make_db()
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).post("/api/v1/superpowers/stats/xp", json={"action": "fly"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 400


def test_get_methodology_requires_session():
    db = make_db(None)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/methodology/assign-1/0")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 403


def test_get_methodology_returns_elements():
    session = {"id": "sess-1"}
    elements = [{"id": "elem-1", "element_type": "study_design", "label": "RCT"}]
    db = make_db(session, elements)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/methodology/assign-1/1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()[0]["element_type"] == "study_design"


def test_get_quiz_returns_empty_when_not_generated():
    session = {"id": "sess-1"}
    db = make_db(session, [])
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/quiz/assign-1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json() == []
