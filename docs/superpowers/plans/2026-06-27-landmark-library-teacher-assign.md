# Landmark Library — Phase 2 (Teacher Assign-to-Class) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher assign any landmark paper (at a chosen difficulty) to one of their classes by **copying** the pre-built reading guide — no Gemini call — and surface that flow through a shared `/teacher/library` page.

**Architecture:** One new teacher endpoint `POST /library/landmark/assign` validates class ownership + landmark-paper status, dedups against an existing class assignment, then inserts a new published `assignments` row whose `reading_guide` is copied from the source landmark assignment, and re-points the source's `critical_prompts` + `quiz_questions` to the new assignment id. The existing student `LandmarkLibraryPage` becomes role-aware: students keep "Start Reading" (session flow), teachers get "Assign to class" (opens an `AssignToClassModal`). A new `/teacher/library` route + nav entry reuse the page.

**Tech Stack:** FastAPI + custom async PostgREST `QueryBuilder` (`backend/db.py`), Pydantic schemas, pytest (mocked DB); React 19 + TypeScript (strict) + Tailwind + React Router v6, Playwright E2E (mocked API).

**Branch:** `feat/landmark-library-seed` (Phase 1 lives here; Phase 2 extends it). Do not merge/push — work stays on the branch.

**Design spec:** `docs/superpowers/specs/2026-06-26-landmark-library-frontend-design.md` (section "Phase 2 — teacher assign to class" + the `POST /library/landmark/assign` endpoint definition).

---

## File Structure

**Backend (modify):**
- `backend/schemas/library.py` — add `AssignLandmarkRequest`, `AssignLandmarkResponse`.
- `backend/routers/library.py` — add `require_teacher` import, the two new schema imports, `_copy_child_rows` helper, and the `POST /landmark/assign` route.
- `backend/tests/test_library.py` — add `require_teacher` import + 7 `test_assign_landmark_*` tests.

**Frontend (create/modify):**
- `frontend/src/types/landmark.ts` — add `AssignLandmarkResponse`.
- `frontend/src/lib/api.ts` — add `libraryApi.assignLandmark(...)` + import the new type.
- `frontend/src/components/landmark/LandmarkPaperCard.tsx` — role-conditional action button ("Assign to class" for teachers).
- `frontend/src/components/landmark/AssignToClassModal.tsx` — **create.** Class picker + confirm.
- `frontend/src/pages/student/LandmarkLibraryPage.tsx` — role-aware: branch heading + action; wire the modal for teachers; skip the student-only `/sessions/` fetch for teachers.
- `frontend/src/App.tsx` — add `/teacher/library` route.
- `frontend/src/components/Layout.tsx` — add "Library" to `TEACHER_LINKS`.
- `frontend/tests/helpers.js` — extend `mockTeacherApiRoutes` with `/library/landmark**` + `/library/landmark/assign` mocks.
- `frontend/tests/landmark-teacher.spec.js` — **create.** Teacher landmark E2E.

---

## Task 1: Backend request/response schemas

**Files:**
- Modify: `backend/schemas/library.py`

- [ ] **Step 1: Add the two Pydantic models**

Append to `backend/schemas/library.py` (after `LandmarkLibraryResponse`):

```python
class AssignLandmarkRequest(BaseModel):
    class_id: str
    paper_id: str
    difficulty: str


class AssignLandmarkResponse(BaseModel):
    assignment_id: str
    class_id: str
    paper_id: str
    difficulty: str
    status: str
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `cd backend && python -c "from backend.schemas.library import AssignLandmarkRequest, AssignLandmarkResponse; print('ok')"`
Expected: prints `ok` (no ImportError / no validation error).

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/library.py
git commit -m "feat(library): assign-landmark request/response schemas"
```

---

## Task 2: Backend `POST /library/landmark/assign` endpoint (TDD)

The endpoint's exact DB-call sequence is load-bearing for the mocked tests. Happy path (with prompts + quiz to copy) executes the DB **9 times**, in this order:

1. `classes` select — class-ownership check
2. `papers` select — landmark-paper check
3. `assignments` select — dedup check
4. `assignments` select — source guide load
5. `assignments` insert — new class assignment
6. `critical_prompts` select — source children
7. `critical_prompts` insert — copied children (only if step 6 non-empty)
8. `quiz_questions` select — source children
9. `quiz_questions` insert — copied children (only if step 8 non-empty)

Each test feeds `make_db(...)` exactly the rows for its path.

