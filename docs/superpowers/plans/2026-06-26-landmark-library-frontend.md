# Landmark Library Frontend — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students browse the seeded 149-paper landmark library, pick a difficulty level, and start reading the pre-generated guide — plus a featured-papers widget on the student dashboard.

**Architecture:** Three new read-only backend endpoints on the existing `/library` router expose the service-user-owned landmark papers (list with search/paging, featured set). A new `LandmarkLibraryPage` renders a card grid with a level selector; "Start Reading" reuses the existing `POST /sessions/` → `/student/read/{id}` flow. A dashboard widget surfaces curated icons. No Gemini calls, no schema migration. Status dots reuse the existing `GET /sessions/` endpoint.

**Tech Stack:** FastAPI + Pydantic (backend), React 19 + TypeScript + Tailwind + React Router v6 (frontend), pytest (backend), Playwright (frontend E2E).

**Phases:** This is **Phase 1** (student browse + read + featured). Phase 2 (teacher assign-to-class) and Phase 3 (progress summary/filters) are separate follow-on plans.

**Deviations from the design spec (justified):**
- `has_more: bool` instead of `total: int` — the `QueryBuilder` has no count support; `has_more` is what "Load more" needs and is derived by fetching `limit+1` rows.
- Reuse `GET /sessions/` for card status dots instead of a new `/library/landmark/progress` endpoint — `/sessions/` already returns the student's sessions; the dedicated progress endpoint moves to Phase 3 (where landmark-scoped summary counts need it).
- Adds `ilike()` and `offset()` methods to `QueryBuilder` (`backend/db.py`) — PostgREST supports both; the builder just doesn't expose them yet.
- Route is `/student/library` (student-only) rather than a shared `/library` — `RoleRoute` is single-role; the teacher route (`/teacher/library`) comes in Phase 2.

---

## File Structure

**Backend:**
- `backend/db.py` — add `ilike()` and `offset()` to `QueryBuilder` (Task 1).
- `backend/schemas/library.py` — add `LandmarkLevel`, `LandmarkPaper`, `LandmarkLibraryResponse` (Task 2).
- `backend/routers/library.py` — add `_landmark_papers_with_levels()` helper, `GET /landmark`, `GET /landmark/featured`, `LANDMARK_FEATURED_TITLES` constant (Tasks 2–3).
- `backend/tests/test_db.py` — extend with ilike/offset test (Task 1).
- `backend/tests/test_library.py` — extend `make_db` + add endpoint tests (Tasks 2–3).

**Frontend:**
- `frontend/src/types/landmark.ts` — `LandmarkLevel`, `LandmarkPaper`, `LandmarkLibraryResponse` types (Task 4).
- `frontend/src/lib/api.ts` — add `libraryApi.landmarks(...)` and `libraryApi.featuredLandmarks()` (Task 4).
- `frontend/src/components/landmark/LandmarkPaperCard.tsx` — card with level selector + Start (Task 5).
- `frontend/src/pages/student/LandmarkLibraryPage.tsx` — browse page (Task 5).
- `frontend/src/App.tsx` — register `/student/library` route (Task 5).
- `frontend/src/components/Layout.tsx` — add "Library" student nav link (Task 5).
- `frontend/src/pages/student/StudentDashboardPage.tsx` — add featured widget (Task 6).
- `frontend/tests/helpers.js` — add `/library/landmark*` mocks (Task 5).
- `frontend/tests/landmark.spec.js` — new E2E suite (Task 5); dashboard assertions added to `student.spec.js` (Task 6).

---

## Task 1: Add `ilike` and `offset` to QueryBuilder

**Files:**
- Modify: `backend/db.py` (inside `QueryBuilder`, after the `limit` method ~line 83)
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_db.py`:

```python
from backend.db import QueryBuilder


