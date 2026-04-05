# ReadLabAI — Plan 2: Class Management & AI Assignment Creation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can create classes (with shareable class codes), assign uploaded papers to a class, and Gemini auto-generates a reading guide that the teacher reviews and edits before publishing. At the end of this plan, a published assignment exists in the database ready for students.

**Architecture:** Adds three backend modules to the Plan 1 foundation: `ai_provider.py` (Gemini reading guide generation), `routers/classes.py`, and `routers/assignments.py`. Assignment creation triggers a FastAPI `BackgroundTask` so Gemini processing is async — the frontend polls until `status` moves from `processing` → `draft`. Teacher then edits and publishes.

**Tech Stack:** Same as Plan 1. New: `google-generativeai` Gemini JSON mode for structured reading guide output.

**Prerequisite:** Plan 1 complete. `C:\Users\prash\ReadLabAI\` project exists with working auth and paper upload.

---

## File Map

```
backend\
  ai_provider.py                NEW — generate_reading_guide (Gemini)
  routers\
    classes.py                  NEW — create/list/get class, remove student
    assignments.py              NEW — create/get/update/publish assignment
  tests\
    test_classes.py             NEW
    test_assignments.py         NEW
  main.py                       MODIFY — register new routers
frontend\src\pages\teacher\
  ClassesPage.jsx               NEW — list classes, create class, view roster
  AssignmentReviewPage.jsx      NEW — review/edit reading guide, publish
frontend\src\App.js             MODIFY — add new routes
```

---

### Task 1: AI Provider — Reading Guide Generation

**Files:**
- Create: `backend/ai_provider.py`
- Create: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_ai_provider.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from backend.ai_provider import generate_reading_guide


@pytest.mark.asyncio
async def test_generate_reading_guide_returns_sections():
    mock_response = MagicMock()
    mock_response.text = """{
        "sections": [
            {
                "title": "Abstract",
                "text": "This study examines...",
                "guiding_questions": ["Look for: the main goal of the study"],
                "key_terms": ["RCT"],
                "teacher_notes": ""
            }
        ],
        "difficulty": "intermediate"
    }"""

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_reading_guide("Some paper text", figure_count=2)

    assert "sections" in result
    assert len(result["sections"]) >= 1
    assert "title" in result["sections"][0]
    assert "guiding_questions" in result["sections"][0]
    assert "key_terms" in result["sections"][0]
    assert "teacher_notes" in result["sections"][0]
    assert result["difficulty"] in ("beginner", "intermediate", "advanced")


@pytest.mark.asyncio
async def test_generate_reading_guide_handles_malformed_json():
    mock_response = MagicMock()
    mock_response.text = "not valid json {"

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        with pytest.raises(Exception):
            await generate_reading_guide("Some paper text", figure_count=0)
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd C:/Users/prash/ReadLabAI
pytest backend/tests/test_ai_provider.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'backend.ai_provider'`

- [ ] **Step 3: Create `backend/ai_provider.py`**

```python
import json
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from backend.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)
_model = genai.GenerativeModel("gemini-2.5-flash")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_reading_guide(extracted_text: str, figure_count: int) -> dict:
    """
    Generate a structured reading guide for a research paper.
    One call per assignment — result is cached in the assignments table.
    """
    prompt = f"""You are creating a guided reading experience for students reading a research paper.

Paper text (may be truncated to 50,000 characters):
{extracted_text[:50000]}

This paper contains {figure_count} embedded figures, images, or tables.

Return a JSON object with this exact structure:
{{
  "sections": [
    {{
      "title": "section name as it appears in the paper",
      "text": "first 400 characters of this section verbatim",
      "guiding_questions": [
        "Look for: [specific thing to find in this section]",
        "As you read, notice: [another specific thing]",
        "Consider: [a third prompt]"
      ],
      "key_terms": ["jargon term 1", "jargon term 2"],
      "teacher_notes": ""
    }}
  ],
  "difficulty": "beginner"
}}

Rules:
- Detect only sections that actually exist in this paper (Abstract, Introduction, Methods, Results, Discussion, Conclusion, Limitations, etc.)
- Guiding questions must be framed as reading prompts (what to look FOR before reading), not comprehension quiz questions asked after
- Include 3 guiding questions per section
- Include 2–5 key terms per section that a student might not know
- difficulty: "beginner" = high school reader, "intermediate" = undergraduate, "advanced" = graduate level
- teacher_notes is always an empty string — the teacher fills this in
- Return ONLY the JSON object, no markdown, no explanation"""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json",
        ),
    )
    return json.loads(response.text)
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_ai_provider.py -v
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: add AI provider with reading guide generation"
```

