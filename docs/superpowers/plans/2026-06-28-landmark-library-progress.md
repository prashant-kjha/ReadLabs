# Landmark Library — Phase 3 (Progress & Engagement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a student their reading progress across the landmark library — a "My Progress" summary banner, client-side filter chips (All / Not started / In progress / Completed), and a "Continue reading" CTA that reflects the saved section — backed by one new student endpoint `GET /library/landmark/progress`.

**Architecture:** One new student endpoint resolves the caller's landmark assignment ids in two steps (service-user-owned `papers` → published `assignments` with `class_id IS NULL`), then returns their `student_sessions` rows for exactly those assignments (`status`, `current_section_index`, `completed_at`). The frontend replaces the boolean `startedIds` set with a richer `progressByAssignment` map, derives a per-paper status (`completed > in_progress > not_started` across the paper's started levels), and renders the banner + filters + per-card status/CTA. **No Gemini, no schema migration.**

**Important status-semantics note (read before touching the backend):** Today a `student_sessions` row is only ever created with `status = "in_progress"` (`backend/routers/sessions.py:46`) and nothing in the codebase writes `"completed"` / `completed_at`. That is a *pre-existing* gap, **not** Phase 3's job to fix. This endpoint faithfully returns whatever `status` lives in the DB (spec keystone #2: "progress is derived from existing `student_sessions.status`"). The "Completed" filter therefore works end-to-end (the E2E proves it with mock data) and will populate automatically once a completion path lands. Do **not** add completion-detection (e.g. inferring "completed" from `current_section_index`) — that is out of scope.

**Tech Stack:** FastAPI + custom async PostgREST `QueryBuilder` (`backend/db.py`), Pydantic schemas, pytest (mocked DB); React 19 + TypeScript (strict) + Tailwind + React Router v6, Playwright E2E (mocked API).

**Branch:** `feat/landmark-library-seed` (Phases 1 & 2 live here; Phase 3 extends them). Do not merge/push — work stays on the branch.

**Design spec:** `docs/superpowers/specs/2026-06-26-landmark-library-frontend-design.md` — the `GET /library/landmark/progress` endpoint definition and the "Phase 3 — progress & engagement" section.

---

## File Structure

**Backend (modify):**
- `backend/schemas/library.py` — add `LandmarkProgressItem`, `LandmarkProgressResponse`.
- `backend/routers/library.py` — import the two new schemas; add the `GET /landmark/progress` route.
- `backend/tests/test_library.py` — add 5 `test_progress_*` tests (reuses the existing `make_db` + `_patch_landmark_settings` helpers).

**Frontend (modify):**
- `frontend/src/types/landmark.ts` — add `LandmarkProgressEntry`, `LandmarkProgressResponse`.
- `frontend/src/lib/api.ts` — import the new type; add `libraryApi.getLandmarkProgress()`.
- `frontend/src/components/landmark/LandmarkPaperCard.tsx` — progress-aware status line + CTA label (adds `progressByAssignment` prop; the old `startedAssignmentIds` prop is removed in Task 5).
- `frontend/src/pages/student/LandmarkLibraryPage.tsx` — fetch progress, build the map, render the "My Progress" banner + filter chips, pass `progressByAssignment` to cards (drops the old `startedIds` state).
- `frontend/tests/helpers.js` — expand the student `mockLandmarkPapers` fixture to 3 papers + add a `/library/landmark/progress` mock.
- `frontend/tests/landmark-progress.spec.js` — **create.** Student progress filter/continue E2E.

---

## Task 1: Backend progress response schemas

**Files:**
- Modify: `backend/schemas/library.py`

- [ ] **Step 1: Add the two Pydantic models**

Append to `backend/schemas/library.py` (after `AssignLandmarkResponse`):

```python
class LandmarkProgressItem(BaseModel):
    assignment_id: str
    status: str
    completed_at: str | None = None
    current_section_index: int = 0


class LandmarkProgressResponse(BaseModel):
    progress: list[LandmarkProgressItem]
```

`current_section_index` defaults to `0` and `completed_at` to `None` so a row that omits either still validates. Field names mirror `student_sessions` exactly so the endpoint can construct items from raw DB rows.

- [ ] **Step 2: Verify the module imports cleanly**

