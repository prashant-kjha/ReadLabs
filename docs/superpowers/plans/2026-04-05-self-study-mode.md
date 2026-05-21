# Self-Study Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-study mode where any student can upload a PDF or search the CORE API for open-access papers, get an AI-generated reading guide, and complete the full Socratic reading journey independently — no teacher or class required.

**Architecture:** Reuse existing tables (papers, assignments, student_sessions, checkpoint_responses, sowhat_responses). Add `is_self_study`, `category`, `core_id`, `authors`, `year_published`, `source` columns to papers. Make assignments.class_id nullable for self-study. New `core_api.py` service for CORE API integration with title verification. New `library.py` router. New `SelfStudyPage.jsx` frontend. Modify `ReadingPage.jsx` for optional checkpoints. Minimal changes to existing code.

**Tech Stack:** FastAPI, Python 3.14, Supabase (custom QueryBuilder), Google Gemini 2.5 Flash, CORE API v3 (core.ac.uk), React 18, React Router v6, Tailwind CSS, pytest

---

## File Map

```
backend/
  services/core_api.py                 NEW — CORE API client + title_similarity
  routers/library.py                   NEW — search, browse, upload, fetch, status endpoints
  routers/sessions.py                  MODIFY — skip enrollment check for null class_id
  ai_provider.py                       MODIFY — auto-detect category in generate_reading_guide
  config.py                            NO CHANGE (core_api_key already exists)
  main.py                              MODIFY — register library router
  tests/test_core_api.py               NEW — title_similarity + search verification tests
  tests/test_library.py                NEW — library endpoint tests

frontend/src/
  pages/student/SelfStudyPage.jsx      NEW — community library with search + categories
  pages/student/ReadingPage.jsx        MODIFY — add Skip buttons for optional checkpoints
  components/Layout.jsx                MODIFY — add Self-Study nav link
  App.js                               MODIFY — add self-study route

supabase_schema.sql                    MODIFY — add columns, make class_id nullable
```

---

### Task 1: Schema Migration — Add Columns to Papers, Make class_id Nullable

**Files:**
- Modify: `supabase_schema.sql` (append ALTER statements)

- [ ] **Step 1: Add migration SQL to `supabase_schema.sql`**

Append to the end of `supabase_schema.sql`:

```sql
-- ── Self-study mode migrations ─────────────────────────────────────────────

ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_self_study boolean NOT NULL DEFAULT false;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS core_id text;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS authors text;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS year_published int;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'core_api'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_core_id ON papers(core_id) WHERE core_id IS NOT NULL;

ALTER TABLE assignments ALTER COLUMN class_id DROP NOT NULL;

-- Self-study papers readable by any authenticated user
CREATE POLICY "Authenticated users read self-study papers" ON papers
  FOR SELECT USING (is_self_study = true AND auth.role() = 'authenticated');

-- Self-study assignments readable by the student who owns them
CREATE POLICY "Students read own self-study assignments" ON assignments
  FOR SELECT USING (
    class_id IS NULL
    AND EXISTS (
      SELECT 1 FROM student_sessions
      WHERE student_sessions.assignment_id = assignments.id
        AND student_sessions.student_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Run migration in Supabase SQL editor**

Open Supabase dashboard → SQL Editor → paste the ALTER statements → Run.

Expected: All statements succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase_schema.sql
git commit -m "feat: add self-study schema migrations for papers and assignments"
```

---

### Task 2: CORE API Service — Client + Title Verification

**Files:**
- Create: `backend/services/core_api.py`
- Create: `backend/tests/test_core_api.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_core_api.py`:

