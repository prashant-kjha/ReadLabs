# ReadLabs — Plan 4: Teacher Dashboard & Class Insights

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can see real-time student progress across all assignments, read each student's checkpoint responses inline, and generate class-wide insights (most common misconception and most commonly grasped concept per section). Insights are generated on-demand and cached — Gemini is called once per assignment, not per teacher visit.

**Architecture:** One new backend router (`dashboard.py`) and one new AI function (`generate_class_insights`). Frontend replaces the teacher Classes page sidebar with a full dashboard view showing roster progress. A drill-down page shows per-student responses and triggers insight generation.

**Tech Stack:** Same as Plans 1–3. No new dependencies.

**Prerequisite:** Plans 1–3 complete. At least one student has completed reading sections.

---

## File Map

```
backend\
  ai_provider.py                MODIFY — append generate_class_insights
  routers\
    dashboard.py                NEW — roster progress, student responses, insights
  tests\
    test_dashboard.py           NEW
  main.py                       MODIFY — register dashboard router
frontend\src\pages\teacher\
  DashboardPage.jsx             NEW — class overview with per-student progress
  AssignmentDrilldownPage.jsx   NEW — per-student responses + insights panel
frontend\src\App.js             MODIFY — add dashboard routes
```

---

### Task 1: AI Function — Class Insights

**Files:**
- Modify: `backend/ai_provider.py` (append one function)
- Modify: `backend/tests/test_ai_provider.py` (append test)

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_ai_provider.py`:

```python
from backend.ai_provider import generate_class_insights


@pytest.mark.asyncio
async def test_generate_class_insights_returns_structured_result():
    mock_response = MagicMock()
    mock_response.text = """{
        "common_misconception": "Most students confused correlation with causation",
        "commonly_grasped": "Most students correctly identified the sample size",
        "student_count": 3
    }"""

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_class_insights(
            section_title="Results",
            responses=["The drug cured patients", "It reduced symptoms", "Patients got better"],
        )

    assert "common_misconception" in result
    assert "commonly_grasped" in result
    assert "student_count" in result
    assert result["student_count"] == 3
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pytest backend/tests/test_ai_provider.py::test_generate_class_insights_returns_structured_result -v
```

Expected: FAIL — `ImportError: cannot import name 'generate_class_insights'`

- [ ] **Step 3: Append function to `backend/ai_provider.py`**

Add at the bottom of `backend/ai_provider.py`:

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_class_insights(section_title: str, responses: list[str]) -> dict:
    """
    Analyze all student checkpoint responses for a section.
    Identifies the most common misconception and the most commonly grasped concept.
    Called once per assignment section, result cached in assignment_insights table.
    """
    responses_text = "\n---\n".join(
        f"Student {i + 1}: {r}" for i, r in enumerate(responses)
    )
    prompt = f"""You are analyzing {len(responses)} student checkpoint responses for the "{section_title}" section of a research paper.

Student responses:
{responses_text}

Based on these responses, identify patterns across the class.

Return valid JSON with this exact structure:
{{
  "common_misconception": "A specific description of what most students got wrong or misunderstood about this section. Be concrete — quote or paraphrase the pattern.",
  "commonly_grasped": "A specific description of what most students correctly understood. Be concrete.",
  "student_count": {len(responses)}
}}

Rules:
- If fewer than 3 responses, note that patterns are limited
- Be specific about the content of the misconception, not generic ("students struggled with X" not "students had difficulty")
- Return ONLY the JSON object, no other text"""

    response = _model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json",
        ),
    )
    return json.loads(response.text)
```

- [ ] **Step 4: Run all AI provider tests**

```bash
pytest backend/tests/test_ai_provider.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: add class insights AI function"
```

---

### Task 2: Dashboard Router