**Files:**
- Modify: `backend/routers/library.py`
- Test: `backend/tests/test_library.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_library.py`, first update the imports (line 7) to also import `require_teacher`:

```python
from backend.deps import require_student, require_teacher, get_db
```

Then append these tests at the end of the file. `make_db` (already defined at the top of the file) returns successive `MagicMock(data=…)` per `.execute()` call, so each list below maps 1:1 to the endpoint's execute order.

```python
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
        [{"section_index": 0, "prompt_text": "Why?", "prompt_type": "methodology", "ai_followup": ""}],  # 6. source prompts
        [],                                            # 7. prompts insert result
        [{"question_text": "Q?", "question_type": "multiple_choice", "options": ["a", "b"], "correct_answer": "a", "explanation": "x"}],  # 8. source quiz
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_library.py -k assign_landmark -v`
Expected: FAIL — the tests POST to a route that does not exist yet (404/405 or AttributeError), not the asserted statuses.

- [ ] **Step 3: Wire up the imports in the router**

In `backend/routers/library.py`:

Change line 7 from:
```python
from backend.deps import require_student
```
to:
```python
from backend.deps import require_student, require_teacher
```

And extend the schema import block (lines 13–22) — add `AssignLandmarkRequest` and `AssignLandmarkResponse` to the existing import list, e.g.:
```python
from backend.schemas.library import (
    FetchCoreRequest,
    LibraryUploadResponse,
    LibraryStatusResponse,
    LibraryPaperResponse,
    CoreSearchResult,
    LandmarkPaper,
    LandmarkLevel,
    LandmarkLibraryResponse,
    AssignLandmarkRequest,
    AssignLandmarkResponse,
)
```

- [ ] **Step 4: Add the `_copy_child_rows` helper**

Add this helper near the other module-level helpers (e.g. right after `_landmark_papers_with_levels`):

```python
async def _copy_child_rows(db, table: str, source_id: str, new_id: str) -> None:
    """Copy critical_prompts / quiz_questions rows from a source assignment to a
    new one. Drops the source primary key (so the insert gets fresh ids) and
    re-points assignment_id. No-op when the source has none."""
    res = await db.from_(table).select("*").eq("assignment_id", source_id).execute()
    rows = res.data or []
    if not rows:
        return
    for row in rows:
        row.pop("id", None)
        row["assignment_id"] = new_id
    await db.from_(table).insert(rows).execute()
```

- [ ] **Step 5: Add the `POST /landmark/assign` route**

Append after the existing `list_landmark_featured` route (it must come after `/landmark/featured` so the `/landmark/featured` GET is not shadowed; FastAPI matches `/landmark/assign` exactly so ordering between `assign` and `featured` is not strictly ambiguous, but keep landmark sub-routes grouped at the end of the file):

```python
@router.post("/landmark/assign", response_model=AssignLandmarkResponse)
async def assign_landmark(
    body: AssignLandmarkRequest,
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    """Assign a landmark paper at a chosen level to a class by COPYING the
    pre-built reading guide (no Gemini). Idempotent: re-assigning the same
    class+paper+difficulty returns the existing class assignment."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        raise HTTPException(status_code=503, detail="Landmark library not configured")

    # 1. Class must belong to this teacher.
    cls = await db.from_("classes").select("id") \
        .eq("id", body.class_id).eq("teacher_id", user["sub"]).maybe_single().execute()
    if not cls.data:
        raise HTTPException(status_code=403, detail="Class not found or not yours")

    # 2. Paper must be a landmark (service-user-owned) paper.
    paper = await db.from_("papers").select("uploaded_by") \
        .eq("id", body.paper_id).maybe_single().execute()
    if not paper.data or paper.data.get("uploaded_by") != landmark_user:
        raise HTTPException(status_code=404, detail="Paper not found in landmark library")

    # 3. Dedup: an existing class assignment for this class+paper+level is returned as-is.
    existing = await db.from_("assignments").select("id, status") \
        .eq("class_id", body.class_id).eq("paper_id", body.paper_id) \
        .eq("difficulty", body.difficulty).maybe_single().execute()
    if existing.data:
        return AssignLandmarkResponse(
            assignment_id=existing.data["id"],
            class_id=body.class_id,
            paper_id=body.paper_id,
            difficulty=body.difficulty,
            status=existing.data.get("status", "published"),
        )

    # 4. Load the source landmark (class_id IS NULL, published) guide for this level.
    source = await db.from_("assignments").select("id, reading_guide") \
        .eq("paper_id", body.paper_id).eq("difficulty", body.difficulty) \
        .is_("class_id", "null").eq("status", "published").maybe_single().execute()
    guide = source.data.get("reading_guide") if source.data else None
    if not guide or not isinstance(guide.get("sections"), list):
        raise HTTPException(status_code=404, detail="No reading guide available for this level")

    # 5. Insert the new class assignment with the copied guide (published, no Gemini).
    inserted = await db.from_("assignments").insert({
        "class_id": body.class_id,
        "paper_id": body.paper_id,
        "difficulty": body.difficulty,
        "status": "published",
        "reading_guide": guide,
    }).execute()
    if not inserted.data:
        raise HTTPException(status_code=500, detail="Failed to create assignment")
    new_id = inserted.data[0]["id"]

    # 6. Copy critical_prompts + quiz_questions from the source (re-point assignment_id).
    await _copy_child_rows(db, "critical_prompts", source.data["id"], new_id)
    await _copy_child_rows(db, "quiz_questions", source.data["id"], new_id)

    return AssignLandmarkResponse(
        assignment_id=new_id,
        class_id=body.class_id,
        paper_id=body.paper_id,
        difficulty=body.difficulty,
        status="published",
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_library.py -k assign_landmark -v`
Expected: PASS — all 7 `assign_landmark` tests green.