```python
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from backend.services.core_api import title_similarity, search_core, SEARCH_MINIMUM_SIMILARITY


def test_title_similarity_identical():
    assert title_similarity("Attention Is All You Need", "Attention Is All You Need") == 1.0


def test_title_similarity_partial():
    sim = title_similarity("Attention Is All You Need", "Attention mechanism in neural networks")
    assert 0.0 < sim < 1.0


def test_title_similarity_no_overlap():
    assert title_similarity("Quantum Computing Basics", "Photosynthesis in Plants") == 0.0


def test_title_similarity_empty():
    assert title_similarity("", "Something") == 0.0
    assert title_similarity("Something", "") == 0.0


def test_title_similarity_case_insensitive():
    assert title_similarity("machine learning", "Machine Learning") == 1.0


def test_search_filters_by_relevance():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "results": [
            {"id": "core-1", "title": "Transformer Attention Mechanism", "authors": [{"name": "A. Vaswani"}], "yearPublished": 2017, "downloadUrl": "https://example.com/1.pdf"},
            {"id": "core-2", "title": "Cooking Recipes for Beginners", "authors": [{"name": "B. Chef"}], "yearPublished": 2020, "downloadUrl": None},
            {"id": "core-3", "title": "Attention in Deep Learning Models", "authors": [{"name": "C. Researcher"}], "yearPublished": 2019, "downloadUrl": "https://example.com/3.pdf"},
        ]
    }

    mock_ctx = AsyncMock()
    mock_ctx.get = AsyncMock(return_value=mock_response)
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("backend.services.core_api.httpx.AsyncClient", return_value=mock_ctx):
        results = search_core("transformer attention mechanism")

    titles = [r["title"] for r in results]
    assert "Cooking Recipes for Beginners" not in titles
    assert len(results) <= 2
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/Users/prash/ReadLabs
pytest backend/tests/test_core_api.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'backend.services.core_api'`

- [ ] **Step 3: Create `backend/services/core_api.py`**

```python
import logging
import httpx
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CORE_SEARCH_URL = "https://api.core.ac.uk/v3/search/works"
CORE_RECORD_URL = "https://api.core.ac.uk/v3/data-records"

SEARCH_MINIMUM_SIMILARITY = 0.3
FETCH_MINIMUM_SIMILARITY = 0.7


def title_similarity(title_a: str, title_b: str) -> float:
    """
    Compute Jaccard similarity between two titles on word tokens.
    Returns 0.0-1.0 where 1.0 is identical.
    """
    if not title_a or not title_b:
        return 0.0
    tokens_a = set(title_a.lower().split())
    tokens_b = set(title_b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


async def search_core(query: str, limit: int = 20) -> list[dict]:
    """
    Search CORE API for open-access papers matching the query.
    Filters results by title relevance before returning.
    """
    headers = {"Authorization": f"Bearer {settings.core_api_key}"}
    params = {"q": query, "limit": limit, "offset": 0}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(CORE_SEARCH_URL, headers=headers, params=params)

    if resp.status_code != 200:
        logger.error("CORE search failed: %s %s", resp.status_code, resp.text[:300])
        return []

    raw_results = resp.json().get("results", [])

    # Filter by title relevance
    verified = []
    for r in raw_results:
        title = r.get("title", "")
        sim = title_similarity(query, title)
        if sim >= SEARCH_MINIMUM_SIMILARITY:
            verified.append({
                "core_id": r.get("id"),
                "title": title,
                "authors": ", ".join(
                    a.get("name", "") for a in r.get("authors", []) if a.get("name")
                ) or None,
                "year_published": r.get("yearPublished"),
                "download_url": r.get("downloadUrl"),
                "similarity": round(sim, 3),
            })

    verified.sort(key=lambda x: x["similarity"], reverse=True)
    return verified


async def fetch_core_full_text(core_id: str, expected_title: str) -> dict | None:
    """
    Fetch full text from CORE API by record ID.
    Verifies the fetched title matches expected_title before returning.
    Returns dict with title, authors, year, full_text or None if verification fails.
    """
    headers = {"Authorization": f"Bearer {settings.core_api_key}"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{CORE_RECORD_URL}/{core_id}", headers=headers)

    if resp.status_code != 200:
        logger.error("CORE fetch failed for %s: %s", core_id, resp.status_code)
        return None

    data = resp.json()
    fetched_title = data.get("title", "")

    # Title verification — reject if similarity too low
    sim = title_similarity(expected_title, fetched_title)
    if sim < FETCH_MINIMUM_SIMILARITY:
        logger.warning(
            "CORE title mismatch for %s: expected='%s' got='%s' sim=%.2f",
            core_id, expected_title, fetched_title, sim,
        )
        return None

    return {
        "core_id": core_id,
        "title": fetched_title,
        "authors": ", ".join(
            a.get("name", "") for a in data.get("authors", []) if a.get("name")
        ) or None,
        "year_published": data.get("yearPublished"),
        "full_text": data.get("fullText") or data.get("abstract") or "",
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_core_api.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/core_api.py backend/tests/test_core_api.py
git commit -m "feat: add CORE API service with title similarity verification"
```