**Files:**
- Create: `backend/routers/dashboard.py`
- Create: `backend/tests/test_dashboard.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_dashboard.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

client = TestClient(app)


def make_db(sequence):
    call_count = [0]
    async def mock_execute():
        idx = call_count[0]; call_count[0] += 1
        return MagicMock(data=sequence[idx] if idx < len(sequence) else [])
    db = MagicMock()
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "single", "order", "in_"]:
        setattr(db, attr, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


def test_get_class_progress_requires_teacher():
    response = client.get("/api/v1/dashboard/classes/cls-1/progress")
    assert response.status_code == 401


def test_get_class_progress_returns_students():
    teacher = {"sub": "teacher-uuid-1"}
    cls_data = [{"id": "cls-1", "name": "Bio 101", "teacher_id": "teacher-uuid-1"}]
    enrollments = [{"student_id": "s-1", "student_name": "Alice"}, {"student_id": "s-2", "student_name": "Bob"}]
    assignments = [{"id": "asn-1", "status": "published"}]
    sessions = [{"student_id": "s-1", "assignment_id": "asn-1", "status": "in_progress", "current_section_index": 2}]

    db = make_db([cls_data, enrollments, assignments, sessions])

    with patch("backend.routers.dashboard.require_teacher", return_value=teacher), \
         patch("backend.routers.dashboard.get_db", return_value=db):
        response = client.get("/api/v1/dashboard/classes/cls-1/progress")

    assert response.status_code == 200
    body = response.json()
    assert "students" in body
    assert len(body["students"]) == 2


def test_get_student_responses_returns_checkpoints():
    teacher = {"sub": "teacher-uuid-1"}
    cls_data = [{"id": "cls-1", "teacher_id": "teacher-uuid-1"}]
    session_data = [{"id": "ses-1", "student_id": "s-1", "assignment_id": "asn-1", "status": "in_progress"}]
    checkpoints = [
        {"section_index": 0, "student_text": "My answer", "ai_feedback": "Good job!", "submitted_at": "2026-01-01"},
    ]
    sowhat_data = None

    db = make_db([cls_data, session_data, checkpoints, [sowhat_data] if sowhat_data else []])

    with patch("backend.routers.dashboard.require_teacher", return_value=teacher), \
         patch("backend.routers.dashboard.get_db", return_value=db):
        response = client.get("/api/v1/dashboard/assignments/asn-1/students/s-1/responses")

    assert response.status_code == 200
    assert "checkpoints" in response.json()


def test_get_insights_triggers_generation_when_missing():
    teacher = {"sub": "teacher-uuid-1"}
    asn_data = [{"id": "asn-1", "class_id": "cls-1", "reading_guide": {
        "sections": [{"title": "Methods", "text": "..."}]
    }}]
    cls_data = [{"id": "cls-1", "teacher_id": "teacher-uuid-1"}]
    existing_insights = []  # no cached insights
    responses = [
        {"section_index": 0, "student_text": "The study used 42 patients"},
        {"section_index": 0, "student_text": "They measured blood pressure"},
    ]
    inserted = [{"id": "ins-1", "insights": {"sections": []}}]

    db = make_db([asn_data, cls_data, existing_insights, responses, inserted])

    mock_insights = {"sections": [{"title": "Methods", "common_misconception": "...", "commonly_grasped": "...", "student_count": 2}]}

    with patch("backend.routers.dashboard.require_teacher", return_value=teacher), \
         patch("backend.routers.dashboard.get_db", return_value=db), \
         patch("backend.routers.dashboard.generate_class_insights",
               new_callable=AsyncMock, return_value={"common_misconception": "...", "commonly_grasped": "...", "student_count": 2}):
        response = client.get("/api/v1/dashboard/assignments/asn-1/insights")

    assert response.status_code == 200
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_dashboard.py -v
```

Expected: FAIL — `404 Not Found`.

