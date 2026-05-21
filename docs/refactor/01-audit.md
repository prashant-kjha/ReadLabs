# ReadLabs — Phase 1 Audit

**Date**: 2026-04-29
**Branch**: master (staged changes, not yet committed)
**Status**: Working prototype, unlaunched, single-developer codebase

---

## Current Architecture Overview

ReadLabs is a two-tier web application that helps science students read research papers with AI-guided support. Teachers upload PDFs, the system uses Google Gemini to generate structured reading guides (sections, guiding questions, key terms, methodology elements, critical thinking prompts, quizzes), and students work through those guides section by section with Socratic AI feedback.

### Request Flow

The frontend is a React 19 single-page app built with Create React App (CRA). It runs on `localhost:3000` and communicates with a FastAPI backend on `localhost:8000`. All API calls go through a centralized Axios instance at `frontend/src/lib/api.js`, which attaches the Supabase JWT to every request via a request interceptor. The backend validates that JWT using Supabase's JWKS endpoint (RSA public keys) in `backend/deps.py`.

The backend does not use an ORM. Instead, `backend/db.py` implements a custom async PostgREST query builder (`QueryBuilder`) that talks directly to Supabase's REST API over HTTP using `httpx`. This is an unconventional but functional approach — every database operation is an HTTP call to PostgREST, either with the service role key (admin mode, bypassing RLS) or the anon key (respecting RLS). The admin key is used almost everywhere.

Background tasks (Gemini calls for reading guide generation, checkpoint feedback, jargon explanations) use FastAPI's `BackgroundTasks`. These background tasks create a *synchronous* Supabase Python client instance to write results back to the database, because the async `QueryBuilder` in `db.py` depends on FastAPI's dependency injection which isn't available in background tasks. This is a notable inconsistency.

### Auth Flow

1. User signs up or signs in through `AuthPage.jsx`, which calls `/api/v1/auth/signup` or `/api/v1/auth/signin`.
2. The backend creates the user via Supabase's admin API (bypassing email confirmation), creates a `user_profiles` row, and returns JWT tokens directly.
3. The frontend stores user data (including tokens and role) in `localStorage` under the key `readlab_user`.
4. On app load, `AuthContext` restores the session from localStorage and re-establishes the Supabase client-side session via `supabase.auth.setSession()`.
5. Every subsequent API call goes through the Axios interceptor, which reads the current Supabase session token and attaches it as a Bearer header.
6. The backend verifies the JWT using JWKS (fetched once, cached in memory) in `deps.py:get_current_user()`.
7. Role-based access is enforced by `require_teacher` and `require_student` dependency functions, which look up the user's role in `user_profiles` on every request.

### Data Flow for PDFs

1. Teacher uploads a PDF via `POST /api/v1/papers/upload`.
2. `paper_service.py` extracts text and embedded images using PyMuPDF (`fitz`).
3. The PDF bytes are uploaded to Supabase Storage at `papers/{user_id}/{uuid}.pdf`.
4. A `papers` row is created with the extracted text, figure metadata, and storage path.
5. When a teacher creates an assignment, the system calls Gemini to generate a reading guide, methodology elements, and critical prompts. This runs as a background task.
6. Students receive signed URLs (1-hour expiry) to view the PDF via `react-pdf` in the browser.

---

