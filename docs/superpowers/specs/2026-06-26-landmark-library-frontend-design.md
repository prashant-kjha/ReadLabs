# Landmark Library Frontend — Design

**Date:** 2026-06-26
**Status:** Approved (design phase)
**Depends on:** the seeded landmark library (149 papers, 440 reading guides; see `readlabs-landmark-library` memory and `backend/scripts/seed_landmark_library.py`).

## Goal

Let students and teachers actually use the seeded landmark-paper library: students browse 149 famous papers, pick a difficulty, and read the pre-generated AI reading guide; teachers can assign a landmark paper (at a chosen level) to a class; and students see reading progress across the library.

## Background & constraints

- The library is seeded as `papers` + `assignments` owned by the **service user** `6633b8a8-b760-4081-9850-2e1886847daf` (config: `landmark_user_id`). Each paper has up to **3 `assignments`** — one per difficulty (`beginner`/`intermediate`/`advanced`), `class_id = NULL`, `status = 'published'`, with a fully generated `reading_guide` + `critical_prompts` + `quiz_questions`.
- `/library/browse` is **uploader-scoped** (`uploaded_by = user.sub`) and assumes **one assignment per paper**, so landmark papers are currently invisible to students.
- The **reading experience already exists**: `POST /sessions/ {assignment_id}` creates a `student_session`, then `/student/read/{assignment_id}` renders the guide. It works for any assignment the student has a session for.
- The backend uses the **service-role key** (`get_db()`), bypassing RLS — so it can read service-user-owned landmark papers and authorize student reads via session checks.

## Keystone decisions

1. **Never regenerate guides.** A student reads the pre-generated guide directly via a session on the landmark assignment. A teacher-assign **copies** the guide (+ critical-prompts + quiz) to a new class assignment. Zero Gemini cost in either path.
2. **No schema migration.** Difficulty levels are existing assignments; progress is derived from existing `student_sessions.status` (`not_started`/`in_progress`/`completed`) and `reading_stats`.
3. **Role-shared library page.** One browse page serves students and teachers. Students get **Start Reading**; teachers additionally get **Assign to class**.

## Data model

No changes. Relevant existing tables:

- `papers(id, title, uploaded_by, created_at)` — landmark rows have `uploaded_by = landmark_user_id`.
- `assignments(id, class_id NULL, paper_id, reading_guide jsonb, status, difficulty, created_at)` — landmark "library" rows have `class_id IS NULL`, `status = 'published'`.
- `student_sessions(id, student_id, assignment_id, status, current_section_index, completed_at)` — unique on `(student_id, assignment_id)`.
- `critical_prompts`, `quiz_questions` — keyed by `assignment_id`.
- `reading_stats(student_id, papers_read, quizzes_passed, current_streak, xp, level, …)`.

## Backend — 4 endpoints (extend `backend/routers/library.py`)

All reuse `get_settings().landmark_user_id` and `get_db()` (service-role key). Auth via existing `require_student` / `require_teacher` deps.

### `GET /library/landmark`
List landmark papers with their available difficulty levels.

- **Query:** `q` (title substring, optional), `sort` (`created` desc default | `title` asc), `limit` (default 24, max 50), `offset` (default 0).
- **Logic:**
  1. Query `papers` where `uploaded_by = landmark_user_id` and (if `q`) `title.ilike(%q%)`, ordered, limited/offset.
  2. For the returned `paper_id`s, query `assignments` where `paper_id IN (...)` AND `class_id IS NULL` AND `status = 'published'`; group into `levels` per paper (only levels that exist — handles the 6 partial papers).
  3. Return items + `total` (count of matching landmark papers, for paging).
- **Response:** `LandmarkLibraryResponse`
  ```json
  {
    "items": [
      {
        "paper_id": "uuid",
        "title": "Attention Is All You Need",
        "created_at": "2026-06-26T...",
        "levels": [
          {"difficulty": "beginner", "assignment_id": "uuid"},
          {"difficulty": "intermediate", "assignment_id": "uuid"},
          {"difficulty": "advanced", "assignment_id": "uuid"}
        ]
      }
    ],
    "total": 149
  }
  ```
- **Errors:** 401 unauth.

### `GET /library/landmark/featured`
Curated set for the dashboard widget.

- **Logic:** A fixed list of ~6 canonical titles (Attention Is All You Need, Deep Residual Learning, BERT, Generative Adversarial Networks, Denoising Diffusion Probabilistic Models, Playing Atari with Deep Reinforcement Learning) defined as a module constant. Query landmark papers matching those titles (`uploaded_by = landmark_user_id`, `title IN (...)`), attach levels as above.
- **Response:** `LandmarkPaper[]` (same item shape, no `total`).

### `POST /library/landmark/assign`  *(teacher)*
Assign a landmark paper at a chosen level to a class by **copying** the guide.

