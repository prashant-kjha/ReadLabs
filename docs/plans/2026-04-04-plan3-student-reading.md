# Plan 3: Student Reading Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full student reading experience — class enrollment, assignment dashboard, Socratic section-by-section reading interface with AI checkpoint feedback, jargon lookup with caching, So What? evaluation, and teacher preview mode.

**Architecture:** Two new backend routers (`enrollment`, `sessions`) with async AI feedback via BackgroundTasks + polling. Key terms cached in `key_term_definitions` table. `ReadingPage` is shared between student and teacher preview routes via a `previewMode` prop. Three stateless preview endpoints let teachers test AI tools without writing to the DB.

**Tech Stack:** FastAPI, Python 3.14, Supabase (custom QueryBuilder + supabase-py for background writes), Google Gemini 2.5 Flash, React 18, React Router v6, Tailwind CSS, react-hot-toast, pytest

---

## File Map

```
backend/
  ai_provider.py                     MODIFY — add generate_checkpoint_feedback, generate_sowhat_feedback, generate_jargon_explanation
  db.py                              MODIFY — add in_() method to QueryBuilder
  routers/
    enrollment.py                    NEW — join class, list enrolled classes (with assignments), leave class
    sessions.py                      NEW — start/resume session, list, get, progress, checkpoint, sowhat, jargon, keyterm, preview endpoints
  main.py                            MODIFY — register enrollment and sessions routers
  tests/
    test_enrollment.py               NEW
    test_sessions.py                 NEW

frontend/src/
  pages/student/
    StudentDashboardPage.jsx         NEW — join class modal + enrolled classes + assignment cards with progress pills
    ReadingPage.jsx                  NEW — layout toggle, section sidebar, key term highlights, checkpoint flow, jargon drawer, So What?
  pages/teacher/
    AssignmentReviewPage.jsx         MODIFY — add "Preview as Student" button
  App.js                             MODIFY — add student and preview routes
  components/Layout.jsx              MODIFY — update student sidebar nav
```

---

### Task 1: Create `key_term_definitions` table in Supabase

**Files:** None (SQL run in Supabase dashboard)

- [ ] **Step 1: Run this SQL in the Supabase dashboard SQL editor**

```sql
CREATE TABLE key_term_definitions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  term          TEXT NOT NULL,
  explanation   TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assignment_id, term)
);

ALTER TABLE key_term_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read key_term_definitions"
  ON key_term_definitions FOR SELECT
  TO authenticated
  USING (true);
```

- [ ] **Step 2: Verify**

In the Supabase dashboard Table Editor, confirm `key_term_definitions` appears with the correct columns.

---

### Task 2: Add `in_()` to QueryBuilder

**Files:**
- Modify: `backend/db.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_db.py`:

```python
import pytest
from backend.db import QueryBuilder


def test_in_filter_produces_correct_param():
    qb = QueryBuilder("papers")
    qb.in_("id", ["abc", "def", "ghi"])
    assert qb._params["id"] == "in.(abc,def,ghi)"


def test_in_filter_is_chainable():
    qb = QueryBuilder("assignments")
    qb.in_("class_id", ["c1", "c2"]).eq("status", "published")
    assert qb._params["class_id"] == "in.(c1,c2)"
    assert qb._params["status"] == "eq.published"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd C:/Users/prash/ReadLabAI
pytest backend/tests/test_db.py -v
```

Expected: `FAILED — AttributeError: 'QueryBuilder' object has no attribute 'in_'`

- [ ] **Step 3: Add `in_()` to QueryBuilder in `backend/db.py`**

After the `eq` method (around line 57), add:

```python
    def in_(self, column: str, values: list) -> "QueryBuilder":
        self._params[column] = f"in.({','.join(str(v) for v in values)})"
        return self
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pytest backend/tests/test_db.py -v
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/db.py backend/tests/test_db.py
git commit -m "feat: add in_() filter method to QueryBuilder"
```

---

### Task 3: Add AI Functions — checkpoint feedback, So What? feedback, jargon explanation

**Files:**
- Modify: `backend/ai_provider.py`
- Modify: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_ai_provider.py`:

```python
from backend.ai_provider import generate_checkpoint_feedback, generate_sowhat_feedback, generate_jargon_explanation


@pytest.mark.asyncio
async def test_generate_checkpoint_feedback_returns_string():
    mock_response = MagicMock()
    mock_response.text = "You correctly identified the sample size. However, you missed that the study used a double-blind design."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_checkpoint_feedback(
            section_title="Methods",
            guiding_questions=["Look for: how many participants?", "Consider: what controls were used?"],
            student_text="They studied some people and measured outcomes.",
        )

    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_generate_sowhat_feedback_returns_string():
    mock_response = MagicMock()
    mock_response.text = "You noted this advances treatment options. However, the paper shows 30% reduction, not a cure."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_sowhat_feedback(
            paper_title="RCT Study of Drug X",
            section_titles=["Abstract", "Methods", "Results"],
            difficulty="intermediate",
            student_text="This study proves the drug cures the disease.",
        )

    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_generate_jargon_explanation_returns_string():
    mock_response = MagicMock()
    mock_response.text = "RCT stands for Randomized Controlled Trial — participants are randomly assigned to groups."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_jargon_explanation(
            term="RCT",
            context_snippet="This randomized controlled trial enrolled 42 patients...",
        )

    assert isinstance(result, str)
    assert len(result) > 10
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_ai_provider.py::test_generate_checkpoint_feedback_returns_string -v
```

Expected: `FAILED — ImportError: cannot import name 'generate_checkpoint_feedback'`

- [ ] **Step 3: Append three functions to `backend/ai_provider.py`**

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_checkpoint_feedback(
    section_title: str,
    guiding_questions: list[str],
    student_text: str,
) -> str:
    """Socratic feedback on a checkpoint response. Never gives away the answer."""
    questions_block = "\n".join(f"- {q}" for q in guiding_questions)
    prompt = f"""A student was asked to read the "{section_title}" section with these guiding questions in mind:

{questions_block}

The student wrote:
{student_text}

In 2–3 sentences: acknowledge one specific thing they captured correctly, then point to one specific thing they missed or misunderstood relative to the guiding questions. Do not rewrite their response or summarize the section. Be encouraging but precise. Return only the feedback text, no labels or headers."""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.4),
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_sowhat_feedback(
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> str:
    """Evaluate the student's significance claim against the paper structure."""
    sections_block = ", ".join(section_titles)
    prompt = f"""A student read a {difficulty}-level research paper titled "{paper_title}".
The paper covers these sections: {sections_block}.

The student wrote this "So What?" paragraph about the paper's significance:
{student_text}

In 3–4 sentences: affirm one thing they got right about the paper's significance, then identify one specific place where they overstated, understated, or mischaracterized the contribution. Be specific and encouraging. Return only the feedback text, no labels or headers."""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.4),
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_jargon_explanation(term: str, context_snippet: str) -> str:
    """Explain a term in plain English as used in this specific paper."""
    prompt = f"""In the context of this research paper, explain what "{term}" means in plain English.
Keep the explanation to 2–3 sentences. Do not use other technical jargon. Be specific to how this term is used here.

Paper context:
{context_snippet[:500]}

Return only the explanation, no labels or headers."""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.3),
    )
    return response.text.strip()
```