## Module/File Inventory

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `main.py` (38 lines) | FastAPI app setup, CORS, router registration, health endpoint |
| `config.py` (34 lines) | Pydantic Settings — reads all env vars from `.env` |
| `db.py` (209 lines) | Custom async PostgREST client — `QueryBuilder`, `SupabaseDB`, shared `httpx.AsyncClient` |
| `deps.py` (104 lines) | JWT verification via JWKS, `get_current_user`, `require_teacher`, `require_student` |
| `ai_provider.py` (314 lines) | All Gemini API calls: reading guide, checkpoint feedback, sowhat feedback, jargon, annotations, quiz, grading |
| `routers/auth.py` (114 lines) | Signup (admin API), signin, `/me` endpoint |
| `routers/papers.py` (140 lines) | Upload PDF, list papers, get paper, get signed PDF URL |
| `routers/classes.py` (87 lines) | Create class, list classes, get class with students, remove student |
| `routers/assignments.py` (143 lines) | Create assignment (triggers background reading guide generation), get, update |
| `routers/sessions.py` (407 lines) | Student reading sessions: start, progress, checkpoint, sowhat, jargon, keyterm, preview endpoints |
| `routers/enrollment.py` (104 lines) | Student class join, list enrolled classes with assignments, leave class |
| `routers/dashboard.py` (160 lines) | Teacher dashboard: class progress, student responses, class-wide insights |
| `routers/library.py` (272 lines) | Self-study: upload PDF, CORE API search/fetch, browse library, status polling |
| `routers/superpowers.py` (427 lines) | Annotations (CRUD + AI prompt), methodology, critical prompts, quiz (generate + attempt), stats/XP, recommendations |
| `services/paper_service.py` (52 lines) | PDF text + image extraction via PyMuPDF |
| `services/core_api.py` (105 lines) | CORE API search + full-text fetch with title verification |
| `tests/` (1622 lines total) | pytest suite covering all routers + services |

### Frontend (`frontend/src/`)

| File/Folder | Purpose |
|-------------|---------|
| `App.js` (75 lines) | Router setup, providers (Theme, Auth, BrowserRouter), route definitions |
| `index.js` | CRA entry point |
| `index.css` (137 lines) | CSS custom properties for theming, Tailwind directives, component utility classes |
| `context/AuthContext.jsx` (73 lines) | Auth state: user, role, login/logout, session restore from localStorage |
| `context/ThemeContext.jsx` (36 lines) | Dark/light mode toggle, persisted to localStorage |
| `lib/api.js` (261 lines) | Central Axios instance + all API endpoint wrappers. **Contains large amounts of dead code** (see anti-patterns). |
| `lib/supabase.js` (17 lines) | Supabase client initialization |
| `lib/superpowersApi.js` (53 lines) | API wrappers for superpowers endpoints |
| `components/Layout.jsx` (202 lines) | App shell: navbar, mobile menu, streak widget, theme toggle |
| `components/ProtectedRoute.jsx` (21 lines) | Auth guard for routes |
| `components/ThemeToggle.jsx` (28 lines) | Dark/light toggle button |
| `components/reading/SectionsSidebar.jsx` (174 lines) | Paper sections navigation with structure coach |
| `components/reading/PdfViewer.jsx` (66 lines) | PDF display with react-pdf |
| `components/reading/AiGuidancePanel.jsx` (320 lines) | Checkpoint submission, jargon lookup, quiz, AI feedback display |
| `pages/LandingPage.jsx` (~502 lines) | Marketing landing page |
| `pages/AuthPage.jsx` (259 lines) | Login/signup with role selection |
| `pages/teacher/PapersPage.jsx` (95 lines) | Upload and list papers |
| `pages/teacher/ClassesPage.jsx` (154 lines) | Manage classes and students |
| `pages/teacher/AssignPaperPage.jsx` (79 lines) | Assign paper to class |
| `pages/teacher/AssignmentReviewPage.jsx` (204 lines) | Review/edit AI reading guide |
| `pages/teacher/DashboardPage.jsx` (132 lines) | Class progress overview |
| `pages/teacher/AssignmentDrilldownPage.jsx` (195 lines) | Per-student response drill-down |
| `pages/student/StudentDashboardPage.jsx` (~176 lines) | Student's classes and assignments |
| `pages/student/SelfStudyPage.jsx` (~315 lines) | Paper library, search, upload |
| `pages/student/ReadingPage.jsx` (~382 lines) | Three-panel reading interface |

### Infrastructure