Run: `cd backend && python -c "from backend.schemas.library import LandmarkProgressItem, LandmarkProgressResponse; print('ok')"`
Expected: prints `ok` (no ImportError / no validation error). Must run from the repo root (the package is `backend.*`), not from inside `backend/`.

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/library.py
git commit -m "feat(library): landmark-progress response schemas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Backend `GET /library/landmark/progress` endpoint (TDD)

The endpoint's DB-call sequence is load-bearing for the mocked tests. Happy path executes the DB **3 times**, in this order:

1. `papers` select — landmark paper ids (`uploaded_by = landmark_user_id`)
2. `assignments` select — landmark assignment ids (`paper_id IN (...)`, `class_id IS NULL`, `status = published`)
3. `student_sessions` select — the caller's sessions for those assignment ids

Each test feeds `make_db(...)` exactly the rows for its path. The two empty short-circuits (`no paper_ids`, `no landmark_ids`) return early before later executes.

**Files:**
- Modify: `backend/routers/library.py`
- Test: `backend/tests/test_library.py`

- [ ] **Step 1: Write the failing tests**

Append these tests at the end of `backend/tests/test_library.py`. They reuse `make_db` (top of file) and `_patch_landmark_settings` (already defined in the file), and `require_student` / `get_db` (already imported on line 7).

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_library.py -k progress -v`
Expected: FAIL — the tests GET a route that does not exist yet (404), not the asserted statuses.

- [ ] **Step 3: Import the new schemas in the router**

In `backend/routers/library.py`, extend the schema import block (lines 13–24) — add `LandmarkProgressItem` and `LandmarkProgressResponse` to the existing import list. The block becomes:

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
    LandmarkProgressItem,
    LandmarkProgressResponse,
)
```

- [ ] **Step 4: Add the `GET /landmark/progress` route**

Append after the existing `list_landmark_featured` route (group it with the other landmark sub-routes; FastAPI matches the exact static path `/landmark/progress`, so there is no ambiguity with `/landmark` or `/landmark/featured`):

```python
@router.get("/landmark/progress", response_model=LandmarkProgressResponse)
async def landmark_progress(
    user=Depends(require_student),
    db=Depends(get_db),
):
    """The caller's reading status across landmark library assignments
    (status + last section + completion). Powers the browse page's status badges,
    the 'Continue reading' CTA, and the Phase-3 progress summary. Returns only
    sessions whose assignment is a landmark (service-user-owned, class_id IS NULL,
    published) assignment — class assignments are excluded."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        raise HTTPException(status_code=503, detail="Landmark library not configured")

    # PostgREST can't express the papers→assignments join through this query
    # builder, so resolve the landmark assignment ids in two steps.
    papers_res = await db.from_("papers").select("id").eq("uploaded_by", landmark_user).execute()
    paper_ids = [p["id"] for p in (papers_res.data or [])]
    if not paper_ids:
        return LandmarkProgressResponse(progress=[])

    asn_res = await db.from_("assignments").select("id") \
        .in_("paper_id", paper_ids).is_("class_id", "null").eq("status", "published").execute()
    landmark_ids = [a["id"] for a in (asn_res.data or [])]
    if not landmark_ids:
        return LandmarkProgressResponse(progress=[])

    sessions_res = await db.from_("student_sessions") \
        .select("assignment_id, status, current_section_index, completed_at") \
        .eq("student_id", user["sub"]).in_("assignment_id", landmark_ids).execute()

    return LandmarkProgressResponse(
        progress=[LandmarkProgressItem(**row) for row in (sessions_res.data or [])]
    )
```

`LandmarkProgressItem(**row)` is safe: the `select` returns exactly those four columns, Pydantic ignores any extras, and `current_section_index`/`completed_at` fall back to their defaults if a row omits them.

- [ ] **Step 5: Run the progress tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_library.py -k progress -v`
Expected: PASS — all 5 `progress` tests green.

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd backend && python -m pytest -q`
Expected: PASS — all previously-green tests plus the 5 new ones (the prior 116 + 5 = 121).

- [ ] **Step 7: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat(library): GET /library/landmark/progress returns student reading status

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Frontend progress types + API client method