def test_querybuilder_ilike_and_offset_set_params():
    q = QueryBuilder("papers")
    q.select("*").eq("uploaded_by", "u1").ilike("title", "%attn%").order("created_at", desc=True).limit(10).offset(20)
    assert q._params["uploaded_by"] == "eq.u1"
    assert q._params["title"] == "ilike.%attn%"
    assert q._params["order"] == "created_at.desc"
    assert q._params["limit"] == "10"
    assert q._params["offset"] == "20"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_db.py::test_querybuilder_ilike_and_offset_set_params -v`
Expected: FAIL with `AttributeError: 'QueryBuilder' object has no attribute 'ilike'`

- [ ] **Step 3: Implement `ilike` and `offset`**

In `backend/db.py`, add these two methods to `QueryBuilder` immediately after the `limit` method (after line 83):

```python
    def ilike(self, column: str, value: str) -> "QueryBuilder":
        """PostgREST case-insensitive LIKE: column=ilike.<value>."""
        self._params[column] = f"ilike.{value}"
        return self

    def offset(self, n: int) -> "QueryBuilder":
        self._params["offset"] = str(n)
        return self
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_db.py::test_querybuilder_ilike_and_offset_set_params -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/db.py backend/tests/test_db.py
git commit -m "feat(db): expose ilike and offset on QueryBuilder"
```

---

## Task 2: `GET /library/landmark` endpoint + schemas + helper

**Files:**
- Modify: `backend/schemas/library.py`
- Modify: `backend/routers/library.py`
- Test: `backend/tests/test_library.py`

- [ ] **Step 1: Add Pydantic schemas**

Append to `backend/schemas/library.py`:

```python
class LandmarkLevel(BaseModel):
    difficulty: str
    assignment_id: str


class LandmarkPaper(BaseModel):
    paper_id: str
    title: str
    created_at: str | None = None
    levels: list[LandmarkLevel] = []


class LandmarkLibraryResponse(BaseModel):
    items: list[LandmarkPaper]
    has_more: bool
```

- [ ] **Step 2: Extend `make_db` in the test file with the new chain methods**

In `backend/tests/test_library.py`, find the `make_db` function's `for attr in [...]` line (line 24) and add `ilike`, `is_`, `offset` so it reads:

```python
    for attr in ["from_", "select", "insert", "update", "upsert", "eq", "in_", "ilike", "is_", "single", "maybe_single", "order", "limit", "offset"]:
```

- [ ] **Step 3: Write the failing test**

Append to `backend/tests/test_library.py`:

```python
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


def test_list_landmark_requires_auth():
    app.dependency_overrides.clear()
    response = client.get("/api/v1/library/landmark")
    assert response.status_code == 401
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_library.py::test_list_landmark_returns_papers_with_levels tests/test_library.py::test_list_landmark_requires_auth -v`
Expected: FAIL (404 — route not defined)

- [ ] **Step 5: Implement the helper + endpoint**

In `backend/routers/library.py`:

(a) Update the schema import (line 13) to include the new models:

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
)
```

(b) After the `MAX_PDF_BYTES = 20 * 1024 * 1024` line (line 24), add the difficulty ordering helper and a shared levels-attachment helper:

```python
LANDMARK_PAGE_SIZE = 24
_DIFFICULTY_ORDER = ["beginner", "intermediate", "advanced"]


def _difficulty_rank(difficulty: str | None) -> int:
    return _DIFFICULTY_ORDER.index(difficulty) if difficulty in _DIFFICULTY_ORDER else 99


async def _landmark_papers_with_levels(db, papers: list[dict]) -> list[LandmarkPaper]:
    """Attach each paper's published landmark (class_id IS NULL) difficulty levels,
    sorted beginner → advanced. Shared by the list and featured endpoints."""
    paper_ids = [p["id"] for p in papers]
    levels_by_paper: dict[str, list[dict]] = {pid: [] for pid in paper_ids}
    if paper_ids:
        asn_res = await db.from_("assignments").select("id, paper_id, difficulty") \
            .in_("paper_id", paper_ids).eq("status", "published").is_("class_id", "null").execute()
        for a in (asn_res.data or []):
            levels_by_paper.setdefault(a["paper_id"], []).append(
                {"difficulty": a["difficulty"], "assignment_id": a["id"]}
            )
    return [
        LandmarkPaper(
            paper_id=p["id"],
            title=p["title"],
            created_at=p.get("created_at"),
            levels=sorted(
                levels_by_paper.get(p["id"], []),
                key=lambda lvl: _difficulty_rank(lvl["difficulty"]),
            ),
        )
        for p in papers
    ]
```

(c) Add the endpoint at the end of the file (before the `/categories` removal comment). Note `require_student`, `get_db`, `get_settings`, `HTTPException` are already imported:

