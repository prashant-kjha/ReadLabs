# ReadLabAI — Plan 3: Student Reading Journey

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students can join a class via code, open a published assignment, and complete the full section-locked reading journey — reading each section, submitting checkpoint responses that receive AI feedback, requesting jargon explanations on-demand, and writing a final "So What?" paragraph that is evaluated against the paper's actual claims.

**Architecture:** Adds four AI functions to `ai_provider.py` (checkpoint evaluation, jargon explanation, So What evaluation) and five new backend routers (enrollments, sessions, checkpoints, jargon, sowhat). Student frontend: a dashboard showing assigned papers and a reading page that enforces sequential section progression.

**Tech Stack:** Same as Plans 1–2. No new dependencies.

**Prerequisite:** Plans 1 and 2 complete. At least one published assignment exists.

---

## File Map

```
backend\
  ai_provider.py                MODIFY — append 3 new AI functions
  routers\
    enrollments.py              NEW — join class via code
    sessions.py                 NEW — create/get reading session, advance section
    checkpoints.py              NEW — submit checkpoint, get AI feedback
    jargon.py                   NEW — request jargon explanation
    sowhat.py                   NEW — submit So What paragraph, get AI feedback
  tests\
    test_enrollments.py         NEW
    test_sessions.py            NEW
    test_checkpoints.py         NEW
    test_sowhat.py              NEW
  main.py                       MODIFY — register 5 new routers
frontend\src\pages\student\
  DashboardPage.jsx             NEW — list enrolled classes and assignments
  ReadingPage.jsx               NEW — section-locked reading journey
frontend\src\App.js             MODIFY — replace student stubs with real pages
```

---

### Task 1: AI Functions — Checkpoint, Jargon, So What

**Files:**
- Modify: `backend/ai_provider.py` (append three functions)
- Modify: `backend/tests/test_ai_provider.py` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_ai_provider.py`:

```python
from backend.ai_provider import evaluate_checkpoint, explain_jargon, evaluate_sowhat


@pytest.mark.asyncio
async def test_evaluate_checkpoint_returns_string():
    mock_response = MagicMock()
    mock_response.text = "You correctly identified the sample size. However, you missed that the study used a double-blind design, which is important for understanding why the results are reliable."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await evaluate_checkpoint(
            section_title="Methods",
            section_text="The study used a double-blind RCT with 42 participants...",
            student_text="They studied some people and measured outcomes.",
        )

    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_explain_jargon_returns_string():
    mock_response = MagicMock()
    mock_response.text = "RCT stands for Randomized Controlled Trial. It means participants are randomly assigned to groups so researchers can fairly compare outcomes."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await explain_jargon(
            term="RCT",
            paper_context="This randomized controlled trial enrolled 42 patients...",
        )

    assert isinstance(result, str)
    assert len(result) > 10


@pytest.mark.asyncio
async def test_evaluate_sowhat_returns_string():
    mock_response = MagicMock()
    mock_response.text = "You correctly noted this study advances treatment options. However, you wrote the drug 'cures' the condition — the paper only shows a 30% symptom reduction, which is an important distinction."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await evaluate_sowhat(
            paper_text="Results showed a 30% reduction in symptoms (p<0.05)...",
            student_text="This study proves the drug cures the disease.",
        )

    assert isinstance(result, str)
    assert len(result) > 20
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_ai_provider.py::test_evaluate_checkpoint_returns_string -v
```

Expected: FAIL — `ImportError: cannot import name 'evaluate_checkpoint'`

- [ ] **Step 3: Append three functions to `backend/ai_provider.py`**

Add at the bottom of `backend/ai_provider.py`:

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def evaluate_checkpoint(section_title: str, section_text: str, student_text: str) -> str:
    """
    Give feedback on a student's checkpoint response for one section.
    Names one thing correct, one thing missed. Never rewrites the student's answer.
    """
    prompt = f"""The student wrote the following about the "{section_title}" section:

{student_text}

The actual section says:

{section_text[:3000]}

In 2–3 sentences: acknowledge one specific thing they captured correctly, then point to one specific thing they missed or mischaracterized. Do not rewrite their response. Do not summarize the section for them. Use an encouraging tone. Return only the feedback text, no labels or headers."""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.4),
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def explain_jargon(term: str, paper_context: str) -> str:
    """
    Explain a highlighted term in plain English, in the context of this paper.
    """
    prompt = f"""In the context of this research paper, explain what "{term}" means in plain English.
Keep the explanation to 2–3 sentences. Do not use other technical jargon. Be specific to how the term is used in this paper.

Paper context:
{paper_context[:5000]}

Return only the explanation, no labels or headers."""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.3),
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def evaluate_sowhat(paper_text: str, student_text: str) -> str:
    """
    Evaluate a student's So What paragraph against the paper's actual claims.
    Flags overstatements, understatements, and mischaracterizations.
    """
    prompt = f"""A student wrote the following paragraph about the significance of this research paper:

{student_text}

The paper's actual claims and findings:
{paper_text[:10000]}

In 3–4 sentences: identify one thing they got right about the paper's significance, then point out one specific place where they overstated, understated, or mischaracterized the findings. Be specific — quote their text and the paper where helpful. Be encouraging but precise. Return only the feedback, no labels or headers."""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(temperature=0.4),
    )
    return response.text.strip()
```