**Files:**
- Modify: `frontend/src/types/landmark.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the progress types**

Append to `frontend/src/types/landmark.ts`:

```ts
export interface LandmarkProgressEntry {
  assignment_id: string;
  status: "not_started" | "in_progress" | "completed";
  current_section_index: number;
  completed_at?: string | null;
}

export interface LandmarkProgressResponse {
  progress: LandmarkProgressEntry[];
}
```

- [ ] **Step 2: Import the response type in the api client**

In `frontend/src/lib/api.ts`, change line 7 from:
```ts
import type { LandmarkLibraryResponse, LandmarkPaper, AssignLandmarkResponse } from "../types/landmark";
```
to:
```ts
import type { LandmarkLibraryResponse, LandmarkPaper, AssignLandmarkResponse, LandmarkProgressResponse } from "../types/landmark";
```

- [ ] **Step 3: Add the `getLandmarkProgress` method**

Inside the `libraryApi` object (after the existing `assignLandmark` entry, before the closing `};`), add:

```ts
  getLandmarkProgress: () =>
    api.get<LandmarkProgressResponse>("/library/landmark/progress").then((r) => r.data),
```

- [ ] **Step 4: Verify the frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. (The card/page still pass the old `startedAssignmentIds` prop, unchanged at this point.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/landmark.ts frontend/src/lib/api.ts
git commit -m "feat(api): libraryApi.getLandmarkProgress client method + types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Progress-aware status + Continue CTA on `LandmarkPaperCard`

This task makes the card **able** to consume the rich progress map. It adds `progressByAssignment` as an optional prop and keeps the existing `startedAssignmentIds` prop as a fallback so the card still compiles against the unchanged page (the page switches over in Task 5). After Task 4 the new status line/labels only appear once a caller passes `progressByAssignment`.

**Files:**
- Modify: `frontend/src/components/landmark/LandmarkPaperCard.tsx`

- [ ] **Step 1: Replace the card with the progress-aware version**

Replace the entire contents of `frontend/src/components/landmark/LandmarkPaperCard.tsx` with:

```tsx
import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { LandmarkPaper, LandmarkProgressEntry } from "../../types/landmark";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "border-border bg-surface-raised text-success",
  intermediate: "border-border bg-surface-raised text-warning",
  advanced: "border-border bg-surface-raised text-danger",
};

interface Props {
  paper: LandmarkPaper;
  role?: string;
  startedAssignmentIds?: Set<string>;
  progressByAssignment?: Map<string, LandmarkProgressEntry>;
  onStart?: (assignmentId: string) => void;
  onAssign?: (paper: LandmarkPaper, difficulty: string) => void;
}