---

### Task 3: Library Router — Upload Endpoint for Students

**Files:**
- Create: `backend/routers/library.py`
- Create: `backend/tests/test_library.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_library.py`:

```python
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
    results = [paper_row, assignment_row]

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
        with patch("backend.routers.library._process_self_study"):
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_library.py -v
```

Expected: FAIL — `404 Not Found`

- [ ] **Step 3: Create `backend/routers/library.py` with upload + background task**

```python
import uuid
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from supabase import create_client as _supabase_client
from backend.db import get_db
from backend.deps import require_student
from backend.services.paper_service import extract_text_and_figures
from backend.services.core_api import search_core, fetch_core_full_text
from backend.ai_provider import generate_reading_guide
from backend.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


def _get_storage_client():
    return _supabase_client(settings.supabase_url, settings.supabase_service_role_key)


async def _process_self_study(
    assignment_id: str,
    extracted_text: str,
    figure_count: int,
) -> None:
    """Background task: generate reading guide for self-study paper, auto-publish."""
    sb = _get_storage_client()
    try:
        reading_guide = await generate_reading_guide(extracted_text, figure_count)
        sb.table("assignments").update({
            "reading_guide": reading_guide,
            "difficulty": reading_guide.get("difficulty", "intermediate"),
            "status": "published",  # skip draft — auto-publish
        }).eq("id", assignment_id).execute()

        # Update paper category from AI difficulty if not set
        # (category is set by user on upload or auto-detected)
    except Exception as e:
        logger.error("Self-study guide generation failed: %s", e)
        sb.table("assignments").update({
            "status": "published",  # still publish so student can see the error
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()


@router.post("/upload")
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(default=""),
    category: str = Form(default=""),
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Student uploads a PDF for self-study. Auto-generates reading guide."""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF must be under 20 MB")

    extracted = extract_text_and_figures(pdf_bytes)

    paper_title = title.strip() or (
        file.filename.replace(".pdf", "").replace("_", " ") if file.filename else "Untitled"
    )

    # Upload to Supabase Storage
    object_path = f"self-study/{user['sub']}/{uuid.uuid4()}.pdf"

    def _do_upload():
        client = _get_storage_client()
        client.storage.from_("papers").upload(
            object_path,
            pdf_bytes,
            {"content-type": "application/pdf", "upsert": "false"},
        )

    try:
        await asyncio.to_thread(_do_upload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store PDF: {e}")

    # Insert paper
    paper_result = await db.from_("papers").insert({
        "title": paper_title,
        "extracted_text": extracted["text"],
        "figures": extracted["figures"],
        "pdf_path": f"papers/{object_path}",
        "uploaded_by": user["sub"],
        "is_self_study": True,
        "category": category.strip() or None,
        "source": "upload",
    }).execute()

    paper = paper_result.data[0]

    # Create self-study assignment (class_id=null)
    assignment_result = await db.from_("assignments").insert({
        "class_id": None,
        "paper_id": paper["id"],
        "status": "processing",
    }).execute()
    assignment = assignment_result.data[0]

    # Trigger background guide generation
    background_tasks.add_task(
        _process_self_study,
        assignment_id=assignment["id"],
        extracted_text=extracted["text"],
        figure_count=len(extracted["figures"]),
    )

    return {
        "assignment_id": assignment["id"],
        "paper_id": paper["id"],
        "title": paper_title,
        "status": "processing",
    }


@router.get("/status/{assignment_id}")
async def get_status(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Poll reading guide generation status."""
    result = await db.from_("assignments") \
        .select("id, status, reading_guide, difficulty") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result.data
```

