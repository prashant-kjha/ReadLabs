import pytest
import io
import fitz
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app
from backend.deps import require_student, require_teacher, get_db

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
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "ilike", "is_", "single", "maybe_single", "order", "limit", "offset"]:
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

    # Mock the Supabase Storage POST so we don't try to hit a real URL.
    fake_storage_response = MagicMock(status_code=200, text="")
    fake_client = MagicMock()
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=None)
    fake_client.post = AsyncMock(return_value=fake_storage_response)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library._process_self_study"), \
             patch("asyncio.to_thread"), \
             patch("backend.routers.library.httpx.AsyncClient", return_value=fake_client):
            response = client.post(
                "/api/v1/library/upload",
                files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
                data={"title": "Test Paper"},
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


def test_list_landmark_returns_papers_with_levels():
    student = {"sub": "student-uuid-1"}
    papers_rows = [
        {"id": "p1", "title": "Attention Is All You Need", "created_at": "2026-06-01"},
        {"id": "p2", "title": "BERT", "created_at": "2026-06-02"},
    ]
    assignments_rows = [
        {"id": "a1", "paper_id": "p1", "difficulty": "advanced"},
        {"id": "a2", "paper_id": "p1", "difficulty": "beginner"},
        {"id": "a3", "paper_id": "p2", "difficulty": "intermediate"},
    ]
    db = make_db(papers_rows, assignments_rows)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library.get_settings") as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["has_more"] is False
    attn = next(it for it in body["items"] if it["paper_id"] == "p1")
    assert [lvl["difficulty"] for lvl in attn["levels"]] == ["beginner", "advanced"]


def test_list_landmark_omits_papers_with_no_published_levels():
    """Unpublishing a landmark paper's guides must take it out of the library.

    A paper with no published level has nothing to read, and the card renders
    with a dead disabled button — so don't list it at all.
    """
    student = {"sub": "student-uuid-1"}
    papers_rows = [
        {"id": "p1", "title": "Attention Is All You Need", "created_at": "2026-06-01"},
        {"id": "p2", "title": "Unpublished Paper", "created_at": "2026-06-02"},
    ]
    assignments_rows = [
        {"id": "a1", "paper_id": "p1", "difficulty": "intermediate"},
    ]
    db = make_db(papers_rows, assignments_rows)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library.get_settings") as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert [it["paper_id"] for it in response.json()["items"]] == ["p1"]


def test_list_landmark_featured_omits_papers_with_no_published_levels():
    student = {"sub": "student-uuid-1"}
    papers_rows = [
        {"id": "p1", "title": "Attention Is All You Need", "created_at": "2026-06-01"},
    ]
    db = make_db(papers_rows, [])  # every level unpublished

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library.get_settings") as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark/featured")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == []


def test_list_landmark_requires_auth():
    app.dependency_overrides.clear()
    response = client.get("/api/v1/library/landmark")
    assert response.status_code == 401


def test_list_landmark_featured_returns_curated():
    student = {"sub": "student-uuid-1"}
    papers_rows = [
        {"id": "p1", "title": "Attention Is All You Need", "created_at": "2026-06-01"},
    ]
    assignments_rows = [
        {"id": "a1", "paper_id": "p1", "difficulty": "intermediate"},
    ]
    db = make_db(papers_rows, assignments_rows)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.library.get_settings") as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark/featured")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["title"] == "Attention Is All You Need"


def _assign_body():
    return {"class_id": "c1", "paper_id": "p1", "difficulty": "intermediate"}


def _patch_landmark_settings():
    """Patch get_settings so landmark_user_id is configured (503 otherwise)."""
    return patch("backend.routers.library.get_settings")


def test_assign_landmark_requires_auth():
    app.dependency_overrides.clear()
    response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    assert response.status_code == 401


def test_assign_landmark_rejects_class_not_yours():
    teacher = {"sub": "teacher-uuid-1"}
    db = make_db(None)  # class-ownership select returns nothing → 403
    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_assign_landmark_rejects_non_landmark_paper():
    teacher = {"sub": "teacher-uuid-1"}
    db = make_db(
        {"id": "c1"},                       # class owned by teacher
        {"uploaded_by": "someone-else"},    # paper NOT owned by landmark user → 404
    )
    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_assign_landmark_returns_existing_on_dedup():
    teacher = {"sub": "teacher-uuid-1"}
    db = make_db(
        {"id": "c1"},                                   # class owned
        {"uploaded_by": "landmark-user-uuid"},          # landmark paper
        {"id": "existing-asn", "status": "published"},  # dedup hit → return as-is
    )
    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["assignment_id"] == "existing-asn"
    assert body["status"] == "published"