export default function LandmarkPaperCard({ paper, role, startedAssignmentIds, progressByAssignment, onStart, onAssign }: Props) {
  const levels = paper.levels;
  const isTeacher = role === "teacher";
  const defaultDifficulty =
    levels.find((l) => l.difficulty === "intermediate")?.difficulty || levels[0]?.difficulty || "";
  const [selected, setSelected] = useState(defaultDifficulty);
  const selectedLevel = levels.find((l) => l.difficulty === selected) || levels[0];

  // Prefer the rich progress entry (status + section) when the page supplies it;
  // fall back to the boolean "started" set so the card stays usable mid-wiring.
  const entry = selectedLevel ? progressByAssignment?.get(selectedLevel.assignment_id) : undefined;
  const fallbackStarted = Boolean(selectedLevel && startedAssignmentIds?.has(selectedLevel.assignment_id));
  const status: LandmarkProgressEntry["status"] = entry?.status ?? (fallbackStarted ? "in_progress" : "not_started");

  const actionLabel =
    status === "completed" ? "Read again" : status === "in_progress" ? "Continue Reading" : "Start Reading";

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

      {/* Status line for students with progress on the selected level. */}
      {!isTeacher && status !== "not_started" && (
        <p className="font-mono text-[11px] text-[var(--color-text-secondary)] mb-2" data-testid="landmark-card-status">
          {status === "completed"
            ? "Completed"
            : `In progress · section ${(entry?.current_section_index ?? 0) + 1}`}
        </p>
      )}

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
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. The page still passes `startedAssignmentIds` (unchanged); `progressByAssignment` is optional, so behavior is identical until Task 5.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/landmark/LandmarkPaperCard.tsx
git commit -m "feat(library): progress-aware status + Continue CTA on landmark card

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: "My Progress" banner + filter chips on `LandmarkLibraryPage` (and finalize card prop)

This task wires the page to the new progress endpoint, renders the summary banner + filter chips (student only), and switches the card prop from the boolean `startedAssignmentIds` to the rich `progressByAssignment` map. The card's now-unused `startedAssignmentIds` prop is removed in the same commit so no dead prop lingers.

**Files:**
- Modify: `frontend/src/pages/student/LandmarkLibraryPage.tsx`
- Modify: `frontend/src/components/landmark/LandmarkPaperCard.tsx`

- [ ] **Step 1: Replace the page with the progress-aware version**

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
import type { LandmarkPaper, LandmarkProgressEntry } from "../../types/landmark";

type PaperStatus = "not_started" | "in_progress" | "completed";
type Filter = "all" | PaperStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

// A paper's rollup status across its started levels: completed beats in-progress
// beats not-started. (A paper can have a session on one difficulty but not another.)
function paperStatus(paper: LandmarkPaper, progress: Map<string, LandmarkProgressEntry>): PaperStatus {
  const statuses = paper.levels
    .map((l) => progress.get(l.assignment_id)?.status)
    .filter((s): s is LandmarkProgressEntry["status"] => Boolean(s));
  if (statuses.includes("completed")) return "completed";
  if (statuses.includes("in_progress")) return "in_progress";
  return "not_started";
}

export default function LandmarkLibraryPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const [papers, setPapers] = useState<LandmarkPaper[]>([]);
  const [progressByAssignment, setProgressByAssignment] = useState<Map<string, LandmarkProgressEntry>>(new Map());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
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
      // Landmark progress is student-scoped: the endpoint returns only the
      // caller's sessions on landmark assignments. Teachers never read here,
      // so skip the fetch for them.
      const [res, progress] = await Promise.all([
        libraryApi.landmarks({ q: q || undefined, limit: 24, offset: 0 }),
        isTeacher
          ? Promise.resolve({ progress: [] as LandmarkProgressEntry[] })
          : libraryApi.getLandmarkProgress().catch(() => ({ progress: [] as LandmarkProgressEntry[] })),
      ]);
      setPapers(res.items);
      setProgressByAssignment(new Map((progress.progress || []).map((e) => [e.assignment_id, e])));
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

  // Progress summary + filters are student-only (teachers don't read here).
  const showProgress = !isTeacher;
  const startedCount = showProgress
    ? papers.filter((p) => paperStatus(p, progressByAssignment) !== "not_started").length
    : 0;
  const completedCount = showProgress
    ? papers.filter((p) => paperStatus(p, progressByAssignment) === "completed").length
    : 0;
  const visible =
    showProgress && filter !== "all"
      ? papers.filter((p) => paperStatus(p, progressByAssignment) === filter)
      : papers;

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

      {/* My Progress summary + filter chips (student only). */}
      {showProgress && (
        <div className="mb-6">
          <p data-testid="landmark-progress-summary" className="font-mono text-xs text-[var(--color-text-secondary)] mb-2">
            <span className="text-[var(--color-text)] font-semibold">{startedCount}</span> started ·{" "}
            <span className="text-[var(--color-text)] font-semibold">{completedCount}</span> completed
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by progress">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`font-mono text-xs px-3 py-1 rounded-sm border transition-colors ${
                  filter === f.key
                    ? "bg-primary text-[var(--color-primary-foreground)] border-primary"
                    : "border-border bg-surface-raised text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
      ) : visible.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-muted-foreground)] p-10 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-muted-foreground)] mx-auto mb-3" strokeWidth={1.25} />
          <p className="font-display italic text-[var(--color-text-secondary)]">
            {showProgress && filter !== "all" ? "No papers in this category yet." : "No papers found. Try a different search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map((p) => (
            <LandmarkPaperCard
              key={p.paper_id}
              paper={p}
              role={role ?? undefined}
              progressByAssignment={progressByAssignment}
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

- [ ] **Step 2: Remove the now-unused `startedAssignmentIds` prop from the card**

The page no longer passes `startedAssignmentIds`, so drop it from the card. In `frontend/src/components/landmark/LandmarkPaperCard.tsx`:

Change the `Props` interface — remove the `startedAssignmentIds?: Set<string>;` line, leaving:

```tsx
interface Props {
  paper: LandmarkPaper;
  role?: string;
  progressByAssignment?: Map<string, LandmarkProgressEntry>;
  onStart?: (assignmentId: string) => void;
  onAssign?: (paper: LandmarkPaper, difficulty: string) => void;
}
```

Change the function signature (remove `startedAssignmentIds` from the destructure):

```tsx
export default function LandmarkPaperCard({ paper, role, progressByAssignment, onStart, onAssign }: Props) {
```

And replace the `entry` / `fallbackStarted` / `status` derivation (the fallback is no longer needed):

```tsx
  const entry = selectedLevel ? progressByAssignment?.get(selectedLevel.assignment_id) : undefined;
  const status: LandmarkProgressEntry["status"] = entry?.status ?? "not_started";
```

(Leave the `actionLabel`, the status `<p>`, and the buttons exactly as they are.)

- [ ] **Step 3: Verify the frontend type-checks and builds**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: type-check clean and production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/student/LandmarkLibraryPage.tsx frontend/src/components/landmark/LandmarkPaperCard.tsx
git commit -m "feat(library): My Progress banner + filter chips on library page

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Student progress E2E + helper mocks

Expands the shared student landmark fixture to 3 papers (one each: in-progress, completed, not-started) and adds a `/library/landmark/progress` mock, then adds an E2E that exercises the summary counts, all four filter chips, and the Continue-reading status line.

**Files:**
- Modify: `frontend/tests/helpers.js`
- Create: `frontend/tests/landmark-progress.spec.js`

- [ ] **Step 1: Expand the student landmark fixture + add the progress mock**

In `frontend/tests/helpers.js`, inside `mockStudentApiRoutes(page)`, replace the existing `mockLandmarkPapers` / `mockFeaturedLandmarks` block (currently a single `lp1` paper) with a 3-paper fixture plus a progress payload:

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
      {
        paper_id: 'lp2',
        title: 'Deep Residual Learning for Image Recognition',
        created_at: '2026-06-02',
        levels: [{ difficulty: 'intermediate', assignment_id: 'lb1' }],
      },
      {
        paper_id: 'lp3',
        title: 'Generative Adversarial Networks',
        created_at: '2026-06-03',
        levels: [{ difficulty: 'beginner', assignment_id: 'lc1' }],
      },
    ],
    has_more: false,
  };
  const mockFeaturedLandmarks = [mockLandmarkPapers.items[0]];
  const mockLandmarkProgress = {
    progress: [
      { assignment_id: 'la2', status: 'in_progress', current_section_index: 1, completed_at: null },
      { assignment_id: 'lb1', status: 'completed', current_section_index: 2, completed_at: '2026-06-20' },
    ],
  };
