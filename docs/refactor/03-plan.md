# ReadLabAI — Phase 3 Migration Plan

**Date**: 2026-04-29
**Based on**: Approved Phase 2 Architecture (`02-architecture.md`)

---

## Ordering Rules

1. Backend changes first (independent of frontend, lower risk of visible breakage).
2. Frontend tooling migration next (CRA → Vite) — risky but contained.
3. TypeScript conversion after tooling is stable — incremental, file-by-file.
4. Pattern refactors (ErrorBoundary, RoleRoute, Zustand) after TypeScript is in place.
5. Reading page consolidation last — highest-risk, most complex page.
6. Every step leaves the app in a working state with green tests.

---

## Step 1: Extract Pydantic schemas to `backend/schemas/`

**Risk**: LOW
**Goal**: Move inline Pydantic request models from routers into a dedicated `schemas/` package. Add response models for the most commonly used endpoints.

**Changes**:
- Create `backend/schemas/__init__.py`.
- Create `backend/schemas/auth.py` — move `SignupRequest`, `SigninRequest` from `routers/auth.py`.
- Create `backend/schemas/papers.py` — add `PaperUploadResponse` (the dict currently returned by `upload_paper`).
- Create `backend/schemas/classes.py` — move `CreateClassRequest` from `routers/classes.py`.
- Create `backend/schemas/assignments.py` — move `CreateAssignmentRequest`, `UpdateAssignmentRequest` from `routers/assignments.py`.
- Create `backend/schemas/sessions.py` — move `StartSessionRequest`, `ProgressRequest`, `CheckpointRequest`, `SoWhatRequest`, `JargonRequest`, `KeyTermRequest`, `PreviewCheckpointRequest`, `PreviewSoWhatRequest`, `PreviewJargonRequest`, `PreviewKeyTermRequest` from `routers/sessions.py`.
- Create `backend/schemas/superpowers.py` — move `CreateAnnotationRequest`, `UpdateAnnotationRequest`, `XpRequest`, `QuizAttemptRequest` from `routers/superpowers.py`.
- Create `backend/schemas/library.py` — move `FetchCoreRequest` from `routers/library.py`.
- Update all router imports to point at `backend.schemas.*` instead of inline definitions.
- Add `response_model=` parameter to endpoints where the response shape is stable and well-understood. Start with: `POST /auth/signup`, `POST /auth/signin`, `GET /auth/me`, `GET /papers`, `POST /papers/upload`, `GET /classes`, `POST /classes`, `POST /sessions/`.

**Verify**: `pytest backend/tests/` passes. All Playwright tests pass.

**Commit**: `refactor(backend): extract Pydantic schemas into dedicated package`

---

## Step 2: Fix backend anti-patterns

**Risk**: LOW
**Goal**: Fix the module-level side effects in `ai_provider.py`, replace deprecated `asyncio.get_event_loop()`, consolidate duplicate storage headers, and fix the production error handler.

**Changes**:
- `ai_provider.py` — wrap Gemini client initialization in a lazy function (`get_gemini_model()`) instead of module-level execution. The function caches the model instance on first call. Update all callers.
- `ai_provider.py` — replace every `asyncio.get_event_loop()` with `asyncio.get_running_loop()`. Seven occurrences across `generate_reading_guide`, `generate_checkpoint_feedback`, `generate_sowhat_feedback`, `generate_jargon_explanation`, `generate_class_insights`, `generate_annotation_socratic_prompt`, `generate_quiz_questions`, `grade_short_answer`.
- `routers/papers.py` and `routers/library.py` — move duplicate `STORAGE_HEADERS` dict into `db.py` as `storage_headers()` and import from there.
- `main.py` — update `global_error_handler` to hide internal details in production: return generic `"Internal server error"` when `settings.environment == "production"`, return `str(exc)` in development.

**Verify**: `pytest backend/tests/` passes. All Playwright tests pass.

**Commit**: `refactor(backend): fix module-level side effects, async deprecation, duplicate headers`

---

## Step 3: Migrate frontend from CRA to Vite

**Risk**: HIGH — this is the highest-risk step in the entire refactor. It changes the build tooling, dev server, and environment variable handling. **Stop and confirm with user before proceeding.**

**Goal**: Replace Create React App with Vite. Files stay as `.jsx`/`.js` for this step — TypeScript comes next.