---

### Task 2: Classes Router

**Files:**
- Create: `backend/routers/classes.py`
- Create: `backend/tests/test_classes.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_classes.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

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
    db = mock_db_with([{"id": "cls-1", "name": "Bio 101", "class_code": "ABC123", "teacher_id": "teacher-uuid-1"}])

    with patch("backend.routers.classes.require_teacher", return_value=teacher), \
         patch("backend.routers.classes.get_db", return_value=db):
        response = client.post("/api/v1/classes/", json={"name": "Bio 101"})

    assert response.status_code == 200
    assert "class_code" in response.json()


def test_remove_student_from_class():
    teacher = {"sub": "teacher-uuid-1"}
    db = mock_db_with([{"id": "cls-1"}])

    with patch("backend.routers.classes.require_teacher", return_value=teacher), \
         patch("backend.routers.classes.get_db", return_value=db):
        response = client.delete("/api/v1/classes/cls-1/students/student-uuid-1")

    assert response.status_code == 200
    assert response.json()["ok"] is True
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_classes.py -v
```

Expected: FAIL — `404 Not Found` (route not registered yet).

- [ ] **Step 3: Create `backend/routers/classes.py`**

```python
import random
import string
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.db import get_db
from backend.deps import require_teacher

router = APIRouter()


def _make_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


class CreateClassRequest(BaseModel):
    name: str


@router.post("/")
async def create_class(body: CreateClassRequest, user=Depends(require_teacher), db=Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Class name cannot be empty")

    # Retry up to 5 times to get a unique code (collision probability is negligible)
    for _ in range(5):
        code = _make_code()
        existing = await db.from_("classes").select("id").eq("class_code", code).execute()
        if not existing.data:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique class code")

    result = await db.from_("classes").insert({
        "teacher_id": user["sub"],
        "name": body.name.strip(),
        "class_code": code,
    }).execute()
    return result.data[0]


@router.get("/")
async def list_classes(user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("classes") \
        .select("id, name, class_code, created_at") \
        .eq("teacher_id", user["sub"]) \
        .order("created_at", desc=True) \
        .execute()
    return result.data or []


@router.get("/{class_id}")
async def get_class(class_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    cls = await db.from_("classes") \
        .select("id, name, class_code, created_at") \
        .eq("id", class_id) \
        .eq("teacher_id", user["sub"]) \
        .single() \
        .execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    enrollments = await db.from_("class_enrollments") \
        .select("student_id, student_name, enrolled_at") \
        .eq("class_id", class_id) \
        .execute()

    return {**cls.data, "students": enrollments.data or []}


@router.delete("/{class_id}/students/{student_id}")
async def remove_student(
    class_id: str,
    student_id: str,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    cls = await db.from_("classes").select("id") \
        .eq("id", class_id).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    await db.from_("class_enrollments") \
        .delete() \
        .eq("class_id", class_id) \
        .eq("student_id", student_id) \
        .execute()
    return {"ok": True}
```

- [ ] **Step 4: Register classes router in `backend/main.py`**

Add to `backend/main.py`:

```python
from backend.routers import auth, papers, classes  # add classes

# After existing app.include_router lines:
app.include_router(classes.router, prefix="/api/v1/classes", tags=["classes"])
```

- [ ] **Step 5: Run tests**

```bash
pytest backend/tests/test_classes.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/classes.py backend/tests/test_classes.py backend/main.py
git commit -m "feat: add classes router with class code generation and roster management"
```