```

So `lp1` (intermediate `la2`) is **in progress**, `lp2` (`lb1`) is **completed**, and `lp3` (`lc1`) is **not started**.

- [ ] **Step 2: Serve the progress mock from the library route handler**

In the same `mockStudentApiRoutes(page)`, find the `page.route('**/api/v1/library/**', ...)` handler. Insert a `progress` branch **after** the `featured` check and **before** the generic `/library/landmark` check (order matters — the generic `includes('/library/landmark')` would otherwise swallow it). The handler becomes:

```js
  page.route('**/api/v1/library/**', (route) => {
    const url = route.request().url();
    if (url.includes('/library/landmark/featured')) {
      return route.fulfill({ json: mockFeaturedLandmarks });
    }
    if (url.includes('/library/landmark/progress')) {
      return route.fulfill({ json: mockLandmarkProgress });
    }
    if (url.includes('/library/landmark')) {
      return route.fulfill({ json: mockLandmarkPapers });
    }
    if (url.includes('/library/browse')) {
      return route.fulfill({ json: mockLibraryPapers });
    }
    if (url.includes('/library/categories')) {
      return route.fulfill({ json: mockCategories });
    }
    if (url.includes('/library/search')) {
      return route.fulfill({ json: [{ core_id: 'core1', title: 'Search Result Paper', authors: 'Search Author' }] });
    }
    return route.fulfill({ json: {} });
  });