- [ ] **Step 4: Run all three new tests**

```bash
pytest backend/tests/test_ai_provider.py -v -k "checkpoint_feedback or sowhat_feedback or jargon_explanation"
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: add checkpoint feedback, sowhat feedback, and jargon explanation AI functions"
```

---

### Task 4: Create Enrollment Router

**Files:**
- Create: `backend/routers/enrollment.py`
- Create: `backend/tests/test_enrollment.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_enrollment.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_enrollment.py -v
```

Expected: `FAILED — 404 Not Found` (router not registered yet)

- [ ] **Step 3: Create `backend/routers/enrollment.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student

router = APIRouter()


class JoinRequest(BaseModel):
    class_code: str


@router.post("/join")
async def join_class(body: JoinRequest, user=Depends(require_student), db=Depends(get_db)):
    # Look up class by code (case-insensitive)
    cls = await db.from_("classes").select("id, name, teacher_id") \
        .eq("class_code", body.class_code.upper()).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    class_id = cls.data["id"]

    # Check not already enrolled
    existing = await db.from_("class_enrollments").select("class_id") \
        .eq("class_id", class_id).eq("student_id", user["sub"]).single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Already enrolled in this class")

    # Get student display name
    profile = await db.from_("user_profiles").select("name") \
        .eq("user_id", user["sub"]).single().execute()
    student_name = profile.data["name"] if profile.data else "Student"

    await db.from_("class_enrollments").insert({
        "class_id": class_id,
        "student_id": user["sub"],
        "student_name": student_name,
    }).execute()

    return {"class_id": class_id, "class_name": cls.data["name"]}


@router.get("/classes")
async def list_enrolled_classes(user=Depends(require_student), db=Depends(get_db)):
    enrollments = await db.from_("class_enrollments").select("class_id, enrolled_at") \
        .eq("student_id", user["sub"]).execute()
    if not enrollments.data:
        return []

    class_ids = [e["class_id"] for e in enrollments.data]
    enrollment_map = {e["class_id"]: e["enrolled_at"] for e in enrollments.data}

    classes = await db.from_("classes").select("id, name, class_code, teacher_id") \
        .in_("id", class_ids).execute()
    if not classes.data:
        return []

    class_map = {c["id"]: c for c in classes.data}
    teacher_ids = list({c["teacher_id"] for c in classes.data})

    teachers = await db.from_("user_profiles").select("user_id, name") \
        .in_("user_id", teacher_ids).execute()
    teacher_map = {t["user_id"]: t["name"] for t in (teachers.data or [])}

    assignments = await db.from_("assignments").select("id, class_id, paper_id, difficulty, created_at") \
        .in_("class_id", class_ids).eq("status", "published").execute()

    paper_ids = list({a["paper_id"] for a in (assignments.data or [])})
    if paper_ids:
        papers = await db.from_("papers").select("id, title").in_("id", paper_ids).execute()
        paper_map = {p["id"]: p["title"] for p in (papers.data or [])}
    else:
        paper_map = {}

    assignment_map: dict = {}
    for a in (assignments.data or []):
        assignment_map.setdefault(a["class_id"], []).append({
            "id": a["id"],
            "paper_title": paper_map.get(a["paper_id"], "Unknown"),
            "difficulty": a["difficulty"],
            "created_at": a["created_at"],
        })

    return [
        {
            "class_id": cid,
            "class_name": class_map[cid]["name"],
            "class_code": class_map[cid]["class_code"],
            "teacher_name": teacher_map.get(class_map[cid]["teacher_id"], "Unknown"),
            "enrolled_at": enrollment_map[cid],
            "assignments": assignment_map.get(cid, []),
        }
        for cid in class_ids if cid in class_map
    ]


@router.delete("/classes/{class_id}")
async def leave_class(class_id: str, user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("class_enrollments").delete() \
        .eq("class_id", class_id).eq("student_id", user["sub"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return {"ok": True}
```

- [ ] **Step 4: Register router temporarily in `backend/main.py`** (Sessions router comes next task — add both at once in Task 8, but register enrollment now so tests run)

Add to `backend/main.py`:

```python
from backend.routers import auth, papers, classes, assignments, enrollment
# ...
app.include_router(enrollment.router, prefix="/api/v1/enrollment", tags=["enrollment"])
```

- [ ] **Step 5: Run enrollment tests**

```bash
pytest backend/tests/test_enrollment.py -v
```

Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/routers/enrollment.py backend/tests/test_enrollment.py backend/main.py
git commit -m "feat: add enrollment router with join, list, and leave endpoints"
```

---

### Task 5: Sessions Router — Core Endpoints

**Files:**
- Create: `backend/routers/sessions.py`
- Create: `backend/tests/test_sessions.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_sessions.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: `FAILED — 404 Not Found` (router not registered yet)

- [ ] **Step 3: Create `backend/routers/sessions.py` with core endpoints**