| File | Purpose |
|------|---------|
| `supabase/migrations/20260329000000_initial_schema.sql` (569 lines) | Complete schema: 18 tables, indexes, RLS policies, triggers. **Immutable baseline.** |
| `.env.example` (9 lines) | Template for required environment variables |
| `.gitignore` | Standard ignores (env, pycache, node_modules, build, logs) |
| `frontend/package.json` | CRA-based React 19 app, Playwright for E2E |
| `backend/requirements.txt` | FastAPI, uvicorn, PyMuPDF, google-generativeai, supabase, python-jose |
| `backend/requirements-test.txt` | pytest, pytest-asyncio, httpx, Pillow |

---

## Anti-Patterns Identified

### 1. Massive dead code in `frontend/src/lib/api.js`

**File**: `frontend/src/lib/api.js:69-215`

The API client contains wrappers for ~12 API namespaces that don't exist in the backend: `papersApi.ingestDoi`, `papersApi.search`, `papersApi.getLibrary`, `summariesApi`, `chatApi`, `relatedApi`, `libraryApi` (the old version with history/tags/notes), `conversationsApi`, `pdfApi`, `bibliographiesApi`, `collectionsApi`, `dashboardApi`, `streamChat`, and `streamBibliographyChat`. These are remnants from an earlier prototype or planned features that were never implemented. They pollute the module, confuse developers, and could cause runtime errors if accidentally called.

### 2. Dual Supabase client strategy in background tasks

**Files**: `backend/routers/assignments.py:22-51`, `backend/routers/sessions.py:162-201`, `backend/routers/library.py:27-61`

Background tasks create a synchronous `supabase` Python client (`from supabase import create_client`) inside each task function to write results back. The rest of the codebase uses the custom async `QueryBuilder` from `db.py`. This means:
- Every background task instantiation creates a new Supabase client (no connection pooling).
- The synchronous client makes blocking calls inside what should be async-friendly background tasks (worked around with `asyncio.to_thread`).
- Two different database access patterns coexist with different error handling and return types.

### 3. Module-level side effects in `backend/ai_provider.py`

**File**: `backend/ai_provider.py:8-9`

```python
settings = get_settings()
genai.configure(api_key=settings.gemini_api_key)
_model = genai.GenerativeModel("gemini-2.5-flash")
```

These lines execute at import time. If the Gemini API key is not set, this silently creates a misconfigured module. The `get_settings()` call uses `@lru_cache()`, which is fine, but the `genai.configure()` and model instantiation happen once and can't be easily reset in tests.

### 4. Module-level settings instantiation across the backend

**Files**: `backend/routers/auth.py:10`, `backend/routers/papers.py:14`, `backend/routers/classes.py:8`, `backend/routers/sessions.py:13`, `backend/routers/superpowers.py:15`, `backend/routers/library.py:16`, `backend/db.py:13`

Most router files have `settings = get_settings()` at module level. While `@lru_cache()` prevents re-instantiation, this makes testing harder — you can't easily override settings for individual tests without clearing the LRU cache.

### 5. Repeated ownership verification boilerplate

**Files**: Every router file

Nearly every endpoint manually verifies ownership by querying the database (e.g., "does this class belong to this teacher?", "does this session belong to this student?"). There's no shared abstraction for this. For example, `assignments.py` checks class ownership in `create_assignment` (lines 71-73), assignment ownership in `get_assignment` (lines 107-111), and again in `update_assignment` (lines 128-132). Similar patterns repeat in `sessions.py`, `superpowers.py`, and `dashboard.py`.

### 6. No Pydantic response models

The backend defines Pydantic models for request bodies (e.g., `SignupRequest`, `CreateClassRequest`) but never for response payloads. Every endpoint returns raw dicts. This means:
- No automatic response validation.
- No OpenAPI schema documentation for response shapes.
- No guarantee that the frontend receives what it expects.

### 7. `asyncio.get_event_loop()` in `ai_provider.py`

**File**: `backend/ai_provider.py:85, 117, 148, 179, 208, 271, 303`

