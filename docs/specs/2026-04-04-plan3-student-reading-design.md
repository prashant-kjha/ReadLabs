# Plan 3: Student Reading Experience — Design Spec
**Date:** 2026-04-04
**Status:** Approved

---

## Overview

Plan 3 implements the full student-facing experience: joining classes, viewing published assignments, and working through the Socratic reading interface section by section. It also adds the AI feedback functions that fire per-student interaction (checkpoint, So What?, jargon), designed for minimum token cost.

---

## 1. Data Layer

### New Table: `key_term_definitions`

```sql
CREATE TABLE key_term_definitions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  term         TEXT NOT NULL,
  explanation  TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assignment_id, term)
);
```

**Purpose:** Cache Gemini-generated explanations for key terms identified in each assignment's reading guide. Shared across all students — the first student to click a term triggers one Gemini call; every subsequent student gets it free from the database.

### Existing Tables Used (no changes needed)

| Table | Purpose in Plan 3 |
|-------|-------------------|
| `class_enrollments` | Records student joining a class (student_id, class_id, student_name) |
| `student_sessions` | One row per (student, assignment) — tracks current_section_index and status |
| `checkpoint_responses` | One row per (session, section_index) — student text + AI feedback |
| `sowhat_responses` | One row per session — student's significance summary + AI feedback |
| `jargon_lookups` | Per-session ad-hoc lookups (highlight-any-word and manual search) |

---

## 2. Backend: Enrollment Router