---

### Task 3: Assignments Router

**Files:**
- Create: `backend/routers/assignments.py`
- Create: `backend/tests/test_assignments.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_assignments.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

client = TestClient(app)


def mock_db_chain(return_data):
    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.update = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = AsyncMock(return_value=MagicMock(data=return_data))
    return db


def test_create_assignment_requires_teacher():
    response = client.post("/api/v1/assignments/", json={"class_id": "c1", "paper_id": "p1"})
    assert response.status_code == 401


def test_create_assignment_returns_processing_status():
    teacher = {"sub": "teacher-uuid-1"}

    class_data = [{"id": "cls-1"}]
    paper_data = [{"id": "paper-1", "extracted_text": "Some text", "figures": []}]
    assignment_data = [{"id": "asn-1", "status": "processing", "class_id": "cls-1", "paper_id": "paper-1"}]

    call_count = 0
    async def mock_execute():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MagicMock(data=class_data)
        elif call_count == 2:
            return MagicMock(data=paper_data)
        return MagicMock(data=assignment_data)

    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = mock_execute

    with patch("backend.routers.assignments.require_teacher", return_value=teacher), \
         patch("backend.routers.assignments.get_db", return_value=db), \
         patch("backend.routers.assignments._process_assignment") as mock_bg:
        response = client.post("/api/v1/assignments/", json={"class_id": "cls-1", "paper_id": "paper-1"})

    assert response.status_code == 200
    assert response.json()["status"] == "processing"


def test_update_assignment_reading_guide():
    teacher = {"sub": "teacher-uuid-1"}
    existing = [{"class_id": "cls-1", "status": "draft"}]
    cls_data = [{"id": "cls-1"}]
    updated = [{"id": "asn-1", "status": "draft", "reading_guide": {"sections": []}}]

    call_count = 0
    async def mock_execute():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return MagicMock(data=existing)
        elif call_count == 2:
            return MagicMock(data=cls_data)
        return MagicMock(data=updated)

    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.update = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.execute = mock_execute

    with patch("backend.routers.assignments.require_teacher", return_value=teacher), \
         patch("backend.routers.assignments.get_db", return_value=db):
        response = client.patch("/api/v1/assignments/asn-1", json={
            "reading_guide": {"sections": []},
            "status": "published"
        })

    assert response.status_code == 200
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_assignments.py -v
```

Expected: FAIL — `404 Not Found`.

- [ ] **Step 3: Create `backend/routers/assignments.py`**

```python
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from supabase import create_client as _supabase_client
from backend.db import get_db
from backend.deps import require_teacher
from backend.ai_provider import generate_reading_guide
from backend.config import settings

router = APIRouter()


async def _process_assignment(assignment_id: str, extracted_text: str, figure_count: int) -> None:
    """
    Background task: call Gemini and store reading guide.
    Uses synchronous supabase-py client (safe for background task context).
    """
    sb = _supabase_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    try:
        reading_guide = await generate_reading_guide(extracted_text, figure_count)
        sb.table("assignments").update({
            "reading_guide": reading_guide,
            "difficulty": reading_guide.get("difficulty", "intermediate"),
            "status": "draft",
        }).eq("id", assignment_id).execute()
    except Exception as e:
        sb.table("assignments").update({
            "status": "draft",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()


class CreateAssignmentRequest(BaseModel):
    class_id: str
    paper_id: str


class UpdateAssignmentRequest(BaseModel):
    reading_guide: Optional[dict] = None
    difficulty: Optional[str] = None
    status: Optional[str] = None


@router.post("/")
async def create_assignment(
    body: CreateAssignmentRequest,
    background_tasks: BackgroundTasks,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    cls = await db.from_("classes").select("id") \
        .eq("id", body.class_id).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Class not found or not yours")

    paper = await db.from_("papers").select("id, extracted_text, figures") \
        .eq("id", body.paper_id).eq("uploaded_by", user["sub"]).single().execute()
    if not paper.data:
        raise HTTPException(status_code=403, detail="Paper not found or not yours")

    result = await db.from_("assignments").insert({
        "class_id": body.class_id,
        "paper_id": body.paper_id,
        "status": "processing",
    }).execute()
    assignment = result.data[0]

    figure_count = len(paper.data.get("figures") or [])
    background_tasks.add_task(
        _process_assignment,
        assignment["id"],
        paper.data.get("extracted_text") or "",
        figure_count,
    )
    return assignment


@router.get("/{assignment_id}")
async def get_assignment(assignment_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("assignments") \
        .select("id, class_id, paper_id, reading_guide, status, difficulty, created_at") \
        .eq("id", assignment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = await db.from_("classes").select("id") \
        .eq("id", result.data["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    return result.data


@router.patch("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    body: UpdateAssignmentRequest,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    existing = await db.from_("assignments").select("class_id, status") \
        .eq("id", assignment_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = await db.from_("classes").select("id") \
        .eq("id", existing.data["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    if existing.data["status"] == "published":
        raise HTTPException(status_code=400, detail="Cannot modify a published assignment")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.from_("assignments").update(updates).eq("id", assignment_id).execute()
    return result.data[0]
```