- [ ] **Step 3: Create `backend/routers/dashboard.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from backend.db import get_db
from backend.deps import require_teacher
from backend.ai_provider import generate_class_insights

router = APIRouter()


@router.get("/classes/{class_id}/progress")
async def get_class_progress(class_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    """
    Return all students in the class and their progress on each published assignment.
    """
    cls = await db.from_("classes").select("id, name") \
        .eq("id", class_id).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=404, detail="Class not found")

    enrollments = await db.from_("class_enrollments") \
        .select("student_id, student_name") \
        .eq("class_id", class_id).execute()

    assignments = await db.from_("assignments") \
        .select("id, status, difficulty, created_at") \
        .eq("class_id", class_id).eq("status", "published").execute()

    assignment_ids = [a["id"] for a in (assignments.data or [])]

    sessions = await db.from_("student_sessions") \
        .select("student_id, assignment_id, status, current_section_index, completed_at") \
        .in_("assignment_id", assignment_ids).execute() if assignment_ids else MagicMock(data=[])

    sessions_by_student = {}
    for s in (sessions.data or []):
        sessions_by_student.setdefault(s["student_id"], []).append(s)

    students_progress = []
    for enrollment in (enrollments.data or []):
        sid = enrollment["student_id"]
        student_sessions = sessions_by_student.get(sid, [])
        students_progress.append({
            "student_id":   sid,
            "student_name": enrollment["student_name"],
            "sessions":     student_sessions,
        })

    return {
        "class":       cls.data,
        "assignments": assignments.data or [],
        "students":    students_progress,
    }


@router.get("/assignments/{assignment_id}/students/{student_id}/responses")
async def get_student_responses(
    assignment_id: str,
    student_id: str,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    """Return all checkpoint responses and the So What response for one student on one assignment."""
    # Verify teacher owns the class
    asn = await db.from_("assignments").select("class_id") \
        .eq("id", assignment_id).single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = await db.from_("classes").select("id") \
        .eq("id", asn.data["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    session = await db.from_("student_sessions").select("id, status, current_section_index, started_at, completed_at") \
        .eq("assignment_id", assignment_id).eq("student_id", student_id).single().execute()

    if not session.data:
        return {"session": None, "checkpoints": [], "sowhat": None}

    checkpoints = await db.from_("checkpoint_responses") \
        .select("section_index, student_text, ai_feedback, submitted_at") \
        .eq("session_id", session.data["id"]) \
        .order("section_index") \
        .execute()

    sowhat = await db.from_("sowhat_responses") \
        .select("student_text, ai_feedback, submitted_at") \
        .eq("session_id", session.data["id"]).single().execute()

    return {
        "session":    session.data,
        "checkpoints": checkpoints.data or [],
        "sowhat":     sowhat.data,
    }


@router.get("/assignments/{assignment_id}/insights")
async def get_insights(assignment_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    """
    Return class-wide insights for this assignment.
    If insights don't exist yet, generate them from all student checkpoint responses (one Gemini call).
    If they already exist, return the cached version.
    """
    asn = await db.from_("assignments") \
        .select("id, class_id, reading_guide") \
        .eq("id", assignment_id).single().execute()
    if not asn.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    cls = await db.from_("classes").select("id") \
        .eq("id", asn.data["class_id"]).eq("teacher_id", user["sub"]).single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Return cached insights if they exist
    cached = await db.from_("assignment_insights").select("insights, generated_at") \
        .eq("assignment_id", assignment_id).single().execute()
    if cached.data:
        return cached.data

    # Generate insights from all student responses
    sections = asn.data["reading_guide"].get("sections", [])
    section_insights = []

    for idx, section in enumerate(sections):
        responses_result = await db.from_("checkpoint_responses") \
            .select("student_text") \
            .eq("section_index", idx) \
            .execute()

        response_texts = [r["student_text"] for r in (responses_result.data or [])]

        if len(response_texts) < 2:
            section_insights.append({
                "title":               section.get("title", f"Section {idx + 1}"),
                "common_misconception": "Not enough responses yet to identify patterns.",
                "commonly_grasped":    "Not enough responses yet.",
                "student_count":       len(response_texts),
            })
            continue

        insight = await generate_class_insights(
            section_title=section.get("title", f"Section {idx + 1}"),
            responses=response_texts,
        )
        section_insights.append({
            "title": section.get("title", f"Section {idx + 1}"),
            **insight,
        })

    insights_payload = {"sections": section_insights}
    result = await db.from_("assignment_insights").upsert({
        "assignment_id": assignment_id,
        "insights":      insights_payload,
    }).execute()

    return {"insights": insights_payload, "generated_at": result.data[0].get("generated_at")}
```

- [ ] **Step 4: Register in `backend/main.py`**

```python
from backend.routers import (
    auth, papers, classes, assignments,
    enrollments, sessions, checkpoints, jargon, sowhat, dashboard,
)

app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
```

- [ ] **Step 5: Run all tests**

```bash
pytest backend/tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/dashboard.py backend/tests/test_dashboard.py backend/main.py
git commit -m "feat: add dashboard router with progress tracking and class insights"
```

---

### Task 3: Teacher Dashboard Page