- [ ] **Step 4: Run all AI provider tests**

```bash
pytest backend/tests/test_ai_provider.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: add checkpoint evaluation, jargon explanation, and So What AI functions"
```

---

### Task 2: Enrollments Router

**Files:**
- Create: `backend/routers/enrollments.py`
- Create: `backend/tests/test_enrollments.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_enrollments.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

client = TestClient(app)


def test_join_class_requires_auth():
    response = client.post("/api/v1/enrollments/join", json={"class_code": "ABC123"})
    assert response.status_code == 401


def test_join_class_with_invalid_code():
    student = {"sub": "student-uuid-1"}
    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = AsyncMock(return_value=MagicMock(data=None))

    with patch("backend.routers.enrollments.require_student", return_value=student), \
         patch("backend.routers.enrollments.get_db", return_value=db):
        response = client.post("/api/v1/enrollments/join", json={"class_code": "BADCODE"})

    assert response.status_code == 404


def test_join_class_succeeds():
    student = {"sub": "student-uuid-1"}

    class_data = [{"id": "cls-1", "name": "Bio 101", "class_code": "ABC123"}]
    profile_data = [{"name": "Alice"}]
    enroll_data = [{"class_id": "cls-1", "student_id": "student-uuid-1"}]

    call_count = 0
    async def mock_execute():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MagicMock(data=class_data)
        elif call_count == 2:
            return MagicMock(data=profile_data)
        return MagicMock(data=enroll_data)

    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.upsert = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = mock_execute

    with patch("backend.routers.enrollments.require_student", return_value=student), \
         patch("backend.routers.enrollments.get_db", return_value=db):
        response = client.post("/api/v1/enrollments/join", json={"class_code": "ABC123"})

    assert response.status_code == 200
    assert response.json()["class_id"] == "cls-1"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_enrollments.py -v
```

Expected: FAIL — `404 Not Found`.

- [ ] **Step 3: Create `backend/routers/enrollments.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student

router = APIRouter()


class JoinClassRequest(BaseModel):
    class_code: str


@router.post("/join")
async def join_class(body: JoinClassRequest, user=Depends(require_student), db=Depends(get_db)):
    cls = await db.from_("classes").select("id, name, class_code") \
        .eq("class_code", body.class_code.strip().upper()).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found — check the code and try again")

    # Get student's display name from profile
    profile = await db.from_("user_profiles").select("name") \
        .eq("user_id", user["sub"]).single().execute()
    student_name = profile.data["name"] if profile.data else "Student"

    # Upsert enrollment (idempotent — safe to call twice)
    result = await db.from_("class_enrollments").upsert({
        "class_id": cls.data["id"],
        "student_id": user["sub"],
        "student_name": student_name,
    }).execute()

    return result.data[0]


@router.get("/my-classes")
async def my_classes(user=Depends(require_student), db=Depends(get_db)):
    """Return all classes the student is enrolled in, with their published assignments."""
    enrollments = await db.from_("class_enrollments") \
        .select("class_id, enrolled_at") \
        .eq("student_id", user["sub"]).execute()

    if not enrollments.data:
        return []

    class_ids = [e["class_id"] for e in enrollments.data]
    results = []

    for class_id in class_ids:
        cls = await db.from_("classes").select("id, name, class_code") \
            .eq("id", class_id).single().execute()
        if not cls.data:
            continue

        assignments = await db.from_("assignments") \
            .select("id, status, difficulty, created_at") \
            .eq("class_id", class_id) \
            .eq("status", "published") \
            .execute()

        results.append({
            **cls.data,
            "assignments": assignments.data or [],
        })

    return results
```