```python
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student, require_teacher
from backend.config import get_settings
from backend.ai_provider import generate_checkpoint_feedback, generate_sowhat_feedback, generate_jargon_explanation

router = APIRouter()
settings = get_settings()


# ── Request models ────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    assignment_id: str

class ProgressRequest(BaseModel):
    current_section_index: int

class CheckpointRequest(BaseModel):
    section_index: int
    student_text: str

class SoWhatRequest(BaseModel):
    student_text: str

class JargonRequest(BaseModel):
    term: str
    context_snippet: str

class KeyTermRequest(BaseModel):
    term: str
    context_snippet: str

class PreviewCheckpointRequest(BaseModel):
    section_title: str
    guiding_questions: list[str]
    student_text: str

class PreviewSoWhatRequest(BaseModel):
    paper_title: str
    section_titles: list[str]
    difficulty: str
    student_text: str

class PreviewJargonRequest(BaseModel):
    term: str
    context_snippet: str

class PreviewKeyTermRequest(BaseModel):
    assignment_id: str
    term: str
    context_snippet: str


# ── Core session endpoints ────────────────────────────────────────────────────

@router.post("/")
async def start_session(body: StartSessionRequest, user=Depends(require_student), db=Depends(get_db)):
    assignment = await db.from_("assignments") \
        .select("id, class_id, paper_id, reading_guide, difficulty, status") \
        .eq("id", body.assignment_id).single().execute()
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.data["status"] != "published":
        raise HTTPException(status_code=403, detail="Assignment is not published")

    enrollment = await db.from_("class_enrollments").select("class_id") \
        .eq("class_id", assignment.data["class_id"]).eq("student_id", user["sub"]).single().execute()
    if not enrollment.data:
        raise HTTPException(status_code=403, detail="Not enrolled in this class")

    existing = await db.from_("student_sessions") \
        .select("id, status, current_section_index") \
        .eq("student_id", user["sub"]).eq("assignment_id", body.assignment_id).single().execute()

    if existing.data:
        session = existing.data
    else:
        result = await db.from_("student_sessions").insert({
            "student_id": user["sub"],
            "assignment_id": body.assignment_id,
            "status": "in_progress",
            "current_section_index": 0,
        }).execute()
        session = result.data[0]

    paper = await db.from_("papers").select("title") \
        .eq("id", assignment.data["paper_id"]).single().execute()

    return {
        "session_id": session["id"],
        "assignment_id": body.assignment_id,
        "status": session["status"],
        "current_section_index": session["current_section_index"],
        "reading_guide": assignment.data["reading_guide"],
        "paper_title": paper.data["title"] if paper.data else "Unknown",
        "difficulty": assignment.data["difficulty"],
    }


@router.get("/")
async def list_sessions(user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("student_sessions") \
        .select("id, assignment_id, status, current_section_index") \
        .eq("student_id", user["sub"]).execute()
    return result.data or []


@router.get("/{session_id}")
async def get_session(session_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions") \
        .select("id, assignment_id, status, current_section_index") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    checkpoints = await db.from_("checkpoint_responses") \
        .select("id, section_index, student_text, ai_feedback, submitted_at") \
        .eq("session_id", session_id).execute()

    sowhat = await db.from_("sowhat_responses") \
        .select("id, student_text, ai_feedback, submitted_at") \
        .eq("session_id", session_id).single().execute()

    jargon = await db.from_("jargon_lookups") \
        .select("id, term, explanation, created_at") \
        .eq("session_id", session_id).execute()

    return {
        **session.data,
        "checkpoints": checkpoints.data or [],
        "sowhat": sowhat.data,
        "jargon_lookups": jargon.data or [],
    }


@router.patch("/{session_id}/progress")
async def update_progress(session_id: str, body: ProgressRequest, user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("student_sessions") \
        .update({"current_section_index": body.current_section_index}) \
        .eq("id", session_id).eq("student_id", user["sub"]).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}
```

- [ ] **Step 4: Register sessions router in `backend/main.py`**

```python
from backend.routers import auth, papers, classes, assignments, enrollment, sessions
# ...
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
```

- [ ] **Step 5: Run core session tests**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_sessions.py backend/main.py
git commit -m "feat: add sessions router with start, list, get, and progress endpoints"
```

---

### Task 6: Sessions Router — Checkpoint and So What? Async Endpoints

**Files:**
- Modify: `backend/routers/sessions.py`
- Modify: `backend/tests/test_sessions.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_sessions.py`:

```python
def test_submit_checkpoint_returns_pending():
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    assignment = {"reading_guide": GUIDE}
    checkpoint = [{"id": "cp-1", "section_index": 0, "student_text": "My answer", "ai_feedback": None}]

    db = make_db(session, assignment, checkpoint)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.sessions._run_checkpoint_feedback"):
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
        with patch("backend.routers.sessions._run_sowhat_feedback"):
            r = client.post("/api/v1/sessions/sess-1/sowhat",
                            json={"student_text": "It matters because..."})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["feedback_pending"] is True
```

- [ ] **Step 2: Run to confirm they fail**

```bash
pytest backend/tests/test_sessions.py::test_submit_checkpoint_returns_pending -v
```

Expected: `FAILED — 405 Method Not Allowed`

- [ ] **Step 3: Append checkpoint and sowhat endpoints + background functions to `backend/routers/sessions.py`**

```python
# ── Background task helpers ───────────────────────────────────────────────────