**Files:**
- Create: `frontend/src/pages/teacher/DashboardPage.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/teacher/DashboardPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

function ProgressBar({ value, max, color = "bg-indigo-500" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-gray-400 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function TeacherDashboardPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/dashboard/classes/${classId}/progress`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Could not load dashboard"));
  }, [classId]);

  if (!data) return <div className="p-8 text-gray-400">Loading…</div>;

  const { students, assignments } = data;
  const totalSections = (asn) => asn?.reading_guide?.sections?.length ?? 0;

  const sessionFor = (student, asnId) =>
    student.sessions.find((s) => s.assignment_id === asnId);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{data.class?.name}</h1>
        <button
          onClick={() => navigate("/teacher/classes")}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← Classes
        </button>
      </div>

      {students.length === 0 && (
        <p className="text-gray-500 text-sm">No students enrolled yet.</p>
      )}

      {assignments.length === 0 && (
        <p className="text-gray-500 text-sm mb-6">No published assignments yet.</p>
      )}

      {assignments.map((asn) => (
        <div key={asn.id} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">
              Assignment
              <span className="text-gray-500 font-normal text-sm ml-2 capitalize">
                · {asn.difficulty}
              </span>
            </h2>
            <button
              onClick={() => navigate(`/teacher/assignments/${asn.id}/drilldown`)}
              className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              View responses →
            </button>
          </div>

          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Student</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Progress</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const session = sessionFor(student, asn.id);
                  const completed = session?.current_section_index ?? 0;
                  const total = totalSections(asn);
                  const status = session?.status ?? "not_started";

                  return (
                    <tr
                      key={student.student_id}
                      className="border-b border-gray-800 last:border-0 hover:bg-gray-800 cursor-pointer"
                      onClick={() =>
                        navigate(`/teacher/assignments/${asn.id}/students/${student.student_id}/responses`)
                      }
                    >
                      <td className="px-4 py-3 text-white">{student.student_name}</td>
                      <td className="px-4 py-3 w-48">
                        <ProgressBar value={completed} max={total || 1} />
                        <span className="text-gray-500 text-xs">{completed}/{total} sections</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          status === "completed"
                            ? "bg-green-900 text-green-300"
                            : status === "in_progress"
                            ? "bg-indigo-900 text-indigo-300"
                            : "bg-gray-800 text-gray-400"
                        }`}>
                          {status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update `frontend/src/App.js`**

Add import:
```jsx
import TeacherDashboardPage from "./pages/teacher/DashboardPage";
```

Add route:
```jsx
<Route
  path="/teacher/classes/:classId/dashboard"
  element={role === "teacher" ? <TeacherDashboardPage /> : <Navigate to="/auth" />}
/>
```

Also update `ClassesPage.jsx` — replace the "Assign a Paper" button with two buttons: "Assign Paper" and "View Dashboard":

In `frontend/src/pages/teacher/ClassesPage.jsx`, replace:
```jsx
<button
  onClick={() => navigate(`/teacher/classes/${selected.id}/assign`)}
  className="mt-5 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
>
  Assign a Paper
</button>
```

With:
```jsx
<div className="mt-5 flex gap-2">
  <button
    onClick={() => navigate(`/teacher/classes/${selected.id}/assign`)}
    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
  >
    Assign Paper
  </button>
  <button
    onClick={() => navigate(`/teacher/classes/${selected.id}/dashboard`)}
    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
  >
    Dashboard
  </button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/teacher/DashboardPage.jsx \
        frontend/src/pages/teacher/ClassesPage.jsx \
        frontend/src/App.js
git commit -m "feat: add teacher dashboard with per-student progress tracking"
```

---

### Task 4: Assignment Drilldown & Insights Page

**Files:**
- Create: `frontend/src/pages/teacher/AssignmentDrilldownPage.jsx`
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/pages/teacher/AssignmentDrilldownPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

function StudentResponseCard({ student_id, assignmentId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (data) return; // already loaded
    try {
      const { data: res } = await api.get(
        `/dashboard/assignments/${assignmentId}/students/${student_id}/responses`
      );
      setData(res);
    } catch {
      toast.error("Could not load responses");
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800 transition-colors"
        onClick={() => { setOpen(!open); load(); }}
      >
        <span className="text-white font-medium">Student {student_id.slice(-6)}</span>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && data && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-4">
          {data.checkpoints.length === 0 && (
            <p className="text-gray-500 text-sm">No responses yet.</p>
          )}
          {data.checkpoints.map((cp, i) => (
            <div key={i} className="text-sm">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">
                Section {cp.section_index + 1} response
              </p>
              <p className="text-gray-200 mb-2 bg-gray-800 rounded p-2">{cp.student_text}</p>
              {cp.ai_feedback && (
                <p className="text-indigo-300 text-xs italic">{cp.ai_feedback}</p>
              )}
            </div>
          ))}
          {data.sowhat && (
            <div className="text-sm border-t border-gray-800 pt-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">
                So What? response
              </p>
              <p className="text-gray-200 mb-2 bg-gray-800 rounded p-2">{data.sowhat.student_text}</p>
              {data.sowhat.ai_feedback && (
                <p className="text-indigo-300 text-xs italic">{data.sowhat.ai_feedback}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InsightsPanel({ assignmentId }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dashboard/assignments/${assignmentId}/insights`);
      setInsights(data.insights || data);
      setGenerated(true);
    } catch {
      toast.error("Could not generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold">Class Insights</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            Common misconceptions and concepts students grasped, generated from all responses.
          </p>
        </div>
        {!insights && (
          <button
            onClick={generate}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating…" : "Generate Insights"}
          </button>
        )}
        {insights && (
          <button
            onClick={generate}
            disabled={loading}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            {loading ? "Refreshing…" : "Regenerate"}
          </button>
        )}
      </div>

      {insights && (
        <div className="space-y-4">
          {insights.sections?.map((section, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4">
              <p className="text-white font-medium mb-3">{section.title}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-1">
                    Common misconception
                  </p>
                  <p className="text-gray-300 text-sm">{section.common_misconception}</p>
                </div>
                <div>
                  <p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-1">
                    Most commonly grasped
                  </p>
                  <p className="text-gray-300 text-sm">{section.commonly_grasped}</p>
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                Based on {section.student_count} response{section.student_count !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {!insights && !loading && (
        <p className="text-gray-500 text-sm">
          Click "Generate Insights" to analyze all student responses for this assignment.
        </p>
      )}
    </div>
  );
}

export default function AssignmentDrilldownPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  // We need the student list — fetch it via the assignment's class
  const [students, setStudents] = useState([]);

  useEffect(() => {
    // Get assignment → class → dashboard
    api.get(`/assignments/${assignmentId}`)
      .then(({ data: asn }) =>
        api.get(`/dashboard/classes/${asn.class_id}/progress`)
      )
      .then(({ data }) => setStudents(data.students || []))
      .catch(() => toast.error("Could not load assignment data"));
  }, [assignmentId]);

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-400 hover:text-white text-sm mb-6 block transition-colors"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-white mb-6">Assignment Responses</h1>

      <InsightsPanel assignmentId={assignmentId} />

      <h2 className="text-white font-semibold mb-3">Student Responses</h2>
      <div className="space-y-2">
        {students.length === 0 && (
          <p className="text-gray-500 text-sm">No students have started this assignment yet.</p>
        )}
        {students.map((s) => (
          <StudentResponseCard
            key={s.student_id}
            student_id={s.student_id}
            assignmentId={assignmentId}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add routes in `frontend/src/App.js`**

Add import:
```jsx
import AssignmentDrilldownPage from "./pages/teacher/AssignmentDrilldownPage";
```

Add routes:
```jsx
<Route
  path="/teacher/assignments/:assignmentId/drilldown"
  element={role === "teacher" ? <AssignmentDrilldownPage /> : <Navigate to="/auth" />}
/>
<Route
  path="/teacher/assignments/:assignmentId/students/:studentId/responses"
  element={role === "teacher" ? <AssignmentDrilldownPage /> : <Navigate to="/auth" />}
/>
```

- [ ] **Step 3: Verify the full teacher dashboard flow manually**

Start both servers. Sign in as a teacher. Expected flow:
1. Classes page → select a class → click "Dashboard"
2. Dashboard shows the student roster with progress bars
3. Click a student row → navigates to drilldown page
4. Drilldown page shows all student accordion cards
5. Click a student card → their checkpoint responses and AI feedback appear inline
6. Click "Generate Insights" → spinner → insights appear per section showing misconception and grasped concept
7. Click "Regenerate" → insights refresh (cached version replaced)

- [ ] **Step 4: Run all backend tests one final time**

```bash
cd C:/Users/prash/ReadLabs
pytest backend/tests/ -v
```

Expected: All tests PASS with no failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/AssignmentDrilldownPage.jsx frontend/src/App.js
git commit -m "feat: add assignment drilldown page with student responses and class insights"
```

---

## Plan 4 Complete — ReadLabs MVP Done

At this point the full ReadLabs MVP is functional:

**Teacher flow:**
1. Sign up as teacher → create class → get class code
2. Upload PDF → text + figures extracted
3. Assign paper to class → Gemini generates reading guide → review and edit → publish
4. Share class code with students
5. Monitor progress: Classes → Dashboard → per-student progress bars
6. Read student responses inline, generate class-wide insights on demand

**Student flow:**
1. Sign up as student → enter class code → enrolled
2. Open assignment → section-locked reading journey begins
3. Read guiding questions → read text + figures → highlight jargon to look up
4. Write checkpoint → get AI feedback → advance to next section
5. Complete all sections → write So What? paragraph → get AI evaluation
6. Assignment marked complete

**What's next (out of scope for MVP):**
- DOI / keyword paper search (self-study mode Phase 2)
- Pattern recognition across multiple papers
- Email notifications when students complete assignments
- School SSO / LMS integration
- Mobile-optimized UI