```

- [ ] **Step 3: Expose the new fixture from the helper**

Extend the function's return object (currently `return { mockEnrolledClasses, mockSessions, mockSession, mockLibraryPapers, mockLandmarkPapers, mockStats };`) to also expose `mockLandmarkProgress`:

```js
  return { mockEnrolledClasses, mockSessions, mockSession, mockLibraryPapers, mockLandmarkPapers, mockLandmarkProgress, mockStats };
```

- [ ] **Step 4: Create the student progress E2E spec**

Create `frontend/tests/landmark-progress.spec.js` with:

```js
/**
 * ReadLabs - Student Landmark Library Progress (Phase 3) Tests
 */
const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes } = require('./helpers');

test.describe('Student - Landmark Library progress', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/library');
    await page.waitForLoadState('networkidle');
  });

  test('shows the My Progress summary counts over the loaded set', async ({ page }) => {
    // lp1 in progress + lp2 completed = 2 started; lp2 = 1 completed.
    const summary = page.getByTestId('landmark-progress-summary');
    await expect(summary).toContainText('2 started');
    await expect(summary).toContainText('1 completed');
  });

  test('shows all three papers by default', async ({ page }) => {
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(3);
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
    await expect(page.getByText('Deep Residual Learning for Image Recognition')).toBeVisible();
    await expect(page.getByText('Generative Adversarial Networks')).toBeVisible();
  });

  test('the In-progress filter shows only the in-progress paper with a Continue CTA', async ({ page }) => {
    await page.getByRole('button', { name: 'In progress' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
    // current_section_index 1 → resume label "section 2".
    await expect(page.getByTestId('landmark-card-status')).toContainText('In progress · section 2');
    await expect(page.getByRole('button', { name: 'Continue Reading' })).toBeVisible();
  });

  test('the Completed filter shows only the completed paper', async ({ page }) => {
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await expect(page.getByText('Deep Residual Learning for Image Recognition')).toBeVisible();
  });

  test('the Not-started filter shows only the not-started paper', async ({ page }) => {
    await page.getByRole('button', { name: 'Not started' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await expect(page.getByText('Generative Adversarial Networks')).toBeVisible();
  });

  test('All restores the full set after filtering', async ({ page }) => {
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await page.getByRole('button', { name: 'All' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(3);
  });
});
```

- [ ] **Step 5: Run the new progress E2E spec**

Run: `cd frontend && npx playwright test landmark-progress.spec.js --project=chromium`
Expected: PASS — all 6 progress tests green.

- [ ] **Step 6: Run the full Playwright suite to confirm no regressions**

Run: `cd frontend && npx playwright test`
Expected: PASS — all previously-green tests still pass (the Phase-1 `landmark.spec.js` and the dashboard featured tests included) plus the 6 new progress tests. (`landmark.spec.js` still passes because it asserts presence not counts, and `lp3` keeps a "Start Reading" button.)

- [ ] **Step 7: Commit**

```bash
git add frontend/tests/helpers.js frontend/tests/landmark-progress.spec.js
git commit -m "test(library): student progress filters + continue-reading E2E

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Definition of Done

- [ ] `GET /api/v1/library/landmark/progress` works: 401 unauth, 503 when unconfigured, returns the caller's `student_sessions` for landmark assignments only (`status`, `current_section_index`, `completed_at`). Zero Gemini calls.
- [ ] Backend: `cd backend && python -m pytest -q` all green (121 tests).
- [ ] Student sees a "My Progress" banner ("X started · Y completed") + All / Not started / In progress / Completed filter chips on `/student/library`; in-progress papers show a "Continue Reading" CTA with a "section N" status line.
- [ ] Teachers see no banner/filters (unchanged `/teacher/library`).
- [ ] Frontend: `cd frontend && npm run build` clean; `cd frontend && npx playwright test` all green (6 new progress tests + existing suite).
- [ ] All 6 tasks committed on `feat/landmark-library-seed`; nothing pushed/merged/deployed.

## Out of scope (intentionally deferred)

- **Completion detection.** Surfacing "Completed" relies on a `student_sessions.status = "completed"` row that nothing writes yet. The endpoint + filter are forward-compatible; wiring a completion path is a separate feature.
- **Optional dashboard `reading_stats` surface.** The spec marks this optional; the dashboard already shows streak/XP/level via the existing `StreakWidget`. Not added here to keep Phase 3 focused.