Every Gemini call uses `loop = asyncio.get_event_loop()` followed by `loop.run_in_executor()`. `asyncio.get_event_loop()` is deprecated in Python 3.10+ and emits a DeprecationWarning when called from a context without a running loop. The modern approach is `asyncio.get_running_loop()`, or better yet, using an async-compatible Gemini client.

### 8. RLS policies exist but the backend uses service role key everywhere

**Files**: `backend/db.py:197-201`, all routers

The database has comprehensive RLS policies (see the migration). However, `get_db()` returns an admin-mode `SupabaseDB` (using the service role key), which bypasses all RLS. Only `get_anon_db()` respects RLS, but it's defined and never used anywhere in the codebase. The backend is effectively relying on its own manual ownership checks (see anti-pattern #5) rather than on RLS. If any ownership check is missed, there's no defense-in-depth.

### 9. Inline role-based routing in `App.js`

**File**: `frontend/src/App.js:37-48`

Every protected route manually checks `role === "teacher"` or `role === "student"` and redirects to `/auth` on mismatch. This is fragile — adding a new route means remembering to add the role check. A role-aware `ProtectedRoute` or route-based authorization layer would centralize this.

### 10. Inconsistent file naming (JSX vs JS)

The codebase mixes `.jsx` and `.js` extensions for files containing JSX: `App.js` contains JSX but uses `.js`, while most other components use `.jsx`. This is cosmetic but confusing for new developers.

### 11. Storage headers duplicated across files

**Files**: `backend/routers/papers.py:16-19`, `backend/routers/library.py:22-25`

The Supabase storage headers (`apikey`, `Authorization` with service role key) are defined identically in multiple files. This should be in one place (likely `db.py` or a shared utility).

### 12. CRA is deprecated

**File**: `frontend/package.json:18`

`react-scripts` 5.0.1 is the final release of Create React App. CRA is no longer maintained. The project should migrate to Vite for ongoing maintainability.

---

## Risk Areas

### Authentication & Authorization

- **Service role key used for all DB operations**: The backend bypasses RLS by using the service role key. Security relies entirely on the manual ownership checks in each endpoint. A missed check in any one endpoint could expose data across user boundaries.
- **JWT secret in environment, JWKS cached in memory**: The `supabase_jwt_secret` env var exists in config but is not used for verification — the code uses JWKS instead. The JWKS cache (`_jwks_cache` in `deps.py:19`) is never invalidated except on verification failure. If Supabase rotates keys, there could be a window of failed verifications before the cache refreshes.
- **No rate limiting on auth endpoints**: `/api/v1/auth/signup` and `/api/v1/auth/signin` have no rate limiting or brute-force protection.
- **Signup bypasses email confirmation**: `auth.py:44` sets `email_confirm: True` via the admin API. This is intentional for the prototype but a risk for production.

### Data Safety

- **No pagination on list endpoints**: `list_papers`, `list_classes`, `list_sessions`, and others return all matching rows with no pagination. A teacher with hundreds of papers would receive all of them in a single response.
- **Large JSON payloads**: Reading guides (sections with full text, guiding questions, key terms, simplifications) are stored as a single JSONB column in `assignments.reading_guide`. For long papers, this can be very large. The frontend fetches the entire guide on session start.
- **No input sanitization on student text**: `checkpoint_responses.student_text` accepts up to 50,000 characters. While the CHECK constraint exists at the database level, the backend doesn't validate or truncate before sending to Gemini.

### Secrets Exposure

- **Service role key in `.env`**: The Supabase service role key is in the `.env` file. If this file is ever committed (`.gitignore` covers it, but mistakes happen), it grants full admin access to the database.
- **No secret rotation strategy**: There's no mechanism or documentation for rotating the Supabase keys, JWT secret, or Gemini API key.

### Frontend