```python
@router.get("/landmark", response_model=LandmarkLibraryResponse)
async def list_landmark(
    q: str = "",
    sort: str = "created",
    limit: int = LANDMARK_PAGE_SIZE,
    offset: int = 0,
    user=Depends(require_student),
    db=Depends(get_db),
):
    """Browse the curated landmark library (service-user-owned papers) with the
    available difficulty level for each. Search is case-insensitive title ilike."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        raise HTTPException(status_code=503, detail="Landmark library not configured")

    limit = max(1, min(int(limit), 50))
    offset = max(0, int(offset))

    papers_q = db.from_("papers").select("id, title, created_at").eq("uploaded_by", landmark_user)
    if q.strip():
        papers_q = papers_q.ilike("title", f"%{q.strip()}%")
    if sort == "title":
        papers_q = papers_q.order("title", desc=False)
    else:
        papers_q = papers_q.order("created_at", desc=True)
    papers_res = await papers_q.limit(limit + 1).offset(offset).execute()
    rows = papers_res.data or []
    has_more = len(rows) > limit
    papers = rows[:limit]

    items = await _landmark_papers_with_levels(db, papers)
    return LandmarkLibraryResponse(items=items, has_more=has_more)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_library.py::test_list_landmark_returns_papers_with_levels tests/test_library.py::test_list_landmark_requires_auth -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/schemas/library.py backend/routers/library.py backend/tests/test_library.py
git commit -m "feat(library): GET /library/landmark browse endpoint"
```

---

## Task 3: `GET /library/landmark/featured` endpoint

**Files:**
- Modify: `backend/routers/library.py`
- Test: `backend/tests/test_library.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_library.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_library.py::test_list_landmark_featured_returns_curated -v`
Expected: FAIL (404 — route not defined)

- [ ] **Step 3: Implement the featured constant + endpoint**

In `backend/routers/library.py`, add the constant near `LANDMARK_PAGE_SIZE`:

```python
LANDMARK_FEATURED_TITLES = [
    "Attention Is All You Need",
    "Deep Residual Learning for Image Recognition",
    "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
    "Generative Adversarial Networks",
    "Denoising Diffusion Probabilistic Models",
    "Playing Atari with Deep Reinforcement Learning",
]
```

Add the endpoint at the end of the file (before the `/categories` comment):

```python
@router.get("/landmark/featured", response_model=list[LandmarkPaper])
async def list_landmark_featured(
    user=Depends(require_student),
    db=Depends(get_db),
):
    """A small curated set of iconic landmark papers for the dashboard widget."""
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        return []
    papers_res = await db.from_("papers").select("id, title, created_at") \
        .eq("uploaded_by", landmark_user).in_("title", LANDMARK_FEATURED_TITLES).execute()
    papers = papers_res.data or []
    return await _landmark_papers_with_levels(db, papers)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_library.py::test_list_landmark_featured_returns_curated -v`
Expected: PASS

- [ ] **Step 5: Run the full library test file to confirm no regressions**

Run: `cd backend && python -m pytest tests/test_library.py -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routers/library.py backend/tests/test_library.py
git commit -m "feat(library): GET /library/landmark/featured endpoint"
```

---

## Task 4: Frontend API client methods + types

**Files:**
- Create: `frontend/src/types/landmark.ts`
- Modify: `frontend/src/lib/api.ts` (add to `libraryApi`, ~line 223)

- [ ] **Step 1: Create the types file**

Create `frontend/src/types/landmark.ts`:

```typescript
export interface LandmarkLevel {
  difficulty: string;
  assignment_id: string;
}

export interface LandmarkPaper {
  paper_id: string;
  title: string;
  created_at?: string;
  levels: LandmarkLevel[];
}

export interface LandmarkLibraryResponse {
  items: LandmarkPaper[];
  has_more: boolean;
}
```

- [ ] **Step 2: Add the API client methods**

In `frontend/src/lib/api.ts`, add an import at the top (after the other type imports near line 6):

```typescript
import type { LandmarkLibraryResponse, LandmarkPaper } from "../types/landmark";
```

Then add two methods inside the `libraryApi` object (after the `fetchCore` method, before the closing brace ~line 239):

```typescript
  landmarks: (params?: { q?: string; sort?: string; limit?: number; offset?: number }) =>
    api.get<LandmarkLibraryResponse>("/library/landmark", { params }).then((r) => r.data),
  featuredLandmarks: () =>
    api.get<LandmarkPaper[]>("/library/landmark/featured").then((r) => r.data),
```

- [ ] **Step 3: Type-check the build**