- **Auth:** `require_teacher`.
- **Body:** `AssignLandmarkRequest { class_id: uuid, paper_id: uuid, difficulty: 'beginner'|'intermediate'|'advanced' }`.
- **Logic:**
  1. Verify the class belongs to the teacher (`classes.id = class_id AND teacher_id = user.sub`), else 403.
  2. Verify `paper_id` is a landmark paper (`papers.uploaded_by = landmark_user_id`), else 404.
  3. Load the **source** assignment: `paper_id + difficulty + class_id IS NULL + status = 'published'`; must have a non-null `reading_guide` with a `sections` list, else 404 ("no guide for this level").
  4. **Dedup:** if a class assignment already exists for `class_id + paper_id + difficulty`, return it (idempotent).
  5. Insert new assignment `{class_id, paper_id, difficulty, status: 'published', reading_guide: source.reading_guide}`.
  6. Copy `critical_prompts` and `quiz_questions` from the source assignment to the new assignment (re-point `assignment_id`).
- **Response:** `{assignment_id, class_id, paper_id, difficulty, status}`.
- **Errors:** 403 (class not yours), 404 (not a landmark paper / no guide for level), 401.

### `GET /library/landmark/progress`  *(student)*
The student's reading status across landmark assignments.

- **Auth:** `require_student`.
- **Logic:** Query `student_sessions` for `student_id = user.sub` whose assignment is a landmark library assignment (join `assignments` → `papers.uploaded_by = landmark_user_id` AND `assignments.class_id IS NULL`). Return status + completion.
- **Response:**
  ```json
  {
    "progress": [
      {"assignment_id": "uuid", "status": "in_progress", "completed_at": null, "current_section_index": 2}
    ]
  }
  ```
- Used by the browse page to render checkmarks / "Continue reading" and by the Phase-3 progress summary.

### Schemas (`backend/schemas/library.py`)
Add: `LandmarkLevel`, `LandmarkPaper`, `LandmarkLibraryResponse`, `AssignLandmarkRequest`, `LandmarkProgressResponse`.

## Frontend (React + TS, Tailwind, React Router v6, Zustand where needed)

Shared route, e.g. **`/library`** (RoleRoute allows `student` + `teacher`; exact path confirmed against the router in the plan to avoid clashing with the existing Paper Library route). Nav entry for both roles.

### Phase 1 — student browse + read + featured dashboard
- **`LandmarkLibraryPage`** (`/library`): search input (debounced), sort dropdown, paged grid of `LandmarkPaperCard`. Loads `/library/landmark` (+ `/library/landmark/progress` for status badges — progress merge is light, included now since the endpoint is trivial). "Load more" paging via `offset`.
- **`LandmarkPaperCard`**: title; level pills (only available levels, default-select intermediate or the first available); **Start Reading** → `POST /sessions/ {assignment_id}` → `navigate('/student/read/{id}')` (reuses existing flow). Shows a status dot (not-started / in-progress / completed) from progress.
- **`LandmarkFeaturedWidget`**: horizontal-scroll row of ~6 featured cards on `StudentDashboardPage`; Start defaults to intermediate.
- **API client** (`frontend/src/lib/api.ts`): `getLandmarkLibrary({q,sort,limit,offset})`, `getFeaturedLandmarks()`, `startReading(assignmentId)` (reuse existing), `getLandmarkProgress()`.
- **Nav:** add "Landmark Library" to student (and teacher) nav.

### Phase 2 — teacher assign to class
- On `LandmarkPaperCard`, when `role === 'teacher'`, render **Assign to class** (Start remains student-only, since the `/sessions/` flow is student-scoped).
- **`AssignToClassModal`**: class picker (teacher's classes via existing endpoint) + the chosen level → `POST /library/landmark/assign`; success toast; idempotent (dedup on backend).
- Teacher entry: the same `/library` page (role-conditional actions). Add nav entry for teachers.

### Phase 3 — progress & engagement
- **My Progress** summary banner on `LandmarkLibraryPage`: "X started · Y completed" + filter chips (`All` / `Not started` / `In progress` / `Completed`) applied client-side over the loaded set.
- **Continue reading**: in-progress papers surface a "Continue" CTA (uses `current_section_index`).
- Optional: surface `reading_stats` (papers_read, streak, xp) on the dashboard widget area.

## Phased build order (each phase ships usable software)

1. **Phase 1** — backend `GET /library/landmark` + `/featured` + `/progress`; frontend page + card (with status dots) + dashboard widget + nav + api client. *Outcome: students can browse and read the whole library.*
2. **Phase 2** — backend `POST /library/landmark/assign`; frontend Assign modal + teacher actions. *Outcome: classroom use.*
3. **Phase 3** — frontend progress summary + filters + continue-reading (the `/progress` endpoint ships in P1 to power status dots). *Outcome: engagement/retention.*

## Testing

- **Backend (`pytest`, mocked DB):** one test per endpoint covering happy path + auth + key error cases (non-landmark paper rejected on assign; missing-level 404; dedup returns existing; progress only returns the caller's sessions).
- **Frontend (Playwright, mocked API, matching the 327-test suite):** browse + search + start-reading flow; teacher assign flow; progress filter/continue flow.

## Out of scope (YAGNI)

- Field/category filtering or ML-topic tagging (title search suffices for now).
- Regenerating or editing landmark guides.
- Semantic/embedding search.
- Exposing the ~83 unrun/queued papers automatically (they appear once seeded via a later re-run — the endpoints just read whatever is published).
- A separate teacher-only library route (shared `/library` with role-conditional actions instead).