- **Token stored in localStorage**: Vulnerable to XSS. If any third-party script or dependency is compromised, tokens can be stolen. This is standard for SPAs but worth noting.
- **No React error boundaries**: If any component throws during render, the entire app crashes to a white screen. There are no error boundaries to catch and display a fallback UI.
- **No CSRF protection**: The API uses Bearer token auth (not cookies), so CSRF is not a concern for API calls. However, if the app ever switches to cookie-based auth, this would need addressing.

---

## Test Coverage Map

### Backend Tests (pytest)

| File | Lines | What it covers |
|------|-------|---------------|
| `test_papers.py` | 177 | PDF upload (auth, file type, metadata), text extraction, signed URL |
| `test_sessions.py` | 237 | Start session (enrollment check, self-study skip), progress, checkpoint, sowhat, jargon, keyterm |
| `test_ai_provider.py` | 231 | All Gemini prompt functions (reading guide, checkpoint, sowhat, jargon, annotation, quiz, grading) |
| `test_auth.py` | 83 | Signup, signin, /me endpoint |
| `test_assignments.py` | 99 | Create, get, update assignment |
| `test_classes.py` | 70 | Create class, list classes, get class with students, remove student |
| `test_enrollment.py` | 102 | Join class, list enrolled classes, leave class |
| `test_library.py` | 190 | Self-study upload, status, CORE search, CORE fetch, browse |
| `test_dashboard.py` | 123 | Class progress, student responses, class insights |
| `test_superpowers.py` | 131 | Annotations CRUD, methodology, critical prompts, quiz, stats/XP |
| `test_core_api.py` | 98 | CORE search, title similarity, full-text fetch |
| `test_db.py` | 28 | Basic DB client tests |
| **Total** | **1622** | |

**Test characteristics**:
- All tests use `TestClient` (synchronous) with dependency overrides for auth and DB.
- Database is fully mocked — no integration tests against a real Supabase instance.
- `test_ai_provider.py` mocks the Gemini API responses.
- Tests cover happy paths and a few error cases (401, 403, 404).

**Backend gaps**: No tests for error handling in background tasks, no tests for concurrent access, no tests for token expiry/refresh flow.

### Frontend Tests (Playwright E2E)

| Spec | What it covers |
|------|---------------|
| `auth.spec.js` | Signup/signin form validation, role selection, mode switching, redirect |
| `landing.spec.js` | Landing page rendering, CTA navigation |
| `routing.spec.js` | Auth-protected route redirects, role-based access |
| `student.spec.js` | Student dashboard, self-study library, reading interface, streak widget |
| `teacher.spec.js` | Paper upload, class management, assignment creation, review, dashboard |
| `theme.spec.js` | Dark/light toggle, persistence |
| `*-extended.spec.js` | Additional coverage for auth, landing, routing, student, teacher |
| `gap-audit.spec.js` | Cross-cutting coverage validation |

**Test characteristics**:
- All API routes are mocked via Playwright's `page.route()`.
- Tests run against the built dev server (CRA).
- `helpers.js` (418 lines) provides shared mock data and login helpers.

**Frontend gaps**:
- No mobile/responsive viewport testing.
- No accessibility (a11y) testing.
- No error-state testing (API failures, network errors).
- No cross-browser testing (Chromium only).
- No performance or load testing.

---

## Dependency Health

### Backend

| Package | Version | Status |
|---------|---------|--------|
| `fastapi` | 0.115.0 | Current (latest is ~0.115.x) |
| `uvicorn` | 0.30.6 | Slightly outdated (latest ~0.34.x) |
| `pydantic-settings` | 2.4.0 | Outdated (latest ~2.8.x) |
| `PyMuPDF` | 1.24.10 | Outdated (latest ~1.25.x) |
| `google-generativeai` | 0.8.3 | Significantly outdated (latest ~0.10.x) |
| `python-jose` | 3.3.0 | Unmaintained (last release 2022). Consider `PyJWT` or `python-jose[cryptography]` fork. |
| `supabase` | 2.9.1 | Outdated (latest ~3.x). Only used in background tasks. |
| `tenacity` | 8.5.0 | Current |
| `Pillow` | 10.4.0 | Outdated (latest ~11.x) |