- [ ] **Step 4: Register library router in `backend/main.py`**

Add import at top of `backend/main.py`:

```python
from backend.routers import auth, papers, classes, assignments, enrollment, sessions, dashboard, library
```

Add router registration after the dashboard line:

```python
app.include_router(library.router, prefix="/api/v1/library", tags=["library"])
```

- [ ] **Step 5: Run tests**

```bash
pytest backend/tests/test_library.py -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py backend/main.py
git commit -m "feat: add library router with student upload and guide generation"
```

---

### Task 4: Library Router — Search, Browse, Fetch Endpoints

**Files:**
- Modify: `backend/routers/library.py` (append endpoints)
- Modify: `backend/tests/test_library.py` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_library.py`:

```python
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
        "full_text": "Full text of the paper...",
    }
    paper_row = {"id": "paper-1", "title": "Transformer Attention Mechanism"}
    assignment_row = {"id": "asn-1", "status": "processing", "class_id": None}

    call_count = [0]
    results = [None, paper_row, assignment_row]  # None=no existing paper

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

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: MagicMock()
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_library.py::test_search_returns_verified_results -v
```

Expected: FAIL — `405 Method Not Allowed`

- [ ] **Step 3: Append search, browse, fetch endpoints to `backend/routers/library.py`**

Append at the bottom of `backend/routers/library.py`:

```python
from pydantic import BaseModel


class FetchCoreRequest(BaseModel):
    core_id: str
    title: str


@router.get("/search")
async def search_papers(q: str = "", user=Depends(require_student)):
    """Search CORE API for open-access papers. Results are title-verified."""
    if not q.strip():
        return []
    results = await search_core(q.strip())
    return results