**Changes**:
- Install: `npm install -D vite @vitejs/plugin-react`
- Create `frontend/vite.config.js` with React plugin.
- Move `frontend/public/index.html` → `frontend/index.html`. Replace `%PUBLIC_URL%` with `/`. Add `<script type="module" src="/src/main.jsx"></script>`.
- Rename `frontend/src/index.js` → `frontend/src/main.jsx`. Remove `reportWebVitals()` call and its import.
- Rename `frontend/src/App.js` → `frontend/src/App.jsx`.
- Replace all `process.env.REACT_APP_*` with `import.meta.env.VITE_*` in:
  - `src/lib/supabase.js` (2 occurrences: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`)
  - `src/lib/api.js` (1 occurrence: `REACT_APP_API_URL`)
- Update `frontend/.env` with `VITE_`-prefixed vars.
- Update `frontend/package.json` scripts: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`. Remove `"start"`, `"eject"`.
- Remove `react-scripts` from dependencies.
- Update `frontend/playwright.config.js` — change webServer to use `npx vite --port 3000` (keep port 3000 so existing test routes don't break) or update the `baseURL` in test config to port 5173.
- Delete `frontend/src/reportWebVitals.js` (unused after removing the call).
- Verify no `process.env` or `REACT_APP_` references remain in `src/`.

**Verify**:
1. `cd frontend && npm run build` succeeds.
2. `cd frontend && npm run dev` starts without errors.
3. All Playwright tests pass.
4. `grep -r "process.env" src/` returns zero hits.
5. `grep -r "REACT_APP_" src/` returns zero hits.

**Commit**: `refactor(frontend): migrate from CRA to Vite`

---

## Step 4: Set up TypeScript and convert lib layer

**Risk**: MEDIUM
**Goal**: Add TypeScript infrastructure. Convert `lib/` files (the API client, Supabase client, superpowers API) to `.ts`. Create `types/` directory with type definitions for API responses. Remove dead API code.

**Changes**:
- Install: `npm install -D typescript @types/react @types/react-dom`
- Create `frontend/tsconfig.json` (strict mode, see architecture doc for full config).
- Create `frontend/src/vite-env.d.ts` with `/// <reference types="vite/client" />`.
- Rename `vite.config.js` → `vite.config.ts`.
- Create `frontend/src/types/` directory:
  - `auth.ts` — `User`, `AuthResponse` types.
  - `papers.ts` — `Paper`, `Figure`, `PaperUploadResponse` types.
  - `sessions.ts` — `Session`, `ReadingGuide`, `Section`, `CheckpointResponse`, `SoWhatResponse`, `JargonLookup` types.
  - `classes.ts` — `Class`, `Enrollment`, `ClassWithStudents` types.
  - `superpowers.ts` — `Annotation`, `MethodologyElement`, `CriticalPrompt`, `QuizQuestion`, `QuizAttempt`, `ReadingStats` types.
- Rename and convert `src/lib/supabase.js` → `src/lib/supabase.ts`.
- Rename and convert `src/lib/api.js` → `src/lib/api.ts`:
  - Add typed interceptors.
  - **Remove all dead endpoint wrappers** (the ~12 unused API namespaces: `papersApi.ingestDoi`, `papersApi.search`, `papersApi.getLibrary`, `summariesApi`, `chatApi`, `relatedApi`, `libraryApi` old version, `conversationsApi`, `pdfApi`, `bibliographiesApi`, `collectionsApi`, `dashboardApi`, `streamChat`, `streamBibliographyChat`).
  - Keep only: `getPdfUrl` export, plus the Axios instance export.
- Rename and convert `src/lib/superpowersApi.js` → `src/lib/superpowersApi.ts` — add typed parameters and return types.

**Verify**: `npm run build` succeeds (TypeScript compiles). All Playwright tests pass.

**Commit**: `refactor(frontend): add TypeScript, convert lib layer, remove dead API code`

---

## Step 5: Convert components to TypeScript + add ErrorBoundary and RoleRoute

**Risk**: MEDIUM
**Goal**: Convert existing components to `.tsx`. Create `ErrorBoundary` and `RoleRoute`. Update `App.tsx` to use `RoleRoute` instead of inline role checks.

**Changes**:
- Rename `src/components/Layout.jsx` → `Layout.tsx`. Add prop types and type the `NavLink` rendering.
- Rename `src/components/ProtectedRoute.jsx` → `ProtectedRoute.tsx`. Add children prop type.
- Rename `src/components/ThemeToggle.jsx` → `ThemeToggle.tsx`.
- Create `src/components/ErrorBoundary.tsx` — class component with `componentDidCatch`, renders fallback UI with reload button.
- Create `src/components/RoleRoute.tsx` — wrapper that checks `role` from `useAuth()` and either renders children or redirects to `/auth`. Props: `allowedRole: "teacher" | "student"`.
- Update `src/App.tsx`:
  - Replace every inline `role === "teacher" ? <Component /> : <Navigate to="/auth" />` with `<RoleRoute allowedRole="teacher"><Component /></RoleRoute>`.
  - Wrap the app in `<ErrorBoundary>`.
- Rename `src/components/reading/SectionsSidebar.jsx` → `SectionsSidebar.tsx`.
- Rename `src/components/reading/PdfViewer.jsx` → `PdfViewer.tsx`.
- Rename `src/components/reading/AiGuidancePanel.jsx` → `AiGuidancePanel.tsx`.
- Add types for all component props.

**Verify**: `npm run build` succeeds. All Playwright tests pass.

**Commit**: `refactor(frontend): convert components to TypeScript, add ErrorBoundary and RoleRoute`

---

## Step 6: Convert context providers and pages to TypeScript

**Risk**: MEDIUM
**Goal**: Convert the remaining `.jsx` files to `.tsx`. Context providers get typed. Pages get typed. This is the bulk file-renaming step.

**Changes**:
- Rename and convert `src/context/AuthContext.jsx` → `AuthContext.tsx`:
  - Define `AuthContextType` interface (`user`, `role`, `loading`, `login`, `logout`).
  - Define `UserData` type matching what's stored in localStorage.
- Rename and convert `src/context/ThemeContext.jsx` → `ThemeContext.tsx`:
  - Define `ThemeContextType` (`theme`, `setTheme`, `toggleTheme`).
- Rename and convert all page files:
  - `src/pages/LandingPage.jsx` → `LandingPage.tsx`
  - `src/pages/AuthPage.jsx` → `AuthPage.tsx`
  - `src/pages/teacher/PapersPage.jsx` → `PapersPage.tsx`
  - `src/pages/teacher/ClassesPage.jsx` → `ClassesPage.tsx`
  - `src/pages/teacher/AssignPaperPage.jsx` → `AssignPaperPage.tsx`
  - `src/pages/teacher/AssignmentReviewPage.jsx` → `AssignmentReviewPage.tsx`
  - `src/pages/teacher/DashboardPage.jsx` → `DashboardPage.tsx`
  - `src/pages/teacher/AssignmentDrilldownPage.jsx` → `AssignmentDrilldownPage.tsx`
  - `src/pages/student/StudentDashboardPage.jsx` → `StudentDashboardPage.tsx`
  - `src/pages/student/SelfStudyPage.jsx` → `SelfStudyPage.tsx`
  - `src/pages/student/ReadingPage.jsx` → `ReadingPage.tsx` (convert to TS but don't refactor internals yet — that's Step 8)
- Rename `src/main.jsx` → confirm it's already `main.tsx` from Step 3 rename.
- Rename `src/App.jsx` → confirm it's already `App.tsx`.
- Delete `src/App.css` and `src/logo.svg` if unused (they're CRA defaults).
- Delete `src/App.test.js` and `src/setupTests.js` if unused (testing-library unit tests that don't exist).

**Verify**: `npm run build` succeeds with zero TypeScript errors. All Playwright tests pass.

**Commit**: `refactor(frontend): convert context providers and pages to TypeScript`

---

## Step 7: Add Zustand and refactor reading page state

**Risk**: HIGH — the reading page is the most complex page in the app. It's the core user experience. **Stop and confirm with user before proceeding.**

**Goal**: Create a Zustand store for reading page state. Refactor `ReadingPage.tsx`, `AiGuidancePanel.tsx`, and `SectionsSidebar.tsx` to use the store instead of prop drilling.

**Changes**:
- Install: `npm install zustand`
- Create `src/hooks/useReadingStore.ts`:
  - Define `ReadingState` interface and `ReadingActions` interface.
  - Store manages: `session`, `currentSection`, `checkpoints`, `sowhat`, `jargonLookups`, `quiz`, `annotations`, loading states, error states.
  - Actions: `startSession()`, `setCurrentSection()`, `submitCheckpoint()`, `submitSowhat()`, `lookupJargon()`, `generateQuiz()`, `submitQuiz()`, `fetchAnnotations()`.
  - Each action encapsulates the API call, loading state, and error handling that currently lives in `ReadingPage.tsx` and `AiGuidancePanel.tsx`.
- Refactor `ReadingPage.tsx`:
  - Replace ~10 `useState` calls with `useReadingStore()`.
  - Replace `useEffect` data-fetching logic with store actions.
  - Remove props being passed to sub-components (they read from the store directly).
- Refactor `AiGuidancePanel.tsx`:
  - Replace props with `useReadingStore()` selectors.
  - Keep UI logic in the component, move data-fetching to store actions.
- Refactor `SectionsSidebar.tsx`:
  - Replace props with `useReadingStore()` selectors.
  - Keep UI logic, move section navigation to store action.

**Verify**: `npm run build` succeeds. All Playwright tests pass. Manual test: load a reading assignment, navigate sections, submit a checkpoint, look up jargon, take the quiz.

**Commit**: `refactor(frontend): add Zustand store for reading page, eliminate prop drilling`

---

## Step 8: Standardize error handling across pages

**Risk**: LOW
**Goal**: Ensure every page handles API errors consistently with toast notifications. Add loading states where missing.

**Changes**:
- Audit every page for error handling. Current state: some pages use `toast.error()`, some use inline error display, some silently fail.
- Standardize: **toast for API errors**, **inline messages for form validation**.
- Ensure every async operation has a loading state that disables the submit button and shows a spinner.
- `LandingPage.tsx` — no async operations, no changes needed.
- `AuthPage.tsx` — already uses toast. Verify loading states on submit buttons.
- `PapersPage.tsx` — add toast for upload failures. Add loading state during upload.
- `ClassesPage.tsx` — add toast for create/join failures.
- `AssignPaperPage.tsx` — add toast for assignment creation failures.
- `AssignmentReviewPage.tsx` — add toast for save/publish failures.
- `DashboardPage.tsx` — add error handling for data fetch failures.
- `AssignmentDrilldownPage.tsx` — add toast for insight generation failures.
- `StudentDashboardPage.tsx` — add toast for join/leave failures.
- `SelfStudyPage.tsx` — add toast for upload/search failures. Add loading state during CORE search.
- `ReadingPage.tsx` / reading components — errors handled by Zustand store. Add toast calls in store actions for failed API calls.

**Verify**: `npm run build` succeeds. All Playwright tests pass.

**Commit**: `refactor(frontend): standardize error handling with toast and loading states`

---

## Step 9: Final cleanup and verification

**Risk**: LOW
**Goal**: Remove remaining dead code, verify everything works, produce deliverable documentation.

**Changes**:
- Delete any remaining CRA artifacts: `frontend/src/App.css`, `frontend/src/logo.svg`, `frontend/src/App.test.js`, `frontend/src/setupTests.js` (if unused).
- Delete `frontend/build/` directory (stale CRA build output).
- Verify `frontend/public/` only contains assets still in use.
- Run full Playwright test suite one final time.
- Run backend pytest one final time.
- Run `npm run build` one final time.
- Verify no `@ts-expect-error` comments remain (or document any that do with a TODO).
- Produce deliverables:
  - `docs/refactor/04-summary.md` — refactor retrospective.
  - `README.md` — fresh project documentation.
  - `CLAUDE.md` — conventions for future Claude Code sessions.

**Verify**: All tests pass. Build succeeds. Documentation is complete.

**Commit**: `refactor: final cleanup and documentation`

---

## Risk Summary

| Step | Risk | Reason | User confirmation needed? |
|------|------|--------|--------------------------|
| 1. Extract schemas | LOW | Moving code, no logic changes | No |
| 2. Fix anti-patterns | LOW | Small targeted fixes | No |
| 3. CRA → Vite | HIGH | Changes build tooling, env vars, dev server | **Yes — stop before this step** |
| 4. TypeScript + lib | MEDIUM | New types, dead code removal | No |
| 5. Components + ErrorBoundary | MEDIUM | New components, route restructuring | No |
| 6. Pages + context | MEDIUM | Bulk file renames | No |
| 7. Zustand + reading page | HIGH | Refactors core UX | **Yes — stop before this step** |
| 8. Error handling | LOW | Consistency improvements | No |
| 9. Final cleanup | LOW | Documentation and dead code removal | No |

---

*End of Phase 3 Migration Plan. Nine ordered steps, each with a specific goal, verification criteria, and commit message. Steps 3 and 7 are flagged as high risk and require user confirmation before proceeding.*