- [ ] **Step 7: Run the full backend test suite to confirm no regressions**

Run: `cd backend && python -m pytest -q`
Expected: PASS — all tests green (the prior 14 + 7 new = 21).

- [ ] **Step 8: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat(library): POST /library/landmark/assign copies guide to a class"
```

---

## Task 3: Frontend API client + response type

**Files:**
- Modify: `frontend/src/types/landmark.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the response type**

Append to `frontend/src/types/landmark.ts`:

```ts
export interface AssignLandmarkResponse {
  assignment_id: string;
  class_id: string;
  paper_id: string;
  difficulty: string;
  status: string;
}
```

- [ ] **Step 2: Import the type in the api client**

In `frontend/src/lib/api.ts`, change line 7 from:
```ts
import type { LandmarkLibraryResponse, LandmarkPaper } from "../types/landmark";
```
to:
```ts
import type { LandmarkLibraryResponse, LandmarkPaper, AssignLandmarkResponse } from "../types/landmark";
```

- [ ] **Step 3: Add the `assignLandmark` method**

Inside the `libraryApi` object (after the existing `featuredLandmarks` entry, before the closing `};`), add:

```ts
  assignLandmark: (data: { class_id: string; paper_id: string; difficulty: string }) =>
    api.post<AssignLandmarkResponse>("/library/landmark/assign", data).then((r) => r.data),
```

- [ ] **Step 4: Verify the frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/landmark.ts frontend/src/lib/api.ts
git commit -m "feat(api): libraryApi.assignLandmark client method + type"
```

---

## Task 4: Role-conditional action button on `LandmarkPaperCard`

**Files:**
- Modify: `frontend/src/components/landmark/LandmarkPaperCard.tsx`

- [ ] **Step 1: Extend props and branch the action button**

Replace the entire contents of `frontend/src/components/landmark/LandmarkPaperCard.tsx` with:

```tsx
import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { LandmarkPaper } from "../../types/landmark";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "border-border bg-surface-raised text-success",
  intermediate: "border-border bg-surface-raised text-warning",
  advanced: "border-border bg-surface-raised text-danger",
};

interface Props {
  paper: LandmarkPaper;
  role?: string;
  startedAssignmentIds?: Set<string>;
  onStart?: (assignmentId: string) => void;
  onAssign?: (paper: LandmarkPaper, difficulty: string) => void;
}