Run: `cd frontend && npm run build`
Expected: completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/landmark.ts frontend/src/lib/api.ts
git commit -m "feat(api): landmark library client methods + types"
```

---

## Task 5: `LandmarkLibraryPage` + card + route + nav + E2E

**Files:**
- Create: `frontend/src/components/landmark/LandmarkPaperCard.tsx`
- Create: `frontend/src/pages/student/LandmarkLibraryPage.tsx`
- Modify: `frontend/src/App.tsx` (imports + one route)
- Modify: `frontend/src/components/Layout.tsx` (BookOpen import + one nav link)
- Modify: `frontend/tests/helpers.js` (add landmark mocks)
- Create: `frontend/tests/landmark.spec.js`

- [ ] **Step 1: Extend the Playwright helpers with landmark mocks**

In `frontend/tests/helpers.js`, inside `mockStudentApiRoutes`, add the mock data near the other `mock*` declarations (e.g. after `mockLibraryPapers` ~line 258):

```javascript
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
```

Then, inside the `page.route('**/api/v1/library/**', ...)` handler (line 305), add these two branches **before** the existing `/library/browse` branch (order matters — `/featured` must be checked before the bare `/landmark`):

```javascript
    if (url.includes('/library/landmark/featured')) {
      return route.fulfill({ json: mockFeaturedLandmarks });
    }
    if (url.includes('/library/landmark')) {
      return route.fulfill({ json: mockLandmarkPapers });
    }
```

Also add `mockLandmarkPapers` to the function's return object (line 357) so tests can reference it.

- [ ] **Step 2: Write the failing E2E test**

Create `frontend/tests/landmark.spec.js`:

```javascript
/**
 * ReadLabs - Landmark Library Page Tests
 */
const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes } = require('./helpers');

test.describe('Student - Landmark Library Page', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/library');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Landmark Papers' })).toBeVisible();
  });

  test('displays landmark papers', async ({ page }) => {
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
  });

  test('shows level selector pills', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'intermediate' }).first()).toBeVisible();
  });

  test('has Start Reading button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Reading' }).first()).toBeVisible();
  });

  test('can search papers', async ({ page }) => {
    await page.getByPlaceholder('Search landmark papers...').fill('attention');
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
  });

  test('clicking Start Reading navigates to reading page', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Reading' }).first().click();
    await expect(page).toHaveURL(/\/student\/read\//);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx playwright test landmark.spec.js --project=chromium`
Expected: FAIL (navigation to `/student/library` shows the catch-all redirect — page not registered yet)

- [ ] **Step 4: Implement `LandmarkPaperCard`**

Create `frontend/src/components/landmark/LandmarkPaperCard.tsx`:

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
  startedAssignmentIds?: Set<string>;
  onStart: (assignmentId: string) => void;
}

export default function LandmarkPaperCard({ paper, startedAssignmentIds, onStart }: Props) {
  const levels = paper.levels;
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
      <button
        type="button"
        onClick={() => selectedLevel && onStart(selectedLevel.assignment_id)}
        disabled={!selectedLevel}
        className="btn-primary w-full mt-auto text-sm disabled:opacity-50"
      >
        {started ? "Continue Reading" : "Start Reading"}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `LandmarkLibraryPage`**

Create `frontend/src/pages/student/LandmarkLibraryPage.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { libraryApi } from "../../lib/api";
import toast from "react-hot-toast";
import { Search, BookOpen } from "lucide-react";
import LandmarkPaperCard from "../../components/landmark/LandmarkPaperCard";
import type { LandmarkPaper } from "../../types/landmark";

export default function LandmarkLibraryPage() {
  const navigate = useNavigate();
  const [papers, setPapers] = useState<LandmarkPaper[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());

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
      const [res, sessions] = await Promise.all([
        libraryApi.landmarks({ q: q || undefined, limit: 24, offset: 0 }),
        api.get("/sessions/").then((r) => r.data).catch(() => []),
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

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="label-mono text-accent">Student · Landmark Library</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Landmark Papers</h1>
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
            <LandmarkPaperCard key={p.paper_id} paper={p} startedAssignmentIds={startedIds} onStart={handleStart} />
          ))}
        </div>
      )}

      {starting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Register the route**

In `frontend/src/App.tsx`, add the import (after the `SelfStudyPage` import, line 20):

```tsx
import LandmarkLibraryPage from "./pages/student/LandmarkLibraryPage";
```

Add the route inside the Student routes block (after the `/student/self-study` route, line 53):

```tsx
          <Route path="/student/library" element={<RoleRoute allowedRole="student"><LandmarkLibraryPage /></RoleRoute>} />
```

- [ ] **Step 7: Add the nav link**

In `frontend/src/components/Layout.tsx`, add `BookOpen` to the lucide-react import (line 7–18 import block):

```tsx
  BookOpen,
```

And add the link to `STUDENT_LINKS` (line 25):

```tsx
const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/self-study", label: "Self-Study", icon: Search },
  { to: "/student/library", label: "Library", icon: BookOpen },
];
```

- [ ] **Step 8: Run the E2E test to verify it passes**

Run: `cd frontend && npx playwright test landmark.spec.js --project=chromium`
Expected: all 6 tests PASS

- [ ] **Step 9: Run the full student suite to confirm no regressions**

Run: `cd frontend && npx playwright test student.spec.js --project=chromium`
Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/landmark/LandmarkPaperCard.tsx \
        frontend/src/pages/student/LandmarkLibraryPage.tsx \
        frontend/src/App.tsx frontend/src/components/Layout.tsx \
        frontend/tests/helpers.js frontend/tests/landmark.spec.js
git commit -m "feat(library): student Landmark Library page + nav + E2E"
```

---

## Task 6: Featured-papers widget on the student dashboard

**Files:**
- Modify: `frontend/src/pages/student/StudentDashboardPage.tsx`
- Modify: `frontend/tests/student.spec.js` (add assertions)

- [ ] **Step 1: Write the failing test**

In `frontend/tests/student.spec.js`, add a new `test.describe` block at the end of the file:

```javascript
test.describe('Student - Landmark Featured Widget', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('shows the featured landmark section', async ({ page }) => {
    await expect(page.getByText('Start with a classic')).toBeVisible();
  });

  test('shows a featured paper', async ({ page }) => {
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx playwright test student.spec.js -g "Landmark Featured Widget" --project=chromium`
Expected: FAIL ("Start with a classic" not found)

- [ ] **Step 3: Implement the widget**

In `frontend/src/pages/student/StudentDashboardPage.tsx`:

(a) Add imports at the top (after line 5):

```tsx
import { libraryApi } from "../../lib/api";
import type { LandmarkPaper } from "../../types/landmark";
```

(b) Add state inside the component (after the `sessions` state, line 40):

```tsx
  const [featured, setFeatured] = useState<LandmarkPaper[]>([]);
```

(c) Extend `loadData` (line 51) to fetch featured landmarks alongside the existing calls:

```tsx
  const loadData = async () => {
    try {
      const [classRes, sessionRes, featuredRes] = await Promise.all([
        api.get("/enrollment/classes"),
        api.get("/sessions/"),
        libraryApi.featuredLandmarks().catch(() => []),
      ]);
      setClasses(classRes.data);
      setSessions(sessionRes.data);
      setFeatured(featuredRes);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };
```

(d) Add a start handler (after `getSessionLabel`, ~line 90):

```tsx
  const handleStartFeatured = async (assignmentId: string) => {
    try {
      await api.post("/sessions/", { assignment_id: assignmentId });
      navigate(`/student/read/${assignmentId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not start reading");
    }
  };