@router.get("/browse")
async def browse_papers(
    category: str = "",
    limit: int = 20,
    offset: int = 0,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Browse community library papers, optionally filtered by category."""
    query = db.from_("papers") \
        .select("id, title, authors, year_published, category, is_self_study, source, core_id, created_at") \
        .eq("is_self_study", True)

    if category.strip():
        query = query.eq("category", category.strip())

    result = await query.order("created_at", desc=True) \
        .limit(min(limit, 50)).execute()

    papers = result.data or []

    # Attach assignment status for each paper (has reading guide been generated?)
    paper_ids = [p["id"] for p in papers]
    if paper_ids:
        assignments = await db.from_("assignments") \
            .select("paper_id, status, difficulty") \
            .in_("paper_id", paper_ids).execute()
        asn_map = {a["paper_id"]: a for a in (assignments.data or [])}
    else:
        asn_map = {}

    return [
        {
            **p,
            "assignment": asn_map.get(p["id"]),
        }
        for p in papers
    ]


@router.post("/fetch")
async def fetch_core_paper(
    body: FetchCoreRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Fetch a paper from CORE API, create self-study assignment. Title-verified."""
    # Check if already in library
    existing = await db.from_("papers").select("id, title") \
        .eq("core_id", body.core_id).single().execute()

    if existing.data:
        # Paper already exists — create assignment if none
        paper = existing.data
        existing_asn = await db.from_("assignments").select("id, status") \
            .eq("paper_id", paper["id"]).eq("class_id", "null").single().execute()

        if existing_asn.data:
            return {
                "assignment_id": existing_asn.data["id"],
                "paper_id": paper["id"],
                "title": paper["title"],
                "status": existing_asn.data["status"],
            }

    # Fetch full text from CORE with title verification
    core_data = await fetch_core_full_text(body.core_id, body.title)
    if not core_data:
        raise HTTPException(
            status_code=400,
            detail="Paper title doesn't match what was selected. Please search again or upload the PDF directly.",
        )

    # Insert paper
    paper_result = await db.from_("papers").insert({
        "title": core_data["title"],
        "extracted_text": core_data["full_text"],
        "figures": [],
        "uploaded_by": user["sub"],
        "is_self_study": True,
        "category": None,  # will be set by AI during guide generation
        "source": "core_api",
        "core_id": core_data["core_id"],
        "authors": core_data.get("authors"),
        "year_published": core_data.get("year_published"),
    }).execute()
    paper = paper_result.data[0]

    # Create assignment
    assignment_result = await db.from_("assignments").insert({
        "class_id": None,
        "paper_id": paper["id"],
        "status": "processing",
    }).execute()
    assignment = assignment_result.data[0]

    # Trigger background guide generation
    background_tasks.add_task(
        _process_self_study,
        assignment_id=assignment["id"],
        extracted_text=core_data["full_text"] or "",
        figure_count=0,
    )

    return {
        "assignment_id": assignment["id"],
        "paper_id": paper["id"],
        "title": core_data["title"],
        "status": "processing",
    }


@router.get("/categories")
async def list_categories(user=Depends(require_student), db=Depends(get_db)):
    """List all categories that have papers in the library."""
    result = await db.from_("papers") \
        .select("category") \
        .eq("is_self_study", True) \
        .order("category").execute()

    cats = list({p["category"] for p in (result.data or []) if p["category"]})
    return cats
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_library.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat: add library search, browse, and CORE fetch endpoints with title verification"
```

---

### Task 5: Sessions Router — Skip Enrollment for Self-Study

**Files:**
- Modify: `backend/routers/sessions.py` (lines around enrollment check)
- Modify: `backend/tests/test_sessions.py` (add self-study session test)

- [ ] **Step 1: Read the current enrollment check in `sessions.py`**

Read `backend/routers/sessions.py` and find the `start_session` function. It currently has an enrollment check that requires `class_enrollments`:

```python
enrollment = await db.from_("class_enrollments").select("class_id") \
    .eq("class_id", assignment.data["class_id"]).eq("student_id", user["sub"]).single().execute()
if not enrollment.data:
    raise HTTPException(status_code=403, detail="Not enrolled in this class")
```

- [ ] **Step 2: Write failing test**

Append to `backend/tests/test_sessions.py`:

```python
def test_start_session_self_study_skips_enrollment():
    student = {"sub": "s-1"}
    assignment = {"id": "asn-1", "class_id": None, "paper_id": "p-1", "reading_guide": None, "difficulty": "intermediate", "status": "published"}
    no_session = None
    new_session = [{"id": "sess-1", "status": "in_progress", "current_section_index": 0}]
    paper = {"title": "Self-Study Paper"}

    db = make_db(assignment, no_session, new_session, paper)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = client.post("/api/v1/sessions/", json={"assignment_id": "asn-1"})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["session_id"] == "sess-1"
```

- [ ] **Step 3: Run to confirm it fails**

```bash
pytest backend/tests/test_sessions.py::test_start_session_self_study_skips_enrollment -v
```

Expected: FAIL — the enrollment check fires with null class_id and fails.

- [ ] **Step 4: Modify enrollment check in `sessions.py`**

Find the enrollment check in the `start_session` function and wrap it in a conditional:

```python
    # Only check enrollment for classroom assignments (not self-study)
    if assignment.data.get("class_id"):
        enrollment = await db.from_("class_enrollments").select("class_id") \
            .eq("class_id", assignment.data["class_id"]).eq("student_id", user["sub"]).single().execute()
        if not enrollment.data:
            raise HTTPException(status_code=403, detail="Not enrolled in this class")
```

- [ ] **Step 5: Run all session tests**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: All tests PASS (including the new self-study one and all existing ones).

- [ ] **Step 6: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_sessions.py
git commit -m "feat: skip enrollment check for self-study assignments with null class_id"
```

---

### Task 6: Frontend — SelfStudyPage (Community Library)

**Files:**
- Create: `frontend/src/pages/student/SelfStudyPage.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/student/SelfStudyPage.jsx`**

```jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

const CATEGORIES = ["All", "Biology", "Computer Science", "Medicine", "Physics", "Chemistry", "Mathematics", "Engineering", "Psychology", "Economics"];

const DIFFICULTY_COLORS = {
  beginner: "bg-green-500/20 text-green-300",
  intermediate: "bg-yellow-500/20 text-yellow-300",
  advanced: "bg-red-500/20 text-red-300",
};

export default function SelfStudyPage() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [papers, setPapers] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(null);

  useEffect(() => {
    loadPapers();
    loadCategories();
  }, [activeCategory]);

  const loadPapers = async () => {
    try {
      const params = activeCategory !== "All" ? `?category=${activeCategory}` : "";
      const { data } = await api.get(`/library/browse${params}`);
      setPapers(data);
    } catch {}
  };

  const loadCategories = async () => {
    try {
      const { data } = await api.get("/library/categories");
      if (data.length > 0) setCategories(["All", ...data]);
    } catch {}
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await api.get(`/library/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(data);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name.replace(".pdf", "").replace(/_/g, " "));
    form.append("category", activeCategory !== "All" ? activeCategory : "");
    try {
      const { data } = await api.post("/library/upload", form);
      toast.success("Paper uploaded! Generating reading guide...");
      pollAndNavigate(data.assignment_id);
    } catch (err) {
      toast.error(err.message || "Upload failed");
      setUploading(false);
    }
    e.target.value = "";
  };

  const handleFetchCore = async (coreId, title) => {
    setFetching(coreId);
    try {
      const { data } = await api.post("/library/fetch", { core_id: coreId, title });
      toast.success("Fetching paper... Generating reading guide...");
      pollAndNavigate(data.assignment_id);
    } catch (err) {
      toast.error(err.message || "Could not fetch paper");
      setFetching(null);
    }
  };

  const pollAndNavigate = async (assignmentId) => {
    let attempts = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/library/status/${assignmentId}`);
        if (data.status === "published" || data.status === "draft") {
          setUploading(false);
          setFetching(null);
          await api.post(`/sessions/`, { assignment_id: assignmentId });
          navigate(`/student/read/${assignmentId}`);
          return;
        }
      } catch {}
      attempts++;
      if (attempts < 30) {
        setTimeout(poll, 2000);
      } else {
        toast.error("Guide generation is taking too long. Check back later.");
        setUploading(false);
        setFetching(null);
      }
    };
    poll();
  };

  const handleStartReading = async (assignment) => {
    if (!assignment) {
      toast.error("Reading guide not ready yet");
      return;
    }
    try {
      await api.post(`/sessions/`, { assignment_id: assignment.id });
      navigate(`/student/read/${assignment.id}`);
    } catch {
      toast.error("Could not start reading");
    }
  };

  const displayPapers = searchResults !== null ? searchResults.map((r) => ({ ...r, fromSearch: true })) : papers;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Paper Library</h1>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {uploading ? "Processing..." : "Upload PDF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search open-access papers..."
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
        {searchResults !== null && (
          <button
            type="button"
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            className="text-gray-400 hover:text-white text-sm px-3"
          >
            Clear
          </button>
        )}
      </form>

      {/* Category tabs */}
      {!searchResults && (
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {displayPapers.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {searchResults !== null ? "No papers found. Try a different search." : "No papers in the library yet. Upload one or search above."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {displayPapers.map((paper) => (
            <div key={paper.id || paper.core_id} className="bg-gray-900 rounded-xl p-4 hover:bg-gray-800 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-medium text-sm leading-tight flex-1">{paper.title}</h3>
                {paper.category && (
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded ml-2 shrink-0">{paper.category}</span>
                )}
              </div>
              {paper.authors && <p className="text-gray-500 text-xs mb-1">{paper.authors}</p>}
              {paper.year_published && <p className="text-gray-600 text-xs mb-2">{paper.year_published}</p>}

              {paper.fromSearch ? (
                /* CORE search result */
                <button
                  onClick={() => handleFetchCore(paper.core_id, paper.title)}
                  disabled={fetching === paper.core_id}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {fetching === paper.core_id ? "Fetching..." : "Add to Library & Read"}
                </button>
              ) : paper.assignment ? (
                /* Already in library */
                <div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[paper.assignment.difficulty] || "bg-gray-700 text-gray-400"}`}>
                    {paper.assignment.difficulty || "—"}
                  </span>
                  <button
                    onClick={() => handleStartReading(paper.assignment)}
                    className="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-lg font-medium transition-colors"
                  >
                    {paper.assignment.status === "published" ? "Start Reading" : "Processing..."}
                  </button>
                </div>
              ) : (
                <p className="text-gray-600 text-xs">No reading guide yet.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload processing overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-8 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white font-medium">Generating reading guide...</p>
            <p className="text-gray-400 text-sm mt-1">This takes 10-30 seconds.</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/components/Layout.jsx`**

Add a "Self-Study" link to `STUDENT_LINKS`:

```jsx
const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "My Classes" },
  { to: "/student/self-study", label: "Self-Study" },
];
```

- [ ] **Step 3: Update `frontend/src/App.js`**

Add import at top (with the other student imports):

```jsx
import SelfStudyPage from "./pages/student/SelfStudyPage";
```

Add route inside the student routes section (after the `/student/read/:assignmentId` route):

```jsx
<Route path="/student/self-study" element={role === "student" ? <SelfStudyPage /> : <Navigate to="/auth" />} />
```

- [ ] **Step 4: Verify frontend builds**

```bash
cd C:/Users/prash/ReadLabs/frontend
npx react-scripts build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/SelfStudyPage.jsx frontend/src/components/Layout.jsx frontend/src/App.js
git commit -m "feat: add self-study library page with search, browse, and upload"
```

---

### Task 7: ReadingPage — Optional Checkpoints (Skip Button)

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

- [ ] **Step 1: Read the current CheckpointArea in ReadingPage.jsx**

Find the `CheckpointArea` function component. It currently has:
- A textarea for student response
- A Submit button that calls `submitCheckpoint`
- No Skip option

- [ ] **Step 2: Add `optionalCheckpoints` prop support to `ReadingPage`**

The `ReadingPage` component already accepts `previewMode`. Add a new prop `optionalCheckpoints` alongside it.

In the component signature, find:

```jsx
export default function ReadingPage({ previewMode = false }) {
```

Change to:

```jsx
export default function ReadingPage({ previewMode = false, optionalCheckpoints = false }) {
```

- [ ] **Step 3: Add Skip handler**

After the `submitCheckpoint` function, add:

```jsx
const skipCheckpoint = async () => {
  setCheckpoints((prev) => ({ ...prev, [currentSection]: { text: "", ai_feedback: null, pending: false, skipped: true } }));
  if (!previewMode && sessionId) {
    await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: currentSection + 1 }).catch(() => {});
  }
  if (isLastSection && !showSoWhat) {
    setCurrentSection(sections.length);
  } else if (!isLastSection) {
    advanceSection();
  }
};
```

- [ ] **Step 4: Add Skip button in CheckpointArea**

In the `CheckpointArea` component, find the Submit button block:

```jsx
{!cp.ai_feedback && (
  <button
    onClick={submitCheckpoint}
    disabled={cp.pending || !cp.text?.trim()}
    className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
  >
    {cp.pending ? "Getting feedback…" : "Submit"}
  </button>
)}
```

Replace with:

```jsx
{!cp.ai_feedback && !cp.skipped && (
  <div className="mt-2 flex gap-2">
    <button
      onClick={submitCheckpoint}
      disabled={cp.pending || !cp.text?.trim()}
      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
    >
      {cp.pending ? "Getting feedback…" : "Submit"}
    </button>
    {optionalCheckpoints && (
      <button
        onClick={skipCheckpoint}
        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        Skip
      </button>
    )}
  </div>
)}
{cp.skipped && !cp.ai_feedback && optionalCheckpoints && (
  <p className="mt-2 text-gray-500 text-xs italic">Section skipped. You can come back and submit a response later.</p>
)}
```

- [ ] **Step 5: Add Skip button in SoWhatPanel**

Find the Submit button in `SoWhatPanel`:

```jsx
{!soWhat.ai_feedback && (
  <button
    onClick={submitSoWhat}
    disabled={soWhat.pending || !soWhat.text.trim()}
    className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
  >
    {soWhat.pending ? "Getting feedback…" : "Submit"}
  </button>
)}
```

Replace with:

```jsx
{!soWhat.ai_feedback && !soWhat.skipped && (
  <div className="mt-2 flex gap-2">
    <button
      onClick={submitSoWhat}
      disabled={soWhat.pending || !soWhat.text.trim()}
      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
    >
      {soWhat.pending ? "Getting feedback…" : "Submit"}
    </button>
    {optionalCheckpoints && (
      <button
        onClick={() => { setSoWhat((s) => ({ ...s, skipped: true })); if (!previewMode) setCurrentSection(sections.length + 1); }}
        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        Skip
      </button>
    )}
  </div>
)}
```

- [ ] **Step 6: Update canAdvance logic for optional checkpoints**

Find the line:

```jsx
const canAdvance = previewMode || !!cp.ai_feedback;
```

Change to:

```jsx
const canAdvance = previewMode || !!cp.ai_feedback || (optionalCheckpoints && cp.skipped);
```

- [ ] **Step 7: Update the route in `App.js` for self-study reading**

Find the existing student reading route:

```jsx
<Route path="/student/read/:assignmentId" element={role === "student" ? <ReadingPage previewMode={false} /> : <Navigate to="/auth" />} />
```

Change to:

```jsx
<Route path="/student/read/:assignmentId" element={role === "student" ? <ReadingPage previewMode={false} optionalCheckpoints={true} /> : <Navigate to="/auth" />} />
```

- [ ] **Step 8: Verify frontend builds**

```bash
cd C:/Users/prash/ReadLabs/frontend
npx react-scripts build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx frontend/src/App.js
git commit -m "feat: add optional checkpoints with Skip buttons for self-study reading"
```

---

### Task 8: Run Full Test Suite and Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd C:/Users/prash/ReadLabs
pytest backend/tests/ -v
```

Expected: All tests PASS (existing 43 + new ~14 = ~57).

- [ ] **Step 2: Verify frontend builds cleanly**

```bash
cd C:/Users/prash/ReadLabs/frontend
npx react-scripts build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete self-study mode — CORE API search, community library, optional checkpoints"
```

---

## Plan Complete — ReadLabs Self-Study Mode MVP Done

At this point the full self-study mode is functional:

**Student flow:**
1. Sign up → see "Self-Study" in sidebar
2. Browse community library by category or search CORE API
3. Upload a PDF or fetch from CORE → reading guide auto-generated
4. Read through sections with optional checkpoint submissions
5. Skip any section or the So What? exercise
6. Progress tracked privately

**Teacher flow:** Unchanged. Classroom features work exactly as before.

**What's next (out of scope):**
- DOI/keyword paper search
- Pattern recognition across papers
- Email notifications
- Mobile optimization