export default function LandmarkPaperCard({ paper, role, startedAssignmentIds, onStart, onAssign }: Props) {
  const levels = paper.levels;
  const isTeacher = role === "teacher";
  const defaultDifficulty =
    levels.find((l) => l.difficulty === "intermediate")?.difficulty || levels[0]?.difficulty || "";
  const [selected, setSelected] = useState(defaultDifficulty);
  const selectedLevel = levels.find((l) => l.difficulty === selected) || levels[0];
  const started = selectedLevel ? startedAssignmentIds?.has(selectedLevel.assignment_id) : false;

  return (
    <div className="card-hover p-4 flex flex-col" data-testid="landmark-card">
      <div className="flex items-start gap-2 mb-2">
        <BookOpen className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <h3 className="font-display text-sm font-semibold leading-snug text-[var(--color-text)]">{paper.title}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {levels.map((l) => (
          <button
            key={l.difficulty}
            type="button"
            onClick={() => setSelected(l.difficulty)}
            aria-pressed={selected === l.difficulty}
            className={`font-mono uppercase tracking-wider text-xs px-2 py-1 rounded-sm border transition-colors ${
              selected === l.difficulty
                ? "bg-primary text-[var(--color-primary-foreground)] border-primary"
                : DIFFICULTY_COLORS[l.difficulty] || "bg-muted text-[var(--color-text-secondary)]"
            }`}
          >
            {l.difficulty}
          </button>
        ))}
      </div>
      {isTeacher ? (
        <button
          type="button"
          onClick={() => selectedLevel && onAssign?.(paper, selectedLevel.difficulty)}
          disabled={!selectedLevel}
          className="btn-primary w-full mt-auto text-sm disabled:opacity-50"
        >
          Assign to class
        </button>
      ) : (
        <button
          type="button"
          onClick={() => selectedLevel && onStart?.(selectedLevel.assignment_id)}
          disabled={!selectedLevel}
          className="btn-primary w-full mt-auto text-sm disabled:opacity-50"
        >
          {started ? "Continue Reading" : "Start Reading"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (The existing student page still passes `onStart`; the new optional props are optional.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/landmark/LandmarkPaperCard.tsx
git commit -m "feat(library): role-conditional Assign-to-class action on landmark card"
```

---

## Task 5: `AssignToClassModal` component

**Files:**
- Create: `frontend/src/components/landmark/AssignToClassModal.tsx`

- [ ] **Step 1: Create the modal**

Create `frontend/src/components/landmark/AssignToClassModal.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { classesApi, libraryApi } from "../../lib/api";
import type { ClassItem } from "../../types/classes";
import type { LandmarkPaper } from "../../types/landmark";

interface Props {
  paper: LandmarkPaper | null;
  difficulty: string;
  onClose: () => void;
}

export default function AssignToClassModal({ paper, difficulty, onClose }: Props) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [saving, setSaving] = useState(false);

  // Load the teacher's classes once when the modal mounts; default-select the first.
  useEffect(() => {
    let active = true;
    classesApi
      .list()
      .then((c) => {
        if (!active) return;
        setClasses(c);
        setClassId(c[0]?.id ?? "");
      })
      .catch(() => toast.error("Could not load your classes"));
    return () => {
      active = false;
    };
  }, []);

  if (!paper) return null;

  const submit = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      await libraryApi.assignLandmark({ class_id: classId, paper_id: paper.paper_id, difficulty });
      const name = classes.find((c) => c.id === classId)?.name ?? "class";
      toast.success(`Assigned to ${name}`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not assign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assign to class"
    >
      <div className="card p-6 w-full max-w-sm rounded-sm bg-surface-raised border-[var(--color-border-strong)] shadow-print">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">Assign to class</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)] mt-1 truncate">
              {paper.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-accent transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="font-mono text-xs text-[var(--color-text-secondary)] mb-4">
          Level: <span className="text-[var(--color-text)] uppercase">{difficulty || "—"}</span>
        </p>

        {classes.length === 0 ? (
          <p className="font-display italic text-sm text-[var(--color-text-secondary)] py-4 text-center">
            You have no classes yet.
          </p>
        ) : (
          <label className="block mb-5">
            <span className="label-mono text-[var(--color-text-secondary)]">Class</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="input-field mt-1"
              aria-label="Select a class"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!classId || saving}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/landmark/AssignToClassModal.tsx
git commit -m "feat(library): AssignToClassModal (class picker + assign)"
```

---

## Task 6: Role-aware `LandmarkLibraryPage` + `/teacher/library` route + nav

**Files:**
- Modify: `frontend/src/pages/student/LandmarkLibraryPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Make the page role-aware and wire the modal**

Replace the entire contents of `frontend/src/pages/student/LandmarkLibraryPage.tsx` with:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { libraryApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import { Search, BookOpen } from "lucide-react";
import LandmarkPaperCard from "../../components/landmark/LandmarkPaperCard";
import AssignToClassModal from "../../components/landmark/AssignToClassModal";
import type { LandmarkPaper } from "../../types/landmark";

export default function LandmarkLibraryPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const [papers, setPapers] = useState<LandmarkPaper[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState<{ paper: LandmarkPaper; difficulty: string } | null>(null);

  // Debounced load on query change (also fires once on mount with empty query).
  useEffect(() => {
    const t = setTimeout(() => {
      load(query.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const load = async (q: string) => {
    setLoading(true);
    try {
      // Sessions are student-scoped (the /sessions/ list is the caller's own).
      // Teachers never start reading here, so skip that fetch for them.
      // NOTE: leave `r.data` untyped — axios infers `any`, which is what makes
      // the `.map((s: { assignment_id: string }) => …)` annotation type-check
      // (matching the proven Phase 1 page). Do not cast it.
      const [res, sessions] = await Promise.all([
        libraryApi.landmarks({ q: q || undefined, limit: 24, offset: 0 }),
        isTeacher ? Promise.resolve([]) : api.get("/sessions/").then((r) => r.data).catch(() => []),
      ]);
      setPapers(res.items);
      setStartedIds(new Set((sessions || []).map((s: { assignment_id: string }) => s.assignment_id)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not load library");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (assignmentId: string) => {
    setStarting(true);
    try {
      await api.post("/sessions/", { assignment_id: assignmentId });
      navigate(`/student/read/${assignmentId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not start reading");
    } finally {
      setStarting(false);
    }
  };

  const handleAssign = (paper: LandmarkPaper, difficulty: string) => {
    setAssignTarget({ paper, difficulty });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="label-mono text-accent">{isTeacher ? "Teacher" : "Student"} · Landmark Library</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Landmark Papers</h1>
        {isTeacher && (
          <p className="mt-2 font-mono text-xs text-[var(--color-text-secondary)]">
            Assign a classic paper to a class — students read the pre-built guide, no AI generation needed.
          </p>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(query.trim()); }} className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search landmark papers..."
            className="input-field pl-9"
            aria-label="Search landmark papers"
          />
        </div>
      </form>

      {loading ? (
        <p className="font-mono text-sm text-[var(--color-text-secondary)]">Loading...</p>
      ) : papers.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-muted-foreground)] p-10 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-muted-foreground)] mx-auto mb-3" strokeWidth={1.25} />
          <p className="font-display italic text-[var(--color-text-secondary)]">No papers found. Try a different search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {papers.map((p) => (
            <LandmarkPaperCard
              key={p.paper_id}
              paper={p}
              role={role ?? undefined}
              startedAssignmentIds={startedIds}
              onStart={handleStart}
              onAssign={handleAssign}
            />
          ))}
        </div>
      )}

      {starting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {assignTarget && (
        <AssignToClassModal
          paper={assignTarget.paper}
          difficulty={assignTarget.difficulty}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the `/teacher/library` route**

In `frontend/src/App.tsx`, add this route inside the teacher-routes block (e.g. immediately after the `/teacher/classes` route line):

```tsx
          <Route path="/teacher/library" element={<RoleRoute allowedRole="teacher"><LandmarkLibraryPage /></RoleRoute>} />
```

`LandmarkLibraryPage` is already imported at the top of `App.tsx`, so no new import is needed.

- [ ] **Step 3: Add the Library nav entry for teachers**

In `frontend/src/components/Layout.tsx`, replace the `TEACHER_LINKS` definition (lines 21–24) with:

```tsx
const TEACHER_LINKS = [
  { to: "/teacher/papers", label: "Papers", icon: FileText },
  { to: "/teacher/classes", label: "Classes", icon: Users },
  { to: "/teacher/library", label: "Library", icon: BookOpen },
];
```

`BookOpen` is already imported from `lucide-react` in `Layout.tsx`, so no new import is needed.

- [ ] **Step 4: Verify the frontend type-checks and builds**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: type-check clean and production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/LandmarkLibraryPage.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(library): role-aware library page + /teacher/library route + nav"
```

---

## Task 7: Teacher landmark E2E + helper mocks

**Files:**
- Modify: `frontend/tests/helpers.js`
- Create: `frontend/tests/landmark-teacher.spec.js`

- [ ] **Step 1: Extend `mockTeacherApiRoutes` with landmark + assign mocks**

In `frontend/tests/helpers.js`, inside `mockTeacherApiRoutes(page)`, add these declarations (e.g. just before the first `page.route(...)` call) so the tests have landmark fixtures and can observe assign payloads:

```js
  const mockLandmarkPapers = {
    items: [
      {
        paper_id: 'lp1',
        title: 'Attention Is All You Need',
        created_at: '2026-06-01',
        levels: [
          { difficulty: 'beginner', assignment_id: 'la1' },
          { difficulty: 'intermediate', assignment_id: 'la2' },
          { difficulty: 'advanced', assignment_id: 'la3' },
        ],
      },
    ],
    has_more: false,
  };
  const mockFeaturedLandmarks = [mockLandmarkPapers.items[0]];
  const assignCalls = [];
```

Then add a new `page.route` for landmark endpoints (place it alongside the other `page.route(...)` blocks, e.g. right after the `assignments` route):

```js
  page.route('**/api/v1/library/landmark**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/library/landmark/featured')) {
      return route.fulfill({ json: mockFeaturedLandmarks });
    }
    if (method === 'POST' && url.includes('/library/landmark/assign')) {
      const body = route.request().postDataJSON();
      assignCalls.push(body);
      return route.fulfill({
        json: {
          assignment_id: 'cls-asn-1',
          class_id: (body && body.class_id) || 'c1',
          paper_id: (body && body.paper_id) || 'lp1',
          difficulty: (body && body.difficulty) || 'intermediate',
          status: 'published',
        },
      });
    }
    if (url.includes('/library/landmark')) {
      return route.fulfill({ json: mockLandmarkPapers });
    }
    return route.fulfill({ json: {} });
  });
```

Finally, extend the function's return object (currently `return { mockPapers, mockClasses, mockAssignment, mockDashboard };`) to also expose the new fixtures:

```js
  return { mockPapers, mockClasses, mockAssignment, mockDashboard, mockLandmarkPapers, assignCalls };
```

- [ ] **Step 2: Create the teacher landmark E2E spec**

Create `frontend/tests/landmark-teacher.spec.js` with:

```js
/**
 * ReadLabs - Teacher Landmark Library (assign-to-class) Tests
 */
const { test, expect } = require('@playwright/test');
const { loginAsTeacher, mockTeacherApiRoutes } = require('./helpers');

test.describe('Teacher - Landmark Library assign', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/library');
    await page.waitForLoadState('networkidle');
  });

  test('shows teacher heading and Assign-to-class action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Landmark Papers' })).toBeVisible();
    await expect(page.getByText('Teacher · Landmark Library')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign to class' }).first()).toBeVisible();
  });

  test('does not show the student-only Start Reading action', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Reading' })).toHaveCount(0);
  });

  test('can pick a level, open the modal, and assign to a class', async ({ page }) => {
    // Pick the advanced level on the card.
    await page.getByRole('button', { name: 'advanced' }).first().click();
    // Open the assign modal.
    await page.getByRole('button', { name: 'Assign to class' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Assign to class' });
    await expect(dialog).toBeVisible();
    // The first class (Biology 101) is auto-selected, so Assign is enabled.
    const assignBtn = dialog.getByRole('button', { name: 'Assign' });
    await expect(assignBtn).toBeEnabled();
    // Confirm the assignment.
    await assignBtn.click();
    // The success toast names the class it assigned to — proves the class list
    // loaded and the POST resolved against the /landmark/assign mock.
    await expect(page.getByText(/Assigned to Biology 101/)).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 3: Run the new teacher E2E spec**

Run: `cd frontend && npx playwright test landmark-teacher.spec.js --project=chromium`
Expected: PASS — all 3 teacher landmark tests green.

- [ ] **Step 4: Run the full Playwright suite to confirm no regressions**

Run: `cd frontend && npx playwright test`
Expected: PASS — all previously-green tests still pass (the student landmark spec included) plus the 3 new teacher tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/helpers.js frontend/tests/landmark-teacher.spec.js
git commit -m "test(library): teacher assign-to-class E2E + landmark mocks"
```

---

## Definition of Done

- [ ] `POST /api/v1/library/landmark/assign` works: validates class ownership (403), landmark-paper status (404), dedups (returns existing), copies the guide + critical_prompts + quiz_questions, returns `AssignLandmarkResponse`. Zero Gemini calls.
- [ ] Backend: `cd backend && python -m pytest -q` all green (21 tests).
- [ ] Teacher can browse `/teacher/library`, pick a level, and assign to a class via the modal.
- [ ] Frontend: `cd frontend && npm run build` clean; `npx playwright test` all green (3 new teacher tests + existing suite).
- [ ] All 7 tasks committed on `feat/landmark-library-seed`; nothing pushed/merged/deployed.