**Concerns**: `python-jose` is unmaintained. The `supabase` Python package is only used in background tasks (a secondary pattern) and is major-version behind. `google-generativeai` is several versions behind.

### Frontend

| Package | Version | Status |
|---------|---------|--------|
| `react` / `react-dom` | 19.2.4 | Current |
| `react-router-dom` | 6.30.3 | Current (v6 line) |
| `react-scripts` (CRA) | 5.0.1 | **Deprecated. No longer maintained.** |
| `@supabase/supabase-js` | 2.100.1 | Current |
| `axios` | 1.13.6 | Current |
| `react-pdf` | 10.4.1 | Current |
| `lucide-react` | 1.7.0 | Current |
| `react-hot-toast` | 2.6.0 | Current |
| `tailwindcss` | (via CRA) | Not in package.json — likely installed globally or via `tailwind.config.js` |

**Concerns**: CRA is the most significant issue. Migration to Vite is necessary for ongoing maintainability. Several `@testing-library/*` packages are installed but there are no unit tests — only Playwright E2E tests.

**Unused frontend dependencies**: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `web-vitals` — these are CRA defaults and appear unused.

---

## Open Questions for the User

Before proposing the target architecture, I need decisions on these points:

### 1. TypeScript Migration — When?

The frontend is plain JavaScript. TypeScript would catch a large class of bugs at compile time (especially around API response shapes, which are currently untyped on both sides). Options:
- **Now, as part of this refactor**: Higher upfront cost, but the refactor is already touching most files.
- **After the refactor, as a separate effort**: Lower risk of scope creep, but means touching files again.
- **Not at all**: Viable if the team plans to stay small and prefers speed over safety.

### 2. State Management — React Context Only, or Add a Library?

Currently the app uses two React Contexts (Auth, Theme) and local component state. The reading page (`ReadingPage.jsx`, `AiGuidancePanel.jsx`) manages complex state with multiple `useState` calls and prop drilling. Options:
- **Stay with Context + local state**: Works at this scale, but the reading page is already at the complexity limit.
- **Add Zustand (or similar)**: Minimal API, small bundle, good for the reading page's cross-component state.

### 3. Backend Database Access Pattern

The custom `QueryBuilder` works but is reinventing what PostgREST clients already do. Options:
- **Keep the custom QueryBuilder**: It works, the team understands it, and it's already tested. Low migration risk.
- **Switch to a proper async PostgREST client** (e.g., `postgrest-py`): More features, better maintained, but a full rewrite of the data access layer.
- **Move toward an ORM** (SQLAlchemy with async): Biggest change, best type safety, but significant effort.

### 4. Deployment Target

There's no deployment configuration in the repo. Where do you plan to deploy?
- **Vercel (frontend) + Railway/Fly.io (backend)**: Common for small teams.
- **Supabase Edge Functions**: Could replace the FastAPI backend for some endpoints.
- **Single VPS**: Simplest, full control.
- **Not decided yet**: We'll design the architecture to be deployment-agnostic.

### 5. Background Task Strategy

The current approach uses FastAPI `BackgroundTasks`, which means tasks are lost if the server restarts mid-processing. Options:
- **Keep BackgroundTasks**: Fine for a prototype where Gemini calls complete in seconds.
- **Add a task queue** (Celery, Dramatiq, or Supabase Edge Functions): Ensures reliability, but adds infrastructure complexity.

### 6. Scope of Refactor

Should the refactor include:
- **Fixing all anti-patterns identified above?** Some (like the dead API code) are low-risk and high-value. Others (like dual Supabase clients) are more involved.
- **Adding missing error boundaries and loading states?** This improves UX but expands scope.
- **Consolidating the reading page components?** The reading page is the most complex part of the frontend — refactoring it has high value but also high risk.

---

*End of Phase 1 Audit. All findings are based on code read directly from the repository.*