- [ ] **Step 4: Register assignments router in `backend/main.py`**

```python
from backend.routers import auth, papers, classes, assignments  # add assignments

app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["assignments"])
```

- [ ] **Step 5: Run all tests**

```bash
pytest backend/tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/assignments.py backend/tests/test_assignments.py backend/main.py
git commit -m "feat: add assignments router with background AI reading guide generation"
```

---

### Task 4: Teacher Classes Page

**Files:**
- Create: `frontend/src/pages/teacher/ClassesPage.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/teacher/ClassesPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function ClassesPage() {
  const [classes, setClasses]   = useState([]);
  const [newName, setNewName]   = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null); // full class detail
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/classes/").then(({ data }) => setClasses(data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/classes/", { name: newName.trim() });
      setClasses((prev) => [data, ...prev]);
      setNewName("");
      toast.success(`Class created — code: ${data.class_code}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create class");
    } finally {
      setCreating(false);
    }
  };

  const loadClass = async (classId) => {
    try {
      const { data } = await api.get(`/classes/${classId}`);
      setSelected(data);
    } catch {
      toast.error("Could not load class");
    }
  };

  const removeStudent = async (classId, studentId) => {
    try {
      await api.delete(`/classes/${classId}/students/${studentId}`);
      setSelected((prev) => ({
        ...prev,
        students: prev.students.filter((s) => s.student_id !== studentId),
      }));
      toast.success("Student removed");
    } catch {
      toast.error("Failed to remove student");
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">Classes</h1>

      {/* Create class */}
      <form onSubmit={handleCreate} className="bg-gray-900 rounded-xl p-6 mb-8 flex gap-3">
        <input
          type="text"
          placeholder="New class name (e.g. Biology 101)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-6">
        {/* Class list */}
        <div className="space-y-3">
          {classes.length === 0 && (
            <p className="text-gray-500 text-sm">No classes yet.</p>
          )}
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => loadClass(cls.id)}
              className={`w-full text-left bg-gray-900 rounded-xl p-4 transition-colors ${
                selected?.id === cls.id ? "ring-2 ring-indigo-500" : "hover:bg-gray-800"
              }`}
            >
              <p className="text-white font-medium">{cls.name}</p>
              <p className="text-gray-500 text-xs mt-0.5 font-mono">Code: {cls.class_code}</p>
            </button>
          ))}
        </div>

        {/* Class detail */}
        {selected && (
          <div className="bg-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">{selected.name}</h2>
              <span className="bg-gray-800 text-gray-300 font-mono text-sm px-3 py-1 rounded-lg">
                {selected.class_code}
              </span>
            </div>

            <p className="text-gray-400 text-xs mb-3">
              {selected.students.length} student{selected.students.length !== 1 ? "s" : ""}
            </p>

            <div className="space-y-2">
              {selected.students.length === 0 && (
                <p className="text-gray-500 text-sm">No students enrolled yet.</p>
              )}
              {selected.students.map((s) => (
                <div key={s.student_id} className="flex items-center justify-between">
                  <span className="text-white text-sm">{s.student_name}</span>
                  <button
                    onClick={() => removeStudent(selected.id, s.student_id)}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate(`/teacher/classes/${selected.id}/assign`)}
              className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Assign a Paper
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route in `frontend/src/App.js`**

Add import at top:
```jsx
import ClassesPage from "./pages/teacher/ClassesPage";
```

Add route inside the teacher routes block:
```jsx
<Route path="/teacher/classes" element={role === "teacher" ? <ClassesPage /> : <Navigate to="/auth" />} />
```

Replace the existing `TeacherClassesPage` stub route with this line.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/teacher/ClassesPage.jsx frontend/src/App.js
git commit -m "feat: add teacher classes page with roster management"
```

---

### Task 5: Assignment Review Page

**Files:**
- Create: `frontend/src/pages/teacher/AssignmentReviewPage.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/teacher/AssignmentReviewPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function AssignmentReviewPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [guide, setGuide] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/assignments/${assignmentId}`);
      setAssignment(data);
      if (data.reading_guide?.sections) {
        setGuide(data.reading_guide);
      }
    } catch {
      toast.error("Could not load assignment");
    }
  }, [assignmentId]);

  // Poll while processing
  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (assignment?.status === "processing") load();
    }, 3000);
    return () => clearInterval(interval);
  }, [load, assignment?.status]);

  const updateQuestion = (sectionIdx, qIdx, value) => {
    setGuide((prev) => {
      const sections = [...prev.sections];
      sections[sectionIdx] = {
        ...sections[sectionIdx],
        guiding_questions: sections[sectionIdx].guiding_questions.map((q, i) =>
          i === qIdx ? value : q
        ),
      };
      return { ...prev, sections };
    });
  };

  const updateTeacherNotes = (sectionIdx, value) => {
    setGuide((prev) => {
      const sections = [...prev.sections];
      sections[sectionIdx] = { ...sections[sectionIdx], teacher_notes: value };
      return { ...prev, sections };
    });
  };

  const updateDifficulty = (value) => {
    setGuide((prev) => ({ ...prev, difficulty: value }));
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      await api.patch(`/assignments/${assignmentId}`, {
        reading_guide: guide,
        difficulty: guide.difficulty,
        ...(publish ? { status: "published" } : {}),
      });
      toast.success(publish ? "Assignment published!" : "Changes saved");
      if (publish) navigate("/teacher/classes");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!assignment) return <div className="p-8 text-gray-400">Loading…</div>;

  if (assignment.status === "processing") {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mb-4" />
        <p className="text-white text-lg font-medium">Gemini is analyzing the paper…</p>
        <p className="text-gray-400 text-sm mt-1">This takes 10–30 seconds. Don't close this tab.</p>
      </div>
    );
  }

  if (!guide || guide.generation_error) {
    return (
      <div className="p-8">
        <p className="text-red-400">Reading guide generation failed. Please delete and try again.</p>
        {guide?.generation_error && (
          <p className="text-gray-500 text-xs mt-1">{guide.generation_error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Reading Guide</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Edit questions or add teacher notes, then publish.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={guide.difficulty}
            onChange={(e) => updateDifficulty(e.target.value)}
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {guide.sections.map((section, sIdx) => (
          <div key={sIdx} className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-white font-semibold text-lg mb-1">{section.title}</h2>
            {section.text && (
              <p className="text-gray-500 text-xs italic mb-4 line-clamp-2">{section.text}</p>
            )}

            <div className="mb-4">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
                Guiding Questions
              </p>
              {section.guiding_questions.map((q, qIdx) => (
                <input
                  key={qIdx}
                  type="text"
                  value={q}
                  onChange={(e) => updateQuestion(sIdx, qIdx, e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm mb-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ))}
            </div>

            {section.key_terms?.length > 0 && (
              <div className="mb-4">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1.5">
                  Key Terms
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {section.key_terms.map((term, tIdx) => (
                    <span
                      key={tIdx}
                      className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1.5">
                Teacher Notes (optional — visible to students)
              </p>
              <textarea
                value={section.teacher_notes || ""}
                onChange={(e) => updateTeacherNotes(sIdx, e.target.value)}
                placeholder="Add a note for students about this section…"
                rows={2}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route in `frontend/src/App.js`**

Add import:
```jsx
import AssignmentReviewPage from "./pages/teacher/AssignmentReviewPage";
```

Add route inside the teacher routes block:
```jsx
<Route
  path="/teacher/assignments/:assignmentId/review"
  element={role === "teacher" ? <AssignmentReviewPage /> : <Navigate to="/auth" />}
/>
```

Also add the "Assign a Paper" flow — when a teacher clicks "Assign a Paper" from ClassesPage, they need a way to pick an existing uploaded paper and create an assignment. Add a simple assignment creation page:

- [ ] **Step 3: Create `frontend/src/pages/teacher/AssignPaperPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function AssignPaperPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [papers, setPapers]       = useState([]);
  const [selected, setSelected]   = useState(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => {});
  }, []);

  const handleAssign = async () => {
    if (!selected) return;
    setAssigning(true);
    try {
      const { data } = await api.post("/assignments/", {
        class_id: classId,
        paper_id: selected,
      });
      toast.success("Assignment created — Gemini is generating the reading guide");
      navigate(`/teacher/assignments/${data.id}/review`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create assignment");
      setAssigning(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-2">Assign a Paper</h1>
      <p className="text-gray-400 text-sm mb-6">
        Select an uploaded paper. Gemini will generate the reading guide automatically.
      </p>

      <div className="space-y-2 mb-6">
        {papers.length === 0 && (
          <p className="text-gray-500 text-sm">
            No papers uploaded yet.{" "}
            <button
              onClick={() => navigate("/teacher/papers")}
              className="text-indigo-400 hover:underline"
            >
              Upload one first.
            </button>
          </p>
        )}
        {papers.map((paper) => (
          <button
            key={paper.id}
            onClick={() => setSelected(paper.id)}
            className={`w-full text-left bg-gray-900 rounded-xl p-4 transition-colors ${
              selected === paper.id ? "ring-2 ring-indigo-500" : "hover:bg-gray-800"
            }`}
          >
            <p className="text-white font-medium">{paper.title}</p>
          </button>
        ))}
      </div>

      <button
        onClick={handleAssign}
        disabled={!selected || assigning}
        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
      >
        {assigning ? "Creating…" : "Assign Paper"}
      </button>
    </div>
  );
}
```

Add import and route to `App.js`:

```jsx
import AssignPaperPage from "./pages/teacher/AssignPaperPage";

// Inside teacher routes:
<Route
  path="/teacher/classes/:classId/assign"
  element={role === "teacher" ? <AssignPaperPage /> : <Navigate to="/auth" />}
/>
```

- [ ] **Step 4: Verify full assignment flow manually**

Start both servers. Sign in as teacher. Expected flow:
1. Go to Classes → Create a class → code appears
2. Go to Papers → Upload a PDF → appears in list
3. Go to Classes → select class → click "Assign a Paper"
4. Select the uploaded paper → click Assign
5. Redirected to review page showing spinner "Gemini is analyzing…"
6. After 10–30 seconds, spinner disappears and reading guide sections appear
7. Edit a guiding question → click Save Draft → toast "Changes saved"
8. Click Publish → redirected to Classes page

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/ frontend/src/App.js
git commit -m "feat: add assignment review page with inline editing and publish flow"
```

---

## Plan 2 Complete

At this point:
- Teachers create classes with shareable class codes
- Teachers assign papers; Gemini processes them asynchronously (one call per assignment)
- Teachers review and edit the reading guide, add personal notes, then publish
- The assignment is stored in Supabase with `status=published`, ready for students

**Next:** Plan 3 adds the student side — enrollment via class code, the section-locked reading journey, checkpoint AI feedback, jargon lookups, and the So What? exercise.