- [ ] **Step 4: Register in `backend/main.py`**

```python
from backend.routers import auth, papers, classes, assignments, enrollments

app.include_router(enrollments.router, prefix="/api/v1/enrollments", tags=["enrollments"])
```

- [ ] **Step 5: Run tests**

```bash
pytest backend/tests/test_enrollments.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/enrollments.py backend/tests/test_enrollments.py backend/main.py
git commit -m "feat: add enrollments router with class join via code"
```

---

### Task 3: Sessions Router

**Files:**
- Create: `backend/routers/sessions.py`
- Create: `backend/tests/test_sessions.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_sessions.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

client = TestClient(app)


def make_db(data_sequence):
    """Returns a db mock that returns items from data_sequence on sequential .execute() calls."""
    call_count = [0]
    async def mock_execute():
        idx = call_count[0]
        call_count[0] += 1
        if idx < len(data_sequence):
            return MagicMock(data=data_sequence[idx])
        return MagicMock(data=[])
    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "single", "order"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


def test_start_session_requires_auth():
    response = client.post("/api/v1/sessions/asn-1/start")
    assert response.status_code == 401


def test_start_session_creates_session():
    student = {"sub": "student-uuid-1"}
    assignment_data = [{"id": "asn-1", "class_id": "cls-1", "status": "published"}]
    enrollment_data = [{"class_id": "cls-1"}]
    session_data = [{"id": "ses-1", "student_id": "student-uuid-1", "assignment_id": "asn-1",
                     "status": "in_progress", "current_section_index": 0}]

    db = make_db([assignment_data, enrollment_data, session_data])

    with patch("backend.routers.sessions.require_student", return_value=student), \
         patch("backend.routers.sessions.get_db", return_value=db):
        response = client.post("/api/v1/sessions/asn-1/start")

    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


def test_advance_section_increments_index():
    student = {"sub": "student-uuid-1"}
    session_data = [{"id": "ses-1", "current_section_index": 0, "student_id": "student-uuid-1"}]
    updated_data = [{"id": "ses-1", "current_section_index": 1, "status": "in_progress"}]

    db = make_db([session_data, updated_data])

    with patch("backend.routers.sessions.require_student", return_value=student), \
         patch("backend.routers.sessions.get_db", return_value=db):
        response = client.post("/api/v1/sessions/ses-1/advance")

    assert response.status_code == 200
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: FAIL — `404 Not Found`.

- [ ] **Step 3: Create `backend/routers/sessions.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from backend.db import get_db
from backend.deps import require_student

router = APIRouter()


