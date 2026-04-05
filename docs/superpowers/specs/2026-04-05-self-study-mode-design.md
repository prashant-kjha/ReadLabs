# Self-Study Mode Design

> **Status:** Approved 2026-04-05
> **Author:** Claude (from brainstorming session)

## Overview

Add self-study capability to ReadLabAI. Any authenticated user (currently student role only) can upload a paper PDF or search the community paper library ( and read it paper independently — without needing a teacher or class, or or class assignment. Reading guides is are AI and Gemini are auto-generated reading guides.

## Key Decisions

- Keep teacher/student roles as-is
- Community library with shared reading guides, private progress/responses
- Categorized tabs + search for for library browsing
- Full Socratic reading journey with optional checkpoint submission
- CORE API title verification to ensure search results match

## Architecture

Approach A: Self-study alongside classroom. Reuse existing tables and minimal schema changes. No new tables.

---

## Data Model

### Papers table — add columns

```sql
ALTER TABLE papers ADD COLUMN is_self_study boolean NOT NULL DEFAULT false;
ALTER TABLE papers ADD COLUMN category text;
ALTER TABLE papers ADD COLUMN core_id text;
ALTER TABLE papers ADD COLUMN authors text;
ALTER TABLE papers ADD COLUMN year_published int;
ALTER TABLE papers ADD COLUMN source text NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'core_api'));

CREATE UNIQUE INDEX idx_papers_core_id ON papers(core_id) WHERE core_id IS NOT NULL;
```

- `is_self_study` — true for community library papers, false for teacher classroom papers
- `category` — e.g. "Biology", "Computer Science", "Medicine". Set by AI during guide generation or by user on upload.
- `core_id` — CORE API record identifier for deduplication
- `authors` — author string from CORE metadata or empty for uploads
- `year_published` — publication year from CORE or null for uploads
- `source` — "upload" (user-uploaded PDF) or "core_api" (fetched from CORE)

### Assignments table — make class_id nullable

```sql
ALTER TABLE assignments ALTER COLUMN class_id DROP NOT NULL;
```

Self-study assignments have `class_id = null`. They are auto-published (skip draft/review). No teacher is involved.

### No New tables

Self-study sessions reuse `student_sessions` (session has `assignment_id`, no class needed).
Checkpoints reuse `checkpoint_responses`. So What reuses `sowhat_responses`.
All existing reading infrastructure works unchanged.

---

## CORE API Integration

### CORE API service: `backend/services/core_api.py`

```python
import httpx
from backend.config import get_settings

CORE_SEARCH_URL = "https://api.core.ac.uk/v3/search/{query}/works"
CORE_FETCH_URL = "https://api.core.ac.uk/v3/data-records/"


def title_similarity(title_a: str, title_b: str) -> float:
    """
    Compute similarity between two titles using Jaccard similarity on word tokens.
    Returns 0.0-1.0 where 1.0 is identical.
    """
    tokens_a = set(title_a.lower().split())
    tokens_b = set(title_b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


```

### Search flow

1. User searches (e.g. "transformer attention mechanism")
2. Backend calls CORE search API, gets up to 20 results
3. **Title relevance filter:** For each result, compute `title_similarity(query, result_title)` using Jaccard similarity on word tokens. Discard results below 0.3 threshold.
4. Return only verified results to frontend

### Fetch flow (when user clicks a paper to fetch full text)

1. Fetch full metadata from CORE by `core_id`
2. **Title confirmation:** Compare fresh CORE metadata title against the title the user selected from search results. If similarity < 0.7, reject with error.
3. Store paper with `source='core_api'`, `is_self_study=true`
4. Create assignment with `class_id=null`, `status='processing'`
5. Trigger background task: `generate_reading_guide`
6. On completion, background task sets assignment `status='published'` (skip draft)
7. Return `{ "assignment_id": "...", "status": "processing" }

---

## Library Router: `backend/routers/library.py`

Endpoints:

- `GET /library/search?qquery&category` — search CORE API
- `GET /library/browse?category` — list papers by category
- `POST /library/upload` — student uploads PDF
- `POST /library/fetch` — fetch CORE paper and create assignment

- `GET /library/papers/{paper_id}` — paper details

- `GET /library/categories` — list available categories

- `GET /library/status/{assignment_id}` — poll reading guide status

- `POST /library/{assignment_id}/start` — start reading session (self-study)

---

## Reading Experience

Reuse `ReadingPage` with one new prop:

```jsx
<ReadingPage optionalCheckpoints={true} />
```

### Optional checkpoint behavior

- Checkpoint textarea and Submit button still appear
- New "Skip" button appears next to Submit, advances to next section without writing
- After skipping, section is marked "Skipped" in the sidebar (not "Complete")
- AI feedback is not generated for skipped sections
- Student can go back to a skipped section and submit a response later
- "So What?" also has Skip option

### Self-study session flow

1. Student clicks "Start Reading" on a library paper
2. Frontend calls `POST /sessions/` with the assignment_id`
3. Session created (same as classroom — no changes needed)
4. Student reads through sections with optional checkpoints
5. Progress tracked in `student_sessions` as usual

---

## Frontend Changes

### New page: `frontend/src/pages/student/SelfStudyPage.jsx`

Community library page:

- Header: "Paper Library" with search bar
- Category tabs: horizontal scrollable (All, Biology, Computer Science, Medicine, Physics, etc.)
- Paper cards grid (2 columns): title, authors, year, difficulty badge, category badge
- "Already in library" indicator with reading guide status
- Click -> starts reading session -> navigates to `/student/read/{assignmentId}`
- Upload button: opens file picker -> uploadsloads PDF -> shows processing spinner

### Navigation

Add "Self-Study" link in student sidebar (`Layout.jsx`)

### Session flow changes

`sessions.py` `start_session` endpoint: skip enrollment check when `class_id` is null:

```python
if assignment.data.get("class_id"):
    enrollment = await db.from_("class_enrollments").select("class_id") \
        .eq("class_id", assignment.data["class_id"]).eq("student_id", user["sub"]).single().execute()
    if not enrollment.data:
        raise HTTPException(status_code=403, detail="Not enrolled in this class")
```

---

## File Map

```
backend/services/core_api.py              NEW — CORE API client + title verification
backend/routers/library.py              NEW — library endpoints
frontend/src/pages/student/SelfStudyPage.jsx  NEW — community library page
frontend/src/pages/student/StudentDashboardPage.jsx  MODIFY — add self-study link
frontend/src/components/Layout.jsx       MODIFY — add Self-Study nav link
frontend/src/App.js             MODIFY — add self-study route
backend/main.py              MODIFY — register library router
backend/routers/sessions.py             MODIFY — skip enrollment for null class_id
backend/tests/test_core_api.py         NEW — CORE API verification tests
backend/tests/test_library.py         NEW — library endpoint tests
```

---

## Testing Plan

| Test | File | What it covers |
|---|---|---|
| title_similarity | `test_core_api.py` | Exact match, partial match, no match, edge cases |
| CORE search relevance filter | `test_core_api.py` | Mock API call, filtering by threshold |
| Fetch title verification | `test_core_api.py` | Reject if title drifted |
| Library search endpoint | `test_library.py` | Auth + mocking |
| Library upload endpoint | `test_library.py` | Student upload PDF |
| Library fetch endpoint | `test_library.py` | CORE paper with title verification |
| Library browse endpoint | `test_library.py` | Category filtering |
| Session start for self-study | `test_library.py` | Skips enrollment check |

---

## Cost Considerations

- Reading guide generation: One Gemini call per unique paper (shared across all readers)
- CORE API: Free tier allows 1000 requests/day
- Student AI interactions: same cost model as classroom

---

## Out of Scope

- DOI/keyword paper search (deferred)
- Pattern recognition across papers (deferred)
- Email notifications (deferred)
- Mobile optimization (deferred)
- School SSO / LMS integration