async def _run_checkpoint_feedback(
    checkpoint_id: str,
    section_title: str,
    guiding_questions: list[str],
    student_text: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    feedback = await generate_checkpoint_feedback(section_title, guiding_questions, student_text)
    supa.table("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()


async def _run_sowhat_feedback(
    sowhat_id: str,
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    feedback = await generate_sowhat_feedback(paper_title, section_titles, difficulty, student_text)
    supa.table("sowhat_responses").update({"ai_feedback": feedback}).eq("id", sowhat_id).execute()


async def _run_jargon_explanation(
    lookup_id: str,
    term: str,
    context_snippet: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    explanation = await generate_jargon_explanation(term, context_snippet)
    supa.table("jargon_lookups").update({"explanation": explanation}).eq("id", lookup_id).execute()


# ── Checkpoint ────────────────────────────────────────────────────────────────

@router.post("/{session_id}/checkpoint")
async def submit_checkpoint(
    session_id: str,
    body: CheckpointRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id, assignment_id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    assignment = await db.from_("assignments").select("reading_guide") \
        .eq("id", session.data["assignment_id"]).single().execute()
    sections = assignment.data["reading_guide"]["sections"]
    if body.section_index >= len(sections):
        raise HTTPException(status_code=400, detail="Invalid section index")
    section = sections[body.section_index]

    result = await db.from_("checkpoint_responses").upsert({
        "session_id": session_id,
        "section_index": body.section_index,
        "student_text": body.student_text,
        "ai_feedback": None,
    }, on_conflict="session_id,section_index").execute()
    checkpoint_id = result.data[0]["id"]

    background_tasks.add_task(
        _run_checkpoint_feedback,
        checkpoint_id=checkpoint_id,
        section_title=section["title"],
        guiding_questions=section["guiding_questions"],
        student_text=body.student_text,
    )
    return {"id": checkpoint_id, "feedback_pending": True}


# ── So What? ─────────────────────────────────────────────────────────────────

@router.post("/{session_id}/sowhat")
async def submit_sowhat(
    session_id: str,
    body: SoWhatRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id, assignment_id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    assignment = await db.from_("assignments").select("reading_guide, paper_id") \
        .eq("id", session.data["assignment_id"]).single().execute()
    guide = assignment.data["reading_guide"]
    section_titles = [s["title"] for s in guide["sections"]]

    paper = await db.from_("papers").select("title") \
        .eq("id", assignment.data["paper_id"]).single().execute()
    paper_title = paper.data["title"] if paper.data else "Unknown"

    result = await db.from_("sowhat_responses").upsert({
        "session_id": session_id,
        "student_text": body.student_text,
        "ai_feedback": None,
    }, on_conflict="session_id").execute()
    sowhat_id = result.data[0]["id"]

    background_tasks.add_task(
        _run_sowhat_feedback,
        sowhat_id=sowhat_id,
        paper_title=paper_title,
        section_titles=section_titles,
        difficulty=guide.get("difficulty", "intermediate"),
        student_text=body.student_text,
    )
    return {"id": sowhat_id, "feedback_pending": True}
```

- [ ] **Step 4: Run checkpoint and sowhat tests**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_sessions.py
git commit -m "feat: add async checkpoint and sowhat submission endpoints"
```

---

### Task 7: Sessions Router — Jargon, Key Term, and Preview Endpoints

**Files:**
- Modify: `backend/routers/sessions.py`
- Modify: `backend/tests/test_sessions.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_sessions.py`:

```python
def test_jargon_lookup_returns_pending():
    student = {"sub": "s-1"}
    session = {"id": "sess-1", "assignment_id": "asn-1"}
    no_existing = None
    inserted = [{"id": "jargon-1", "term": "rct", "explanation": None}]

    db = make_db(session, no_existing, inserted)

    app.dependency_overrides[require_student] = lambda: student
    app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("backend.routers.sessions._run_jargon_explanation"):
            r = client.post("/api/v1/sessions/sess-1/jargon",
                            json={"term": "RCT", "context_snippet": "...RCT was used..."})
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["feedback_pending"] is True


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


def test_preview_checkpoint_returns_feedback():
    teacher = {"sub": "t-1"}
    app.dependency_overrides[require_teacher] = lambda: teacher
    try:
        with patch("backend.routers.sessions.generate_checkpoint_feedback",
                   new=AsyncMock(return_value="Good job noting X. You missed Y.")):
            r = client.post("/api/v1/sessions/preview/checkpoint", json={
                "section_title": "Methods",
                "guiding_questions": ["Look for: sample size"],
                "student_text": "They used many people.",
            })
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert "feedback" in r.json()
```

- [ ] **Step 2: Run to confirm they fail**

```bash
pytest backend/tests/test_sessions.py::test_jargon_lookup_returns_pending -v
```

Expected: `FAILED — 405 Method Not Allowed`

- [ ] **Step 3: Append jargon, keyterm, and preview endpoints to `backend/routers/sessions.py`**

```python
# ── Jargon lookup (ad-hoc, async) ────────────────────────────────────────────

@router.post("/{session_id}/jargon")
async def lookup_jargon(
    session_id: str,
    body: JargonRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    # Deduplicate within session
    existing = await db.from_("jargon_lookups").select("id, explanation") \
        .eq("session_id", session_id).eq("term", body.term.lower()).single().execute()
    if existing.data and existing.data.get("explanation"):
        return {"id": existing.data["id"], "term": body.term, "explanation": existing.data["explanation"], "feedback_pending": False}

    result = await db.from_("jargon_lookups").insert({
        "session_id": session_id,
        "term": body.term.lower(),
        "explanation": None,
    }).execute()
    lookup_id = result.data[0]["id"]

    background_tasks.add_task(
        _run_jargon_explanation,
        lookup_id=lookup_id,
        term=body.term,
        context_snippet=body.context_snippet,
    )
    return {"id": lookup_id, "term": body.term, "feedback_pending": True}


# ── Key term lookup (cached, near-synchronous) ────────────────────────────────

@router.post("/{session_id}/keyterm")
async def lookup_keyterm(
    session_id: str,
    body: KeyTermRequest,
    user=Depends(require_student),
    db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("assignment_id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    assignment_id = session.data["assignment_id"]

    cached = await db.from_("key_term_definitions").select("explanation") \
        .eq("assignment_id", assignment_id).eq("term", body.term.lower()).single().execute()
    if cached.data:
        return {"term": body.term, "explanation": cached.data["explanation"], "cached": True}

    explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    await db.from_("key_term_definitions").upsert({
        "assignment_id": assignment_id,
        "term": body.term.lower(),
        "explanation": explanation,
    }, on_conflict="assignment_id,term").execute()

    return {"term": body.term, "explanation": explanation, "cached": False}


# ── Preview endpoints (teacher, stateless) ────────────────────────────────────

@router.post("/preview/checkpoint")
async def preview_checkpoint(body: PreviewCheckpointRequest, user=Depends(require_teacher)):
    feedback = await generate_checkpoint_feedback(
        section_title=body.section_title,
        guiding_questions=body.guiding_questions,
        student_text=body.student_text,
    )
    return {"feedback": feedback}


@router.post("/preview/sowhat")
async def preview_sowhat(body: PreviewSoWhatRequest, user=Depends(require_teacher)):
    feedback = await generate_sowhat_feedback(
        paper_title=body.paper_title,
        section_titles=body.section_titles,
        difficulty=body.difficulty,
        student_text=body.student_text,
    )
    return {"feedback": feedback}


@router.post("/preview/jargon")
async def preview_jargon(body: PreviewJargonRequest, user=Depends(require_teacher)):
    explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    return {"term": body.term, "explanation": explanation}


@router.post("/preview/keyterm")
async def preview_keyterm(body: PreviewKeyTermRequest, user=Depends(require_teacher), db=Depends(get_db)):
    cached = await db.from_("key_term_definitions").select("explanation") \
        .eq("assignment_id", body.assignment_id).eq("term", body.term.lower()).single().execute()
    if cached.data:
        return {"term": body.term, "explanation": cached.data["explanation"], "cached": True}

    explanation = await generate_jargon_explanation(body.term, body.context_snippet)
    await db.from_("key_term_definitions").upsert({
        "assignment_id": body.assignment_id,
        "term": body.term.lower(),
        "explanation": explanation,
    }, on_conflict="assignment_id,term").execute()

    return {"term": body.term, "explanation": explanation, "cached": False}
```

- [ ] **Step 4: Run all session tests**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_sessions.py
git commit -m "feat: add jargon, keyterm, and preview endpoints to sessions router"
```

---

### Task 8: Update Routing, Nav, and App.js

**Files:**
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Read current App.js**

```bash
cat frontend/src/App.js
```

- [ ] **Step 2: Add student and preview routes to `frontend/src/App.js`**

Add these imports at the top:

```js
import StudentDashboardPage from "./pages/student/StudentDashboardPage";
import ReadingPage from "./pages/student/ReadingPage";
```

Add these routes inside the student-protected section (alongside any existing student routes):

```jsx
<Route path="/student/dashboard" element={<StudentDashboardPage />} />
<Route path="/student/read/:assignmentId" element={<ReadingPage previewMode={false} />} />
<Route path="/teacher/assignments/:assignmentId/preview" element={<ReadingPage previewMode={true} />} />
```

- [ ] **Step 3: Update student nav in `frontend/src/components/Layout.jsx`**

Find the student nav section (the part that renders when `role === 'student'`) and replace it with:

```jsx
{role === "student" && (
  <NavLink
    to="/student/dashboard"
    className={({ isActive }) =>
      `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
      }`
    }
  >
    My Classes
  </NavLink>
)}
```

- [ ] **Step 4: Restart backend and verify routes load**

```bash
# Kill and restart backend
cd C:/Users/prash/ReadLabAI
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
sleep 4 && curl -s http://localhost:8000/api/v1/sessions/ | head -c 100
```

Expected: `{"detail":"Not authenticated"}` (401 — route exists, auth guard works)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.js frontend/src/components/Layout.jsx
git commit -m "feat: add student dashboard, reading, and teacher preview routes"
```

---

### Task 9: Student Dashboard Page

**Files:**
- Create: `frontend/src/pages/student/StudentDashboardPage.jsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p C:/Users/prash/ReadLabAI/frontend/src/pages/student
```

- [ ] **Step 2: Create `frontend/src/pages/student/StudentDashboardPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

const DIFFICULTY_COLORS = {
  beginner: "bg-green-500/20 text-green-300",
  intermediate: "bg-yellow-500/20 text-yellow-300",
  advanced: "bg-red-500/20 text-red-300",
};

const STATUS_COLORS = {
  not_started: "bg-gray-700 text-gray-400",
  in_progress: "bg-blue-500/20 text-blue-300",
  completed: "bg-green-500/20 text-green-300",
};

export default function StudentDashboardPage() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [classCode, setClassCode] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [classRes, sessionRes] = await Promise.all([
        api.get("/enrollment/classes"),
        api.get("/sessions/"),
      ]);
      setClasses(classRes.data);
      setSessions(sessionRes.data);
    } catch (err) {
      toast.error(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!classCode.trim()) return;
    setJoining(true);
    try {
      await api.post("/enrollment/join", { class_code: classCode.trim().toUpperCase() });
      toast.success("Joined class!");
      setShowModal(false);
      setClassCode("");
      loadData();
    } catch (err) {
      toast.error(err.message || "Could not join class");
    } finally {
      setJoining(false);
    }
  };

  const getSessionStatus = (assignmentId) => {
    const session = sessions.find((s) => s.assignment_id === assignmentId);
    return session ? session.status : "not_started";
  };

  const getSessionLabel = (status) => {
    return { not_started: "Not Started", in_progress: "In Progress", completed: "Completed" }[status] || status;
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">My Classes</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Join a Class
        </button>
      </div>

      {/* Join modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-semibold mb-4">Join a Class</h2>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                placeholder="Class code (e.g. BIO-4X2K)"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 font-mono tracking-widest"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={joining}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {joining ? "Joining..." : "Join"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setClassCode(""); }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Classes list */}
      {classes.length === 0 ? (
        <p className="text-gray-500 text-sm">No classes yet. Join one using a class code from your teacher.</p>
      ) : (
        <div className="space-y-6">
          {classes.map((cls) => (
            <div key={cls.class_id} className="bg-gray-900 rounded-xl p-5">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-white font-semibold text-lg">{cls.class_name}</h2>
                <span className="text-xs text-gray-500 font-mono">{cls.class_code}</span>
              </div>
              <p className="text-gray-500 text-sm mb-4">Teacher: {cls.teacher_name}</p>

              {cls.assignments.length === 0 ? (
                <p className="text-gray-600 text-sm">No published assignments yet.</p>
              ) : (
                <div className="space-y-2">
                  {cls.assignments.map((asgn) => {
                    const status = getSessionStatus(asgn.id);
                    return (
                      <button
                        key={asgn.id}
                        onClick={() => navigate(`/student/read/${asgn.id}`)}
                        className="w-full text-left bg-gray-800 hover:bg-gray-750 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="text-white text-sm font-medium">{asgn.paper_title}</p>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[asgn.difficulty] || "bg-gray-700 text-gray-400"}`}>
                            {asgn.difficulty}
                          </span>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                          {getSessionLabel(status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Sign in as a student. Navigate to `/student/dashboard`. Confirm:
- "My Classes" header and "+ Join a Class" button render
- Clicking "+ Join a Class" opens the modal
- Entering an invalid code shows an error toast
- Entering a valid class code joins and reloads the list

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/student/StudentDashboardPage.jsx
git commit -m "feat: add student dashboard with join class modal and assignment cards"
```

---

### Task 10: Reading Page — Skeleton, Layout Toggle, Section Sidebar, Paper Text

**Files:**
- Create: `frontend/src/pages/student/ReadingPage.jsx`

- [ ] **Step 1: Create `frontend/src/pages/student/ReadingPage.jsx`** with the skeleton, layout toggle, section sidebar, and paper text display

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

// Renders paper text with key terms highlighted
function HighlightedText({ text, keyTerms, onTermClick }) {
  if (!text) return null;
  if (!keyTerms || keyTerms.length === 0) {
    return <span className="whitespace-pre-wrap leading-relaxed">{text}</span>;
  }
  const escaped = keyTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const isKey = keyTerms.some((t) => t.toLowerCase() === part.toLowerCase());
        return isKey ? (
          <span
            key={i}
            className="underline decoration-yellow-400 decoration-2 cursor-pointer hover:bg-yellow-400/10 rounded px-0.5"
            onClick={() => onTermClick(part)}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}

export default function ReadingPage({ previewMode = false }) {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [readingGuide, setReadingGuide] = useState(null);
  const [paperTitle, setPaperTitle] = useState("");
  const [currentSection, setCurrentSection] = useState(0);
  const [layout, setLayout] = useState(
    () => localStorage.getItem("readlab_layout_preference") || "stacked"
  );
  const [checkpoints, setCheckpoints] = useState({});
  const [soWhat, setSoWhat] = useState({ text: "", ai_feedback: null, pending: false });
  const [jargonDrawer, setJargonDrawer] = useState({ open: false, term: "", explanation: null, pending: false });
  const [floatingLookup, setFloatingLookup] = useState(null);
  const [manualTerm, setManualTerm] = useState("");
  const pollRef = useRef(null);
  const textRef = useRef(null);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (previewMode) {
      initPreview();
    } else {
      initSession();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [assignmentId]);

  const initPreview = async () => {
    try {
      const { data } = await api.get(`/assignments/${assignmentId}`);
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper Preview");
      setLoading(false);
    } catch (err) {
      toast.error(err.message || "Could not load assignment");
    }
  };

  const initSession = async () => {
    try {
      const { data } = await api.post("/sessions/", { assignment_id: assignmentId });
      setSessionId(data.session_id);
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper");
      setCurrentSection(data.current_section_index || 0);
      // Hydrate existing checkpoints
      const cpMap = {};
      (data.checkpoints || []).forEach((cp) => {
        cpMap[cp.section_index] = {
          text: cp.student_text,
          ai_feedback: cp.ai_feedback,
          pending: !cp.ai_feedback && !!cp.student_text,
        };
      });
      setCheckpoints(cpMap);
      if (data.sowhat) {
        setSoWhat({ text: data.sowhat.student_text, ai_feedback: data.sowhat.ai_feedback, pending: !data.sowhat.ai_feedback });
      }
      setLoading(false);
    } catch (err) {
      toast.error(err.message || "Could not start session");
    }
  };

  // ── Layout toggle ──────────────────────────────────────────────────────────

  const toggleLayout = () => {
    const next = layout === "stacked" ? "side" : "stacked";
    setLayout(next);
    localStorage.setItem("readlab_layout_preference", next);
  };

  // ── Polling ────────────────────────────────────────────────────────────────

  const startPolling = useCallback((sid) => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/sessions/${sid}`);
        let pending = false;

        const cpMap = {};
        (data.checkpoints || []).forEach((cp) => {
          cpMap[cp.section_index] = { text: cp.student_text, ai_feedback: cp.ai_feedback, pending: !cp.ai_feedback };
          if (!cp.ai_feedback) pending = true;
        });
        setCheckpoints(cpMap);

        if (data.sowhat) {
          setSoWhat({ text: data.sowhat.student_text, ai_feedback: data.sowhat.ai_feedback, pending: !data.sowhat.ai_feedback });
          if (!data.sowhat.ai_feedback) pending = true;
        }

        setJargonDrawer((prev) => {
          if (!prev.pending) return prev;
          const match = (data.jargon_lookups || []).find(
            (j) => j.term === prev.term.toLowerCase() && j.explanation
          );
          if (match) return { ...prev, explanation: match.explanation, pending: false };
          pending = true;
          return prev;
        });

        if (!pending) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {}
    }, 2000);
  }, []);

  // ── Section navigation ─────────────────────────────────────────────────────

  const advanceSection = async () => {
    const next = currentSection + 1;
    setCurrentSection(next);
    if (!previewMode && sessionId) {
      await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: next }).catch(() => {});
    }
  };

  // ── Text selection for highlight-to-lookup ─────────────────────────────────

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setFloatingLookup(null); return; }
    const text = sel.toString().trim();
    if (text.length < 2) { setFloatingLookup(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setFloatingLookup({ text, top: rect.top + window.scrollY - 44, left: Math.min(rect.left, window.innerWidth - 120) });
  };

  // ── Jargon lookup (highlight or manual) ───────────────────────────────────

  const lookupJargon = async (term) => {
    setFloatingLookup(null);
    window.getSelection()?.removeAllRanges();
    const section = readingGuide.sections[currentSection];
    const context = section?.text?.slice(0, 500) || "";
    setJargonDrawer({ open: true, term, explanation: null, pending: true });

    const endpoint = previewMode ? "/sessions/preview/jargon" : `/sessions/${sessionId}/jargon`;
    try {
      const { data } = await api.post(endpoint, { term, context_snippet: context });
      if (data.explanation) {
        setJargonDrawer({ open: true, term, explanation: data.explanation, pending: false });
      } else {
        startPolling(sessionId);
      }
    } catch {
      setJargonDrawer((d) => ({ ...d, pending: false }));
      toast.error("Lookup failed");
    }
  };

  // ── Key term click ─────────────────────────────────────────────────────────

  const lookupKeyTerm = async (term) => {
    const section = readingGuide.sections[currentSection];
    const context = section?.text?.slice(0, 500) || "";
    setJargonDrawer({ open: true, term, explanation: null, pending: true });

    const endpoint = previewMode ? "/sessions/preview/keyterm" : `/sessions/${sessionId}/keyterm`;
    const body = previewMode
      ? { assignment_id: assignmentId, term, context_snippet: context }
      : { term, context_snippet: context };

    try {
      const { data } = await api.post(endpoint, body);
      setJargonDrawer({ open: true, term, explanation: data.explanation, pending: false });
    } catch {
      setJargonDrawer((d) => ({ ...d, pending: false }));
      toast.error("Lookup failed");
    }
  };

  // ── Checkpoint submission ─────────────────────────────────────────────────

  const submitCheckpoint = async () => {
    const text = checkpoints[currentSection]?.text || "";
    if (!text.trim()) return;
    setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], pending: true } }));

    if (previewMode) {
      const section = readingGuide.sections[currentSection];
      try {
        const { data } = await api.post("/sessions/preview/checkpoint", {
          section_title: section.title,
          guiding_questions: section.guiding_questions,
          student_text: text,
        });
        setCheckpoints((prev) => ({ ...prev, [currentSection]: { text, ai_feedback: data.feedback, pending: false } }));
      } catch {
        setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], pending: false } }));
        toast.error("Could not get feedback");
      }
      return;
    }

    try {
      await api.post(`/sessions/${sessionId}/checkpoint`, { section_index: currentSection, student_text: text });
      startPolling(sessionId);
    } catch (err) {
      setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], pending: false } }));
      toast.error(err.message || "Submission failed");
    }
  };

  // ── So What? submission ───────────────────────────────────────────────────

  const submitSoWhat = async () => {
    if (!soWhat.text.trim()) return;
    setSoWhat((s) => ({ ...s, pending: true }));

    if (previewMode) {
      try {
        const { data } = await api.post("/sessions/preview/sowhat", {
          paper_title: paperTitle,
          section_titles: readingGuide.sections.map((s) => s.title),
          difficulty: readingGuide.difficulty || "intermediate",
          student_text: soWhat.text,
        });
        setSoWhat((s) => ({ ...s, ai_feedback: data.feedback, pending: false }));
      } catch {
        setSoWhat((s) => ({ ...s, pending: false }));
        toast.error("Could not get feedback");
      }
      return;
    }

    try {
      await api.post(`/sessions/${sessionId}/sowhat`, { student_text: soWhat.text });
      startPolling(sessionId);
    } catch (err) {
      setSoWhat((s) => ({ ...s, pending: false }));
      toast.error(err.message || "Submission failed");
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!readingGuide) return <div className="p-8 text-red-400">Assignment not found.</div>;

  const sections = readingGuide.sections;
  const section = sections[currentSection];
  const cp = checkpoints[currentSection] || { text: "", ai_feedback: null, pending: false };
  const allSectionsComplete = sections.every((_, i) => checkpoints[i]?.ai_feedback);
  const canAdvance = previewMode || !!cp.ai_feedback;
  const isLastSection = currentSection === sections.length - 1;
  const showSoWhat = allSectionsComplete || previewMode;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const SectionSidebar = () => (
    <div className="w-48 shrink-0">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Sections</p>
      <div className="space-y-1">
        {sections.map((s, i) => {
          const done = !!checkpoints[i]?.ai_feedback;
          const active = i === currentSection;
          const locked = !previewMode && i > currentSection && !done;
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => !locked && setCurrentSection(i)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                active ? "bg-indigo-600 text-white" :
                locked ? "text-gray-600 cursor-not-allowed" :
                "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {done && <span className="text-green-400 text-xs">✓</span>}
              <span className="truncate">{s.title}</span>
            </button>
          );
        })}
        {showSoWhat && (
          <button
            onClick={() => setCurrentSection(sections.length)}
            className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
              currentSection === sections.length ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            So What?
          </button>
        )}
      </div>
    </div>
  );

  const GuidingQuestions = () => (
    <div className="mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Before you read</p>
      <ul className="space-y-1.5">
        {section.guiding_questions.map((q, i) => (
          <li key={i} className="text-gray-300 text-sm flex gap-2">
            <span className="text-indigo-400 shrink-0">→</span>
            <span>{q}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  const PaperText = () => (
    <div
      ref={textRef}
      className="text-gray-300 text-sm leading-7 select-text"
      onMouseUp={handleMouseUp}
    >
      <HighlightedText
        text={section.text}
        keyTerms={section.key_terms || []}
        onTermClick={lookupKeyTerm}
      />
    </div>
  );

  const CheckpointArea = () => (
    <div className="mt-4 border-t border-gray-800 pt-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your response</p>
      <textarea
        rows={4}
        value={cp.text}
        onChange={(e) => setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], text: e.target.value } }))}
        placeholder="What did you find in this section? Address the guiding questions above."
        disabled={!!cp.ai_feedback}
        className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 resize-none disabled:opacity-60"
      />
      {!cp.ai_feedback && (
        <button
          onClick={submitCheckpoint}
          disabled={cp.pending || !cp.text?.trim()}
          className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {cp.pending ? "Getting feedback…" : "Submit"}
        </button>
      )}
      {cp.pending && (
        <div className="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          AI is reviewing your response…
        </div>
      )}
      {cp.ai_feedback && (
        <div className="mt-3 bg-indigo-950/50 border border-indigo-800/50 rounded-lg px-4 py-3 text-sm text-indigo-200">
          {cp.ai_feedback}
        </div>
      )}
      {canAdvance && !isLastSection && (
        <button
          onClick={advanceSection}
          className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 underline"
        >
          Next Section →
        </button>
      )}
      {canAdvance && isLastSection && !showSoWhat && (
        <button
          onClick={() => setCurrentSection(sections.length)}
          className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 underline"
        >
          Finish → So What?
        </button>
      )}
    </div>
  );

  const SoWhatPanel = () => (
    <div className="max-w-2xl">
      <h2 className="text-white font-semibold text-lg mb-1">So What?</h2>
      <p className="text-gray-400 text-sm mb-4">
        In 2–3 sentences: what does this paper contribute, and why does it matter?
      </p>
      <textarea
        rows={5}
        value={soWhat.text}
        onChange={(e) => setSoWhat((s) => ({ ...s, text: e.target.value }))}
        disabled={!!soWhat.ai_feedback}
        placeholder="Describe the paper's significance in your own words…"
        className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 resize-none disabled:opacity-60"
      />
      {!soWhat.ai_feedback && (
        <button
          onClick={submitSoWhat}
          disabled={soWhat.pending || !soWhat.text.trim()}
          className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {soWhat.pending ? "Getting feedback…" : "Submit"}
        </button>
      )}
      {soWhat.pending && (
        <div className="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          AI is evaluating your summary…
        </div>
      )}
      {soWhat.ai_feedback && (
        <>
          <div className="mt-3 bg-indigo-950/50 border border-indigo-800/50 rounded-lg px-4 py-3 text-sm text-indigo-200">
            {soWhat.ai_feedback}
          </div>
          {!previewMode && (
            <div className="mt-4 p-4 bg-green-900/30 border border-green-700/40 rounded-lg text-green-300 text-sm font-medium">
              You've completed this assignment!
            </div>
          )}
        </>
      )}
    </div>
  );

  const isSoWhatSection = currentSection === sections.length;

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Preview banner */}
      {previewMode && (
        <div className="bg-amber-600/20 border-b border-amber-600/40 px-6 py-2 text-amber-300 text-sm text-center">
          Preview Mode — you are viewing this as a student would. Nothing is saved.
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{previewMode ? "Preview" : "Reading"}</p>
          <h1 className="text-white font-semibold">{paperTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLayout}
            className="text-gray-400 hover:text-white text-xs border border-gray-700 rounded px-2.5 py-1 transition-colors"
          >
            {layout === "stacked" ? "⇔ Side by Side" : "↕ Stacked"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex p-6 gap-6">
        <SectionSidebar />

        <div className="flex-1 min-w-0">
          {isSoWhatSection ? (
            <SoWhatPanel />
          ) : layout === "stacked" ? (
            /* Stacked layout */
            <div className="max-w-2xl space-y-6">
              <div className="bg-gray-900 rounded-xl p-5">
                <h2 className="text-white font-semibold text-lg mb-4">{section.title}</h2>
                <GuidingQuestions />
              </div>
              <div className="bg-gray-900 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
                <PaperText />
              </div>
              <div className="bg-gray-900 rounded-xl p-5">
                <CheckpointArea />
              </div>
            </div>
          ) : (
            /* Side-by-side layout */
            <div className="flex gap-4 h-[calc(100vh-140px)]">
              <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2">
                <div className="bg-gray-900 rounded-xl p-5">
                  <h2 className="text-white font-semibold text-lg mb-4">{section.title}</h2>
                  <GuidingQuestions />
                </div>
                <div className="bg-gray-900 rounded-xl p-5 flex-1">
                  <CheckpointArea />
                </div>
              </div>
              <div className="w-1/2 overflow-y-auto bg-gray-900 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
                <PaperText />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating highlight-to-lookup button */}
      {floatingLookup && (
        <button
          style={{ position: "absolute", top: floatingLookup.top, left: floatingLookup.left }}
          onClick={() => lookupJargon(floatingLookup.text)}
          className="z-40 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg"
        >
          Look up "{floatingLookup.text.slice(0, 20)}{floatingLookup.text.length > 20 ? "…" : ""}"
        </button>
      )}

      {/* Manual jargon search pinned at bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 bg-gray-950 px-6 py-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Look up a term…"
          value={manualTerm}
          onChange={(e) => setManualTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && manualTerm.trim()) { lookupJargon(manualTerm.trim()); setManualTerm(""); } }}
          className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 w-64"
        />
        <button
          onClick={() => { if (manualTerm.trim()) { lookupJargon(manualTerm.trim()); setManualTerm(""); } }}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg"
        >
          Look up
        </button>
      </div>

      {/* Jargon drawer */}
      {jargonDrawer.open && (
        <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-white font-medium text-sm">Jargon Lookup</h3>
            <button onClick={() => setJargonDrawer((d) => ({ ...d, open: false }))} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <p className="text-indigo-300 font-medium text-sm mb-2">"{jargonDrawer.term}"</p>
            {jargonDrawer.pending ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
                <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Looking up…
              </div>
            ) : (
              <p className="text-gray-300 text-sm leading-relaxed">{jargonDrawer.explanation}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser as a student**

Navigate to an assignment. Confirm:
- Section sidebar renders with section titles
- Layout toggle switches between stacked and side-by-side
- Key terms in text are underlined yellow
- Clicking a key term opens the jargon drawer
- Highlighting text shows the "Look up" floating button
- Manual jargon input at bottom works
- Checkpoint textarea accepts input, Submit fires and shows spinner
- AI feedback appears in place once returned
- "Next Section →" appears after feedback received
- So What? panel appears after all sections complete

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: add full reading page with layout toggle, checkpoint flow, jargon tools, and So What?"
```

---

### Task 11: Teacher Preview Mode

**Files:**
- Modify: `frontend/src/pages/teacher/AssignmentReviewPage.jsx`

- [ ] **Step 1: Read current AssignmentReviewPage.jsx**

```bash
cat frontend/src/pages/teacher/AssignmentReviewPage.jsx
```

- [ ] **Step 2: Add "Preview as Student" button**

Find the button group at the bottom of the page (near the "Save Draft" and "Publish" buttons). Add a Preview button before them:

```jsx
<button
  type="button"
  onClick={() => navigate(`/teacher/assignments/${assignmentId}/preview`)}
  className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
>
  Preview as Student
</button>
```

Make sure `useNavigate` and `useParams` are imported (they should already be). If `assignmentId` comes from `useParams`, confirm the variable name matches.

- [ ] **Step 3: Verify preview flow end-to-end**

1. As teacher, go to an assignment review page
2. Click "Preview as Student"
3. Confirm the amber preview banner shows at the top
4. Confirm all sections are accessible (not locked)
5. Click a key term — explanation should load (and be cached for students)
6. Highlight text — floating "Look up" button appears
7. Write a checkpoint response and submit — feedback appears (not saved to DB)
8. Advance to So What?, submit — feedback appears

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/teacher/AssignmentReviewPage.jsx
git commit -m "feat: add Preview as Student button to assignment review page"
```

---

### Task 12: Run Full Test Suite and Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd C:/Users/prash/ReadLabAI
pytest backend/tests/ -v
```

Expected: All tests pass. Note the count — should include all prior tests plus new enrollment and session tests.

- [ ] **Step 2: Restart the backend**

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
sleep 5 && curl -s http://localhost:8000/api/v1/enrollment/classes -H "Authorization: Bearer invalid" | python -c "import sys,json; print(json.load(sys.stdin))"
```

Expected: `{'detail': 'Invalid token: ...'}`  (401 — route exists)

- [ ] **Step 3: End-to-end smoke test**

Run through the full journey manually:

1. Sign up as a teacher, upload a PDF, create a class, assign the paper, publish it
2. Sign up as a student, join the class, open the assignment
3. Read each section, submit checkpoints, confirm AI feedback arrives
4. Look up a key term — confirm it's cached (check `key_term_definitions` table in Supabase)
5. Highlight a word and look it up via the floating button
6. Complete So What? and confirm the completion message
7. As teacher, click "Preview as Student" on the assignment — confirm everything works without creating any sessions

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Plan 3 — student reading experience with enrollment, sessions, AI feedback, and teacher preview"
```