@router.post("/{assignment_id}/start")
async def start_session(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Create or resume a reading session for this student + assignment."""
    # Verify assignment is published
    asn = await db.from_("assignments").select("id, class_id, status") \
        .eq("id", assignment_id).eq("status", "published").single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found or not published")

    # Verify student is enrolled in the class
    enrollment = await db.from_("class_enrollments").select("class_id") \
        .eq("class_id", asn.data["class_id"]).eq("student_id", user["sub"]).single().execute()
    if not enrollment.data:
        raise HTTPException(status_code=403, detail="Not enrolled in this class")

    # Upsert session (idempotent — returns existing session if already started)
    result = await db.from_("student_sessions").upsert({
        "student_id": user["sub"],
        "assignment_id": assignment_id,
        "status": "in_progress",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return result.data[0]


@router.get("/{assignment_id}/state")
async def get_session_state(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Return the full reading state for this student: session + assignment reading guide + submitted checkpoints."""
    session = await db.from_("student_sessions").select("*") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()

    asn = await db.from_("assignments") \
        .select("id, reading_guide, difficulty, paper_id") \
        .eq("id", assignment_id).single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Include paper figures for inline display
    paper = await db.from_("papers").select("figures") \
        .eq("id", asn.data["paper_id"]).single().execute()

    checkpoints = []
    if session.data:
        cp = await db.from_("checkpoint_responses").select("section_index, student_text, ai_feedback") \
            .eq("session_id", session.data["id"]).execute()
        checkpoints = cp.data or []

    sowhat = None
    if session.data:
        sw = await db.from_("sowhat_responses").select("student_text, ai_feedback") \
            .eq("session_id", session.data["id"]).single().execute()
        sowhat = sw.data

    return {
        "session":     session.data,
        "assignment":  asn.data,
        "figures":     (paper.data or {}).get("figures", []),
        "checkpoints": checkpoints,
        "sowhat":      sowhat,
    }


@router.post("/{session_id}/advance")
async def advance_section(session_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Move to the next section after a checkpoint is submitted."""
    session = await db.from_("student_sessions").select("id, current_section_index, student_id") \
        .eq("id", session_id).single().execute()
    if not session.data or session.data["student_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Session not found")

    new_index = session.data["current_section_index"] + 1
    result = await db.from_("student_sessions").update({
        "current_section_index": new_index,
        "status": "in_progress",
    }).eq("id", session_id).execute()
    return result.data[0]


@router.post("/{session_id}/complete")
async def complete_session(session_id: str, user=Depends(require_student), db=Depends(get_db)):
    """Mark session as completed after So What is submitted."""
    session = await db.from_("student_sessions").select("student_id") \
        .eq("id", session_id).single().execute()
    if not session.data or session.data["student_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.from_("student_sessions").update({
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", session_id).execute()
    return result.data[0]
```

- [ ] **Step 4: Register in `backend/main.py`**

```python
from backend.routers import auth, papers, classes, assignments, enrollments, sessions

app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
```

- [ ] **Step 5: Run tests**

```bash
pytest backend/tests/test_sessions.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_sessions.py backend/main.py
git commit -m "feat: add sessions router with start, state, advance, and complete"
```

---

### Task 4: Checkpoints, Jargon, and So What Routers

**Files:**
- Create: `backend/routers/checkpoints.py`
- Create: `backend/routers/jargon.py`
- Create: `backend/routers/sowhat.py`
- Create: `backend/tests/test_checkpoints.py`
- Create: `backend/tests/test_sowhat.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests for checkpoints**

Create `backend/tests/test_checkpoints.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

client = TestClient(app)


def test_submit_checkpoint_requires_auth():
    response = client.post("/api/v1/checkpoints/ses-1/submit", json={
        "section_index": 0, "student_text": "My response"
    })
    assert response.status_code == 401


def test_submit_checkpoint_returns_feedback():
    student = {"sub": "student-uuid-1"}
    session_data = [{"id": "ses-1", "student_id": "student-uuid-1", "assignment_id": "asn-1"}]
    assignment_data = [{"reading_guide": {
        "sections": [{"title": "Methods", "text": "The study used 42 participants..."}]
    }}]
    saved_data = [{"id": "cp-1", "section_index": 0, "student_text": "My response", "ai_feedback": "Great job!"}]

    call_count = [0]
    async def mock_execute():
        idx = call_count[0]; call_count[0] += 1
        return MagicMock(data=[session_data, assignment_data, saved_data][min(idx, 2)])

    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "eq", "single"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute

    with patch("backend.routers.checkpoints.require_student", return_value=student), \
         patch("backend.routers.checkpoints.get_db", return_value=db), \
         patch("backend.routers.checkpoints.evaluate_checkpoint",
               new_callable=AsyncMock, return_value="Great job! You missed the sample size."):
        response = client.post("/api/v1/checkpoints/ses-1/submit", json={
            "section_index": 0,
            "student_text": "My response",
        })

    assert response.status_code == 200
    assert "ai_feedback" in response.json()
```

- [ ] **Step 2: Write failing test for So What**

Create `backend/tests/test_sowhat.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

client = TestClient(app)


def test_submit_sowhat_requires_auth():
    response = client.post("/api/v1/sowhat/ses-1/submit", json={"student_text": "This matters because..."})
    assert response.status_code == 401


def test_submit_sowhat_returns_feedback():
    student = {"sub": "student-uuid-1"}
    session_data = [{"id": "ses-1", "student_id": "student-uuid-1", "assignment_id": "asn-1"}]
    paper_data = [{"extracted_text": "Results showed 30% reduction..."}]
    saved_data = [{"id": "sw-1", "student_text": "This cures cancer", "ai_feedback": "Good try, but..."}]

    call_count = [0]
    async def mock_execute():
        idx = call_count[0]; call_count[0] += 1
        return MagicMock(data=[session_data, paper_data, saved_data][min(idx, 2)])

    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "eq", "single"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute

    with patch("backend.routers.sowhat.require_student", return_value=student), \
         patch("backend.routers.sowhat.get_db", return_value=db), \
         patch("backend.routers.sowhat.evaluate_sowhat",
               new_callable=AsyncMock, return_value="You identified the key finding. However..."):
        response = client.post("/api/v1/sowhat/ses-1/submit", json={
            "student_text": "This drug cures the disease.",
        })

    assert response.status_code == 200
    assert "ai_feedback" in response.json()
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pytest backend/tests/test_checkpoints.py backend/tests/test_sowhat.py -v
```

Expected: FAIL — `404 Not Found`.

- [ ] **Step 4: Create `backend/routers/checkpoints.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student
from backend.ai_provider import evaluate_checkpoint

router = APIRouter()


class SubmitCheckpointRequest(BaseModel):
    section_index: int
    student_text: str


@router.post("/{session_id}/submit")
async def submit_checkpoint(
    session_id: str,
    body: SubmitCheckpointRequest,
    user=Depends(require_student),
    db=Depends(get_db),
):
    if not body.student_text.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty")

    # Verify session belongs to this student
    session = await db.from_("student_sessions").select("id, student_id, assignment_id") \
        .eq("id", session_id).single().execute()
    if not session.data or session.data["student_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get section text from the assignment's reading guide
    asn = await db.from_("assignments").select("reading_guide") \
        .eq("id", session.data["assignment_id"]).single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    sections = asn.data["reading_guide"].get("sections", [])
    if body.section_index >= len(sections):
        raise HTTPException(status_code=400, detail="Invalid section index")

    section = sections[body.section_index]
    feedback = await evaluate_checkpoint(
        section_title=section.get("title", f"Section {body.section_index + 1}"),
        section_text=section.get("text", ""),
        student_text=body.student_text,
    )

    result = await db.from_("checkpoint_responses").insert({
        "session_id":    session_id,
        "section_index": body.section_index,
        "student_text":  body.student_text.strip(),
        "ai_feedback":   feedback,
    }).execute()

    return result.data[0]
```

- [ ] **Step 5: Create `backend/routers/jargon.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student
from backend.ai_provider import explain_jargon

router = APIRouter()


class JargonRequest(BaseModel):
    session_id: str
    term: str
    context_section_index: int = 0


@router.post("/explain")
async def explain_term(body: JargonRequest, user=Depends(require_student), db=Depends(get_db)):
    if not body.term.strip():
        raise HTTPException(status_code=400, detail="Term cannot be empty")

    # Verify session belongs to this student
    session = await db.from_("student_sessions").select("id, student_id, assignment_id") \
        .eq("id", body.session_id).single().execute()
    if not session.data or session.data["student_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get paper context from the relevant section
    asn = await db.from_("assignments").select("reading_guide") \
        .eq("id", session.data["assignment_id"]).single().execute()
    sections = asn.data["reading_guide"].get("sections", []) if asn.data else []
    context = sections[body.context_section_index].get("text", "") if sections else ""

    explanation = await explain_jargon(term=body.term.strip(), paper_context=context)

    # Save lookup for teacher dashboard reference
    await db.from_("jargon_lookups").insert({
        "session_id":  body.session_id,
        "term":        body.term.strip(),
        "explanation": explanation,
    }).execute()

    return {"term": body.term.strip(), "explanation": explanation}
```

- [ ] **Step 6: Create `backend/routers/sowhat.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_student
from backend.ai_provider import evaluate_sowhat

router = APIRouter()


class SoWhatRequest(BaseModel):
    student_text: str


@router.post("/{session_id}/submit")
async def submit_sowhat(
    session_id: str,
    body: SoWhatRequest,
    user=Depends(require_student),
    db=Depends(get_db),
):
    if not body.student_text.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty")

    session = await db.from_("student_sessions").select("id, student_id, assignment_id") \
        .eq("id", session_id).single().execute()
    if not session.data or session.data["student_id"] != user["sub"]:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get paper text for evaluation
    asn = await db.from_("assignments").select("paper_id") \
        .eq("id", session.data["assignment_id"]).single().execute()
    paper = await db.from_("papers").select("extracted_text") \
        .eq("id", asn.data["paper_id"]).single().execute()
    paper_text = paper.data.get("extracted_text", "") if paper.data else ""

    feedback = await evaluate_sowhat(paper_text=paper_text, student_text=body.student_text)

    result = await db.from_("sowhat_responses").insert({
        "session_id":  session_id,
        "student_text": body.student_text.strip(),
        "ai_feedback": feedback,
    }).execute()

    return result.data[0]
```

- [ ] **Step 7: Register all three routers in `backend/main.py`**

```python
from backend.routers import (
    auth, papers, classes, assignments,
    enrollments, sessions, checkpoints, jargon, sowhat,
)

app.include_router(checkpoints.router, prefix="/api/v1/checkpoints", tags=["checkpoints"])
app.include_router(jargon.router,      prefix="/api/v1/jargon",      tags=["jargon"])
app.include_router(sowhat.router,      prefix="/api/v1/sowhat",       tags=["sowhat"])
```

- [ ] **Step 8: Run all tests**

```bash
pytest backend/tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/routers/checkpoints.py backend/routers/jargon.py backend/routers/sowhat.py \
        backend/tests/test_checkpoints.py backend/tests/test_sowhat.py backend/main.py
git commit -m "feat: add checkpoint, jargon, and So What routers"
```

---

### Task 5: Student Dashboard Page

**Files:**
- Create: `frontend/src/pages/student/DashboardPage.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/student/DashboardPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function StudentDashboardPage() {
  const [classes, setClasses]     = useState([]);
  const [classCode, setClassCode] = useState("");
  const [joining, setJoining]     = useState(false);
  const navigate = useNavigate();

  const load = () => {
    api.get("/enrollments/my-classes")
      .then(({ data }) => setClasses(data))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!classCode.trim()) return;
    setJoining(true);
    try {
      await api.post("/enrollments/join", { class_code: classCode.trim().toUpperCase() });
      toast.success("Joined class!");
      setClassCode("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not join class");
    } finally {
      setJoining(false);
    }
  };

  const handleOpen = async (assignmentId) => {
    try {
      await api.post(`/sessions/${assignmentId}/start`);
      navigate(`/student/reading/${assignmentId}`);
    } catch {
      toast.error("Could not start assignment");
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">My Assignments</h1>

      {/* Join class */}
      <form onSubmit={handleJoin} className="bg-gray-900 rounded-xl p-5 mb-8 flex gap-3">
        <input
          type="text"
          placeholder="Enter class code (e.g. ABC123)"
          value={classCode}
          onChange={(e) => setClassCode(e.target.value.toUpperCase())}
          maxLength={8}
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 uppercase"
        />
        <button
          type="submit"
          disabled={joining || !classCode.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {joining ? "Joining…" : "Join Class"}
        </button>
      </form>

      {/* Classes and assignments */}
      {classes.length === 0 && (
        <p className="text-gray-500 text-sm">No classes yet. Enter a class code above to join one.</p>
      )}
      {classes.map((cls) => (
        <div key={cls.id} className="mb-6">
          <h2 className="text-white font-semibold mb-3">{cls.name}</h2>
          {cls.assignments.length === 0 && (
            <p className="text-gray-500 text-sm ml-1">No assignments yet.</p>
          )}
          <div className="space-y-2">
            {cls.assignments.map((asn) => (
              <button
                key={asn.id}
                onClick={() => handleOpen(asn.id)}
                className="w-full text-left bg-gray-900 hover:bg-gray-800 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Assignment</span>
                  <span className="text-xs text-gray-500 capitalize">{asn.difficulty || "—"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/App.js`**

Replace the `StudentDashboardPage` stub with the real import:

```jsx
import StudentDashboardPage from "./pages/student/DashboardPage";
```

Remove the old stub line:
```jsx
// DELETE: const StudentDashboardPage = () => <div className="text-white p-8">Assignments — coming in Plan 3</div>;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/student/DashboardPage.jsx frontend/src/App.js
git commit -m "feat: add student dashboard with class join and assignment list"
```

---

### Task 6: Student Reading Page

**Files:**
- Create: `frontend/src/pages/student/ReadingPage.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/student/ReadingPage.jsx`**

```jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

function JargonHighlight({ text, sessionId, sectionIndex }) {
  const [popover, setPopover] = useState(null); // { term, explanation, x, y }

  const handleMouseUp = async () => {
    const selection = window.getSelection();
    const term = selection?.toString().trim();
    if (!term || term.length < 2 || term.length > 60) return;
    try {
      const { data } = await api.post("/jargon/explain", {
        session_id: sessionId,
        term,
        context_section_index: sectionIndex,
      });
      setPopover({ term: data.term, explanation: data.explanation });
    } catch {}
  };

  return (
    <div className="relative">
      <div
        className="text-gray-200 leading-relaxed text-sm select-text cursor-text"
        onMouseUp={handleMouseUp}
      >
        {text}
      </div>
      {popover && (
        <div className="mt-3 bg-indigo-950 border border-indigo-700 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-indigo-300 font-medium">{popover.term}</span>
            <button
              onClick={() => setPopover(null)}
              className="text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-300">{popover.explanation}</p>
        </div>
      )}
    </div>
  );
}

function SectionFigures({ figures, sectionIndex, totalSections }) {
  // Distribute figures evenly across sections by index
  const sectionFigures = figures.filter((_, i) =>
    Math.floor((i / figures.length) * totalSections) === sectionIndex
  );
  if (sectionFigures.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      {sectionFigures.map((fig, i) => (
        <div key={i} className="bg-gray-800 rounded-lg p-2">
          <img
            src={`data:image/${fig.ext};base64,${fig.data}`}
            alt={`Figure from section`}
            className="max-w-full rounded"
          />
        </div>
      ))}
    </div>
  );
}

export default function ReadingPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [checkpointText, setCheckpointText] = useState("");
  const [sowhatText, setSowhatText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/sessions/${assignmentId}/state`);
      setState(data);
    } catch {
      toast.error("Could not load assignment");
    }
  };

  useEffect(() => { load(); }, [assignmentId]);

  if (!state) return <div className="p-8 text-gray-400">Loading…</div>;

  const { session, assignment, figures, checkpoints, sowhat } = state;
  const sections = assignment?.reading_guide?.sections || [];
  const currentIdx = session?.current_section_index ?? 0;
  const isComplete = session?.status === "completed";
  const allSectionsDone = currentIdx >= sections.length;

  const submittedAt = (idx) => checkpoints.find((c) => c.section_index === idx);

  const handleCheckpointSubmit = async (e) => {
    e.preventDefault();
    if (!checkpointText.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/checkpoints/${session.id}/submit`, {
        section_index: currentIdx,
        student_text: checkpointText,
      });
      await api.post(`/sessions/${session.id}/advance`);
      setCheckpointText("");
      await load();
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSoWhatSubmit = async (e) => {
    e.preventDefault();
    if (!sowhatText.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/sowhat/${session.id}/submit`, { student_text: sowhatText });
      await api.post(`/sessions/${session.id}/complete`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 pb-24">
      {/* Roadmap header */}
      <div className="flex gap-1.5 mb-8 flex-wrap">
        {sections.map((s, i) => (
          <div
            key={i}
            className={`text-xs px-2 py-1 rounded font-medium ${
              i < currentIdx
                ? "bg-green-900 text-green-300"
                : i === currentIdx
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {s.title}
          </div>
        ))}
        {allSectionsDone && (
          <div className={`text-xs px-2 py-1 rounded font-medium ${
            isComplete ? "bg-green-900 text-green-300" : "bg-indigo-600 text-white"
          }`}>
            So What?
          </div>
        )}
      </div>

      {/* Completed sections */}
      {sections.slice(0, currentIdx).map((section, idx) => {
        const cp = submittedAt(idx);
        return (
          <div key={idx} className="mb-6 opacity-60">
            <h2 className="text-white font-semibold mb-1">
              ✓ {section.title}
            </h2>
            {cp && (
              <div className="bg-gray-900 rounded-xl p-4 text-sm">
                <p className="text-gray-400 mb-2 italic">Your response: {cp.student_text}</p>
                <p className="text-indigo-300">{cp.ai_feedback}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Active section */}
      {!allSectionsDone && (
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <h2 className="text-white font-bold text-xl mb-4">{sections[currentIdx].title}</h2>

          {/* Guiding questions — shown before text */}
          <div className="bg-indigo-950 rounded-lg p-4 mb-5">
            <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wide mb-2">
              As you read, look for:
            </p>
            <ul className="space-y-1.5">
              {sections[currentIdx].guiding_questions?.map((q, i) => (
                <li key={i} className="text-indigo-200 text-sm flex gap-2">
                  <span className="text-indigo-500 shrink-0">→</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Teacher notes */}
          {sections[currentIdx].teacher_notes && (
            <div className="bg-yellow-950 border border-yellow-800 rounded-lg p-3 mb-4">
              <p className="text-yellow-200 text-xs font-semibold uppercase tracking-wide mb-1">
                Teacher note
              </p>
              <p className="text-yellow-100 text-sm">{sections[currentIdx].teacher_notes}</p>
            </div>
          )}

          {/* Extracted text with jargon-on-demand */}
          <JargonHighlight
            text={sections[currentIdx].text}
            sessionId={session.id}
            sectionIndex={currentIdx}
          />

          {/* Inline figures for this section */}
          <SectionFigures
            figures={figures}
            sectionIndex={currentIdx}
            totalSections={sections.length}
          />

          {/* Key terms */}
          {sections[currentIdx].key_terms?.length > 0 && (
            <div className="mt-4">
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1.5">
                Key terms — highlight to look up
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sections[currentIdx].key_terms.map((term, i) => (
                  <span key={i} className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Checkpoint */}
          <form onSubmit={handleCheckpointSubmit} className="mt-6">
            <p className="text-white font-medium mb-2">
              In your own words, what did this section say?
            </p>
            <textarea
              value={checkpointText}
              onChange={(e) => setCheckpointText(e.target.value)}
              placeholder="Write your understanding here before moving on…"
              rows={4}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
            />
            <button
              type="submit"
              disabled={submitting || !checkpointText.trim()}
              className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit & Continue"}
            </button>
          </form>
        </div>
      )}

      {/* So What exercise */}
      {allSectionsDone && !isComplete && (
        <div className="bg-gray-900 rounded-xl p-6 mb-6">
          <h2 className="text-white font-bold text-xl mb-2">So What?</h2>
          <p className="text-gray-400 text-sm mb-5">
            Now that you've read the whole paper, write one paragraph explaining why this research
            matters. What did it find, and why does it matter for the real world?
          </p>
          {sowhat ? (
            <div>
              <p className="text-gray-400 text-sm italic mb-3">Your response: {sowhat.student_text}</p>
              <p className="text-indigo-300 text-sm">{sowhat.ai_feedback}</p>
            </div>
          ) : (
            <form onSubmit={handleSoWhatSubmit}>
              <textarea
                value={sowhatText}
                onChange={(e) => setSowhatText(e.target.value)}
                placeholder="In one paragraph: what did this paper find, and why does it matter?"
                rows={5}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
              />
              <button
                type="submit"
                disabled={submitting || !sowhatText.trim()}
                className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Completion */}
      {isComplete && (
        <div className="bg-green-950 border border-green-700 rounded-xl p-6 text-center">
          <p className="text-green-300 text-xl font-bold mb-1">Assignment Complete</p>
          <p className="text-green-400 text-sm mb-4">
            Great work reading through the whole paper.
          </p>
          <button
            onClick={() => navigate("/student/dashboard")}
            className="bg-green-700 hover:bg-green-600 text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Add route in `frontend/src/App.js`**

Add import:
```jsx
import ReadingPage from "./pages/student/ReadingPage";
```

Add route inside the student routes block:
```jsx
<Route
  path="/student/reading/:assignmentId"
  element={role === "student" ? <ReadingPage /> : <Navigate to="/auth" />}
/>
```

- [ ] **Step 3: Verify the full student reading journey manually**

Start both servers. Sign in as a student (or sign up as one). Expected flow:
1. Enter class code → class appears in dashboard
2. Click an assignment → session starts, redirected to reading page
3. Roadmap header shows all sections, first one active
4. Guiding questions appear before the text
5. Select text → jargon popover appears with explanation
6. Write a checkpoint response → submit → AI feedback appears → next section unlocks
7. After all sections: So What? form appears
8. Submit So What → AI feedback appears → "Assignment Complete" screen

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/student/ frontend/src/App.js
git commit -m "feat: add student reading page with section-locked journey and AI interactions"
```

---

## Plan 3 Complete

At this point:
- Students join classes via code and see published assignments
- The full reading journey works: guiding questions → text + figures → checkpoint → AI feedback → advance
- Jargon is explained on-demand via text selection
- So What? exercise evaluates the student's synthesis paragraph
- All interactions are stored in Supabase per student session

**Next:** Plan 4 adds the teacher dashboard — roster progress tracking, per-student checkpoint response viewing, and class-wide insight generation.