```

(e) Render the widget. Insert this block **immediately after the header `</div>` that closes the "My Classes" title + Join button** (i.e. right after line 108, before the `{/* Join modal */}` comment):

```tsx
      {featured.length > 0 && (
        <div className="mb-8">
          <h2 className="label-mono text-accent mb-3">Start with a classic</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {featured.map((p) => {
              const lvl = p.levels.find((l) => l.difficulty === "intermediate") || p.levels[0];
              return (
                <div key={p.paper_id} className="card-print p-4 shrink-0 w-64 flex flex-col" data-testid="featured-landmark-card">
                  <p className="font-display text-sm font-semibold leading-snug text-[var(--color-text)] mb-3 flex-1">{p.title}</p>
                  <button
                    type="button"
                    onClick={() => lvl && handleStartFeatured(lvl.assignment_id)}
                    disabled={!lvl}
                    className="btn-accent text-xs disabled:opacity-50"
                  >
                    Start Reading
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx playwright test student.spec.js -g "Landmark Featured Widget" --project=chromium`
Expected: PASS

- [ ] **Step 5: Run the full student suite to confirm no regressions**

Run: `cd frontend && npx playwright test student.spec.js --project=chromium`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/StudentDashboardPage.tsx frontend/tests/student.spec.js
git commit -m "feat(library): featured landmark widget on student dashboard"
```

---

## Final verification

- [ ] **Backend:** `cd backend && python -m pytest tests/test_library.py tests/test_db.py -v` — all PASS.
- [ ] **Frontend build:** `cd frontend && npm run build` — no TS errors.
- [ ] **Frontend E2E:** `cd frontend && npx playwright test landmark.spec.js student.spec.js --project=chromium` — all PASS.
- [ ] **Manual smoke (optional):** run both servers (`cd backend && uvicorn main:app --reload` + `cd frontend && npm run dev`), log in as a student, open `/student/library`, pick a level, Start Reading, and confirm the dashboard widget appears.

## After Phase 1

Phase 2 (teacher assign-to-class: `POST /library/landmark/assign` + `/teacher/library` route + Assign modal on the card) and Phase 3 (progress summary/filters + the landmark-scoped `/library/landmark/progress` endpoint) are separate follow-on plans, each producing working software on its own.