**File:** `backend/routers/enrollment.py`
**Prefix:** `/api/v1/enrollment`
**Auth:** All endpoints require `require_student`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/join` | Join a class by code. Looks up class by `class_code`, inserts into `class_enrollments`. Fails with 404 if code not found, 409 if already enrolled. Returns class name and id. |
| `GET` | `/classes` | List all classes the student is enrolled in. Returns class name, code, teacher name, enrolled_at. |
| `DELETE` | `/classes/{class_id}` | Leave a class. Removes the enrollment row. |

---

## 3. Backend: Sessions Router

**File:** `backend/routers/sessions.py`
**Prefix:** `/api/v1/sessions`
**Auth:** All endpoints require `require_student`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Start or resume a session. Verifies assignment is published and student is enrolled in its class. Creates `student_sessions` row if none exists, otherwise returns existing. Returns session_id, status, current_section_index. |
| `GET` | `/{session_id}` | Full session state: current_section_index, status, all checkpoint_responses (with AI feedback), jargon_lookups, sowhat_response. |
| `GET` | `/` | Lightweight: returns session status for all of the student's sessions (session_id, assignment_id, status). Used by dashboard for progress pills. |
| `PATCH` | `/{session_id}/progress` | Update current_section_index as student advances. |
| `POST` | `/{session_id}/checkpoint` | Submit checkpoint response for current section. Triggers Gemini async via BackgroundTasks. Returns immediately with `{feedback_pending: true}`. Frontend polls GET /{session_id} every 2s until `ai_feedback` is populated. |
| `POST` | `/{session_id}/sowhat` | Submit So What? response. Same async pattern as checkpoint. |
| `POST` | `/{session_id}/jargon` | Ad-hoc jargon lookup (from highlight or manual input). Deduplicates within session. Triggers Gemini async, returns `{feedback_pending: true}`. Frontend polls. |
| `POST` | `/{session_id}/keyterm` | Look up a pre-identified key term. Checks `key_term_definitions` by (assignment_id, term). If cached, returns immediately. If not, calls Gemini synchronously, stores result, returns. Near-instant for repeat lookups. |

---

## 4. Backend: AI Provider Additions

**File:** `backend/ai_provider.py` (additions)

All three functions use Gemini 2.5 Flash, temperature 0.3, tenacity retry (max 3 attempts, 2–10s backoff) — consistent with the existing `generate_reading_guide` function.

### `generate_checkpoint_feedback(section_title, guiding_questions, student_response)`

Inputs are intentionally minimal — guiding questions only (not full section text) to keep input tokens low. Evaluates the student's response against what they were asked to look for.

Output: ~100 words of plain text. Socratic tone — never gives away the answer. Structure:
1. One thing the student identified correctly
2. One thing they missed or misread
3. A nudge question to push them deeper

### `generate_sowhat_feedback(paper_title, section_titles, difficulty, student_response)`

Inputs: paper title, list of section titles (not content), difficulty level. Evaluates whether the student's significance claim reflects the paper's actual contribution based on what a reader at this difficulty level should have understood.

Output: ~100 words of plain text. Affirms what's on track, identifies any overclaiming or underclaiming.

### `generate_jargon_explanation(term, context_snippet)`

Inputs: the term, a ~500-char snippet of paper text around where the term appears (or the student's highlighted text if from highlight-lookup).

Output: 2–3 sentences in plain English, grounded in how this specific paper uses the term. Used for both ad-hoc lookups and key term caching.

---

## 5. Frontend: Student Dashboard (`/student/dashboard`)

**File:** `frontend/src/pages/student/StudentDashboardPage.jsx`

Replaces the current stub.

**Layout:**
- Header: "My Classes" + "Join a Class" button (top right)
- Join Class modal: single class code input, submit button, error message if code invalid or already enrolled
- Class list: one card per enrolled class. Each card shows class name, teacher name, and a list of published assignments. Each assignment shows paper title, difficulty badge, and a status pill (`Not Started` / `In Progress` / `Completed`). Clicking navigates to the reading interface.

**Data sources:**
- `GET /enrollment/classes` — class + assignment list
- `POST /enrollment/join` — join class
- `GET /sessions` — fetch all session statuses for progress pills
- Teacher names resolved by joining `classes.teacher_id` → `user_profiles.name` in the enrollment endpoint response

---

## 6. Frontend: Reading Interface (`/student/read/:assignmentId`)

**File:** `frontend/src/pages/student/ReadingPage.jsx`

### Layout Toggle

Button in top-right corner. State saved to `localStorage` as `readlab_layout_preference`.

- **Stacked** (default): Guiding questions → paper text → checkpoint textarea, single scrolling column
- **Side-by-side**: Left pane (guiding questions + checkpoint area), right pane (paper text, independently scrollable). Each pane takes 50% width.

### Section Progression

- Left sidebar (or top stepper) lists all section titles. Completed = checkmark, current = highlighted, future = locked/greyed.
- Student reads the section, writes checkpoint response, hits Submit.
- Async Gemini call fires via `POST /{session_id}/checkpoint`. Page returns immediately — small spinner appears in the feedback area. Student can scroll and keep reading.
- Frontend polls `GET /{session_id}` every 2s. When `ai_feedback` is populated, it replaces the spinner inline.
- "Next Section" button appears once feedback is received.

### Key Term Highlights

Terms from the section's `key_terms` list are highlighted in the paper text with a subtle yellow underline. Clicking a term fires `POST /{session_id}/keyterm`. A tooltip/popover appears — shows spinner briefly if not cached, then explanation. Cached terms appear near-instantly.

### Highlight-to-Lookup

Selecting any text in the paper text area shows a floating "Look up" button above the selection. Fires `POST /{session_id}/jargon` async. Result appears in a side drawer that slides in from the right — non-blocking, student can dismiss or keep reading.

### Manual Jargon Search

Pinned at the bottom of the page: small input field + "Look up" button. Same async flow as highlight lookup, result shown in the same side drawer.

### So What? Section

Unlocks after the final section's checkpoint feedback is received. Full-width textarea with prompt: *"In 2–3 sentences: what does this paper contribute, and why does it matter?"*. Submit fires `POST /{session_id}/sowhat` async. Same spinner + polling pattern. Session marked `completed` once So What? feedback is returned.

---

## 7. Routing & Navigation Changes

### App.js additions
```
/student/dashboard          → StudentDashboardPage
/student/read/:assignmentId → ReadingPage
```

### Layout.jsx
Student sidebar nav:
- "My Classes" → `/student/dashboard`

---

## 8. Token Cost Design

| Interaction | Input tokens (approx) | Frequency |
|-------------|----------------------|-----------|
| Checkpoint feedback | ~300 (questions + student text) | Once per section per student |
| So What? feedback | ~200 (titles + student text) | Once per assignment per student |
| Jargon lookup (ad-hoc) | ~600 (term + 500-char snippet) | On demand |
| Key term lookup (first) | ~600 | Once per term per assignment |
| Key term lookup (cached) | 0 | All subsequent students |

Pre-compute reading guide remains the only heavy call (~10k tokens), fired once per assignment.

---

## 9. Out of Scope (Plan 3)

- Teacher insights dashboard (class-wide checkpoint analytics, `assignment_insights` table) — Plan 4
- Student ability to revise submitted checkpoint responses
- Mobile-optimised layout
- Notifications when AI feedback arrives