def test_assign_landmark_404_when_no_guide_for_level():
    teacher = {"sub": "teacher-uuid-1"}
    db = make_db(
        {"id": "c1"},                           # class owned
        {"uploaded_by": "landmark-user-uuid"},  # landmark paper
        None,                                   # no dedup
        None,                                   # no source guide for this level → 404
    )
    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404
    assert "guide" in response.json()["detail"].lower() or "level" in response.json()["detail"].lower()


def test_assign_landmark_creates_class_assignment_and_copies_children():
    teacher = {"sub": "teacher-uuid-1"}
    source_guide = {"sections": [{"title": "Intro", "text": "..."}]}
    db = make_db(
        {"id": "c1"},                                  # 1. class owned
        {"uploaded_by": "landmark-user-uuid"},         # 2. landmark paper
        None,                                          # 3. no dedup
        {"id": "src-asn", "reading_guide": source_guide},  # 4. source guide
        [{"id": "new-class-asn"}],                     # 5. inserted class assignment
        [{"id": "cp-1", "section_index": 0, "prompt_text": "Why?", "prompt_type": "methodology", "ai_followup": ""}],  # 6. source prompts (own PKs)
        [],                                            # 7. prompts insert result
        [{"id": "qq-1", "question_text": "Q?", "question_type": "multiple_choice", "options": ["a", "b"], "correct_answer": "a", "explanation": "x"}],  # 8. source quiz
        [],                                            # 9. quiz insert result
    )
    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["assignment_id"] == "new-class-asn"
    assert body["class_id"] == "c1"
    assert body["paper_id"] == "p1"
    assert body["difficulty"] == "intermediate"
    assert body["status"] == "published"

    # The copied child rows must be re-pointed to the NEW assignment and must
    # NOT carry the source's primary key (else a re-assign would PK-conflict).
    # db.insert records every insert call in endpoint order: [assignment, prompts, quiz].
    inserted = [call.args[0] for call in db.insert.call_args_list]
    assert len(inserted) == 3, "expected assignment + prompts + quiz inserts"
    prompt_rows, quiz_rows = inserted[1], inserted[2]
    assert prompt_rows and all(
        "id" not in r and r["assignment_id"] == "new-class-asn" for r in prompt_rows
    )
    assert quiz_rows and all(
        "id" not in r and r["assignment_id"] == "new-class-asn" for r in quiz_rows
    )


def test_assign_landmark_creates_assignment_with_no_children_to_copy():
    """A source with no prompts/quiz still assigns cleanly (empty-copy branch)."""
    teacher = {"sub": "teacher-uuid-1"}
    source_guide = {"sections": [{"title": "Intro", "text": "..."}]}
    db = make_db(
        {"id": "c1"},                                  # 1. class owned
        {"uploaded_by": "landmark-user-uuid"},         # 2. landmark paper
        None,                                          # 3. no dedup
        {"id": "src-asn", "reading_guide": source_guide},  # 4. source guide
        [{"id": "new-class-asn"}],                     # 5. inserted class assignment
        [],                                            # 6. source prompts (empty → no insert)
        [],                                            # 7. source quiz (empty → no insert)
    )
    app.dependency_overrides[require_teacher] = lambda: teacher
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.post("/api/v1/library/landmark/assign", json=_assign_body())
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["assignment_id"] == "new-class-asn"


def test_progress_requires_auth():
    app.dependency_overrides.clear()
    response = client.get("/api/v1/library/landmark/progress")
    assert response.status_code == 401


def test_progress_503_when_not_configured():
    student = {"sub": "student-uuid-1"}
    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: make_db()
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = None
            response = client.get("/api/v1/library/landmark/progress")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503


def test_progress_returns_students_landmark_sessions():
    student = {"sub": "student-uuid-1"}
    db = make_db(
        [{"id": "p1"}],                                                                       # 1. landmark paper ids
        [{"id": "la1"}],                                                                      # 2. landmark assignment ids
        [{"assignment_id": "la1", "status": "in_progress", "current_section_index": 2, "completed_at": None}],  # 3. this student's sessions
    )
    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark/progress")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert len(body["progress"]) == 1
    item = body["progress"][0]
    assert item["assignment_id"] == "la1"
    assert item["status"] == "in_progress"
    assert item["current_section_index"] == 2
    assert item["completed_at"] is None


def test_progress_empty_when_no_landmark_papers():
    student = {"sub": "student-uuid-1"}
    db = make_db([])  # no landmark papers → short-circuit before assignments/sessions
    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark/progress")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["progress"] == []


def test_progress_empty_when_student_has_no_sessions():
    student = {"sub": "student-uuid-1"}
    db = make_db(
        [{"id": "p1"}],   # landmark papers
        [{"id": "la1"}],  # landmark assignments
        [],               # no sessions for this student
    )
    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with _patch_landmark_settings() as mock_settings:
            mock_settings.return_value.landmark_user_id = "landmark-user-uuid"
            response = client.get("/api/v1/library/landmark/progress")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["progress"] == []
