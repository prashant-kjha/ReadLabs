# ReadLabAI — Phase 2 Architecture Proposal

**Date**: 2026-04-29
**Based on**: Phase 1 Audit (`01-audit.md`)

---

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TypeScript | Yes — migrate during the refactor | User choice; handled as a dedicated step after Vite migration |
| State management | Zustand for reading page only; Context for auth + theme | 1KB dependency, solves prop drilling on the most complex page |
| Database access | Keep custom QueryBuilder | Works, tested, well-matched to Supabase's PostgREST architecture |
| Deployment target | Vercel (frontend) + Railway (backend) | $0-5/month, Python backend runs as-is, no rewrite needed |
| Background tasks | Keep FastAPI BackgroundTasks | Good enough for prototype; revisit if task loss becomes real |
| Refactor scope | Full — anti-patterns + error handling + reading page + TypeScript | User confirmed all three scope points |

---

## Target Folder Structure

### Backend

```
backend/
├── main.py                  # FastAPI app, CORS, router includes, lifespan
├── config.py                # Pydantic Settings (unchanged)
├── db.py                    # Custom async PostgREST client (unchanged)
├── deps.py                  # JWT verification, role guards
├── routers/                 # One file per domain, thin — validates input, calls services
│   ├── auth.py
│   ├── papers.py
│   ├── classes.py
│   ├── assignments.py
│   ├── enrollment.py
│   ├── sessions.py
│   ├── dashboard.py
│   ├── library.py
│   └── superpowers.py
├── services/                # Business logic, extracted from routers
│   ├── ai_provider.py       # Gemini API calls
│   ├── paper_service.py     # PDF extraction
│   └── core_api.py          # CORE search/fetch
├── schemas/                 # NEW — Pydantic request + response models
│   ├── __init__.py
│   ├── auth.py
│   ├── papers.py
│   ├── classes.py
│   ├── assignments.py
│   ├── sessions.py
│   ├── dashboard.py
│   ├── library.py
│   └── superpowers.py
├── tests/
│   ├── conftest.py
│   └── test_*.py
├── requirements.txt
└── requirements-test.txt
```

**What changed and why**: The only structural change is adding `backend/schemas/`. Right now, Pydantic request models are defined inline at the top of each router file. Moving them to a dedicated `schemas/` package means they can be reused (e.g., the same response model can document what the frontend receives), keeps router files focused on HTTP concerns, and makes it easy to add response models later.

I considered a deeper restructure (splitting routers into route files + service files with a separate repository layer), but rejected it. At this codebase size (~3,500 lines of backend Python), that would add indirection without proportional benefit. The routers already delegate to `ai_provider.py`, `paper_service.py`, and `core_api.py` for complex logic. The right level of abstraction is: routers handle HTTP validation and call services or the DB directly; services handle business logic (AI calls, PDF processing). Adding a repository/data-access layer would be over-engineering for 9 routers and 18 tables.

### Frontend

```
frontend/
├── public/
│   ├── favicon.ico
│   └── ...
├── src/
│   ├── main.tsx              # Vite entry point (renamed from index.js, now TypeScript)
│   ├── App.tsx               # Router setup, providers
│   ├── index.css             # Tailwind directives + CSS custom properties
│   ├── vite-env.d.ts         # Vite type declarations (auto-generated)
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── RoleRoute.tsx         # NEW — role-based route guard
│   │   ├── ErrorBoundary.tsx     # NEW — catches render crashes
│   │   └── ThemeToggle.tsx
│   │   └── reading/             # Reading page sub-components
│   │       ├── SectionsSidebar.tsx
│   │       ├── PdfViewer.tsx
│   │       └── AiGuidancePanel.tsx
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/
│   │   └── useReadingStore.ts    # NEW — Zustand store for reading page
│   ├── lib/
│   │   ├── api.ts             # Central Axios instance + interceptors only
│   │   ├── supabase.ts        # Supabase client
│   │   └── superpowersApi.ts
│   ├── types/
│   │   ├── auth.ts            # Auth-related type definitions
│   │   ├── papers.ts          # Paper, assignment, reading guide types
│   │   ├── sessions.ts        # Session, checkpoint, jargon types
│   │   ├── classes.ts         # Class, enrollment types
│   │   └── superpowers.ts     # Annotation, quiz, stats types
│   ├── pages/
│   │   ├── LandingPage.tsx
│   │   ├── AuthPage.tsx
│   │   ├── teacher/
│   │   │   ├── PapersPage.tsx
│   │   │   ├── ClassesPage.tsx
│   │   │   ├── AssignPaperPage.tsx
│   │   │   ├── AssignmentReviewPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   └── AssignmentDrilldownPage.tsx
│   │   └── student/
│   │       ├── StudentDashboardPage.tsx
│   │       ├── ReadingPage.tsx
│   │       └── SelfStudyPage.tsx
│   └── setupTests.ts
├── tests/                   # Playwright E2E specs (stay as .js — no TS needed for tests)
├── playwright.config.js
├── tailwind.config.js
├── tsconfig.json            # NEW — TypeScript config
├── vite.config.ts           # NEW — Vite config (in TS for consistency)
├── package.json
└── index.html               # NEW — Vite uses root index.html
```

**What changed and why**:
- All `.js`/`.jsx` source files become `.ts`/`.tsx` (TypeScript migration).
- `types/` directory holds shared type definitions. Rather than scattering interfaces across component files, domain types live in one place. This mirrors the backend's `schemas/` pattern.
- `hooks/useReadingStore.ts` is the Zustand store for reading page state. A `hooks/` directory is created for custom hooks (standard React convention).
- `vite.config.ts` and `tsconfig.json` are added for Vite + TypeScript support.
- Root `index.html` replaces `public/index.html` (Vite convention).
- `main.tsx` replaces `index.js` (Vite + TypeScript convention).
- `RoleRoute.tsx` centralizes role-based route guarding (eliminates the inline `role === "teacher"` checks in `App.tsx`).
- `ErrorBoundary.tsx` catches render crashes instead of white-screening.
- `api.ts` is trimmed to only contain the Axios instance, interceptors, and actively-used endpoint wrappers. Dead code is removed.
- Playwright test files stay as `.js` — no benefit to typing test files, and Playwright works fine with plain JS.

---

## Separation of Concerns

### Backend: Routes → Services → DB

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Routers** | Parse and validate HTTP input (via Pydantic schemas), call DB or services, return HTTP responses. No business logic. | `assignments.py` validates the request body, checks class ownership, inserts the assignment row, kicks off the background task. |
| **Services** | Business logic that doesn't belong in routers. Currently: AI generation (`ai_provider.py`), PDF extraction (`paper_service.py`), CORE API (`core_api.py`). | `ai_provider.py` formats prompts, calls Gemini, parses responses. |
| **DB (`db.py`)** | Data access. The custom `QueryBuilder` translates method chains into PostgREST HTTP calls. | `db.from_("papers").select("*").eq("id", paper_id).single().execute()` |
| **Schemas** | Pydantic models for request bodies and response payloads. | `CreateAssignmentRequest`, `AssignmentResponse` |
| **Deps (`deps.py`)** | Authentication and authorization dependencies. | `get_current_user`, `require_teacher`, `require_student` |

**Why not add a service layer for everything?** At this scale, most router endpoints are 10-20 lines of "validate input → query DB → return result." Extracting that into a service function would add a file and an import without reducing complexity. Services are for logic that's reused across routers, is complex enough to warrant its own tests, or involves external APIs (Gemini, CORE). The existing split already follows this principle.

### Frontend: Components → Pages → API Client

| Layer | Responsibility |
|-------|---------------|
| **Pages** | Route-level components. Fetch data, manage page state, compose components. Pages are the "smart" components. |
| **Components** | Reusable UI pieces. Receive data via props or Zustand store, emit events via callbacks. Components are "dumb" — they don't fetch data or manage global state. |
| **Context** | Truly global state: auth (user, role, tokens) and theme (dark/light). Only two contexts, and they stay as Context. |
| **Zustand Store** | Reading page state: session, checkpoints, jargon lookups, quiz, polling. Scoped to the reading page, shared across its sub-components. |
| **Types** | Shared TypeScript interfaces and type aliases. One file per domain. Imported by pages, components, and API client. |
| **API Client** | HTTP calls. Returns typed promises. Pages call these, never Axios directly. |

---

## Naming Conventions

### Backend (Python)

| Item | Convention | Example |
|------|-----------|---------|
| Files | `snake_case.py` | `paper_service.py`, `test_sessions.py` |
| Routers | Plural noun matching the domain | `papers.py`, `sessions.py` |
| Schemas | `PascalCase` models, suffixed by purpose | `CreateAssignmentRequest`, `AssignmentResponse` |
| Functions | `snake_case` | `generate_reading_guide`, `extract_text_and_figures` |
| Environment variables | `UPPER_SNAKE_CASE` | `SUPABASE_URL`, `GEMINI_API_KEY` |
| Database columns | `snake_case` | `created_at`, `student_id`, `reading_guide` |
| Database tables | Plural `snake_case` | `papers`, `class_enrollments` |

### Frontend (TypeScript/TSX)

| Item | Convention | Example |
|------|-----------|---------|
| Component files | `PascalCase.tsx` | `PapersPage.tsx`, `ThemeToggle.tsx` |
| Non-component files | `camelCase.ts` | `api.ts`, `superpowersApi.ts` |
| Type definition files | `camelCase.ts` in `types/` | `papers.ts`, `sessions.ts` |
| Components | Named default export | `export default function PapersPage() {}` |
| Hooks | `useCamelCase` | `useAuth`, `useTheme`, `useReadingStore` |
| Types/Interfaces | `PascalCase`, prefixed by domain | `Paper`, `Assignment`, `ReadingGuide`, `CheckpointResponse` |
| CSS classes | `kebab-case` via Tailwind | `btn-primary`, `card-hover` |
| Environment variables | `VITE_UPPER_SNAKE_CASE` | `VITE_API_URL`, `VITE_SUPABASE_URL` |

---

## State Management

**Approach: React Context for global state + Zustand for reading page + local state for everything else.**

### What stays as Context

- **AuthContext** — `user`, `role`, `login()`, `logout()`. Used by nearly every page and component. Context is the right tool here because auth state is truly global and changes rarely.
- **ThemeContext** — `theme`, `toggleTheme()`. Two values, used by Layout and ThemeToggle. Too simple to justify Zustand.

### What moves to Zustand

The reading page's session state. Right now, `ReadingPage.tsx` manages ~10 state variables (session data, checkpoints, current section, jargon lookups, quiz state, loading flags) and passes them as props to `SectionsSidebar`, `PdfViewer`, and `AiGuidancePanel`. This creates heavy prop drilling and makes `ReadingPage` a monolith.

The Zustand store (`useReadingStore`) encapsulates:
- Session fetching and polling
- Checkpoint submission and feedback retrieval
- Jargon lookups
- Quiz generation and submission
- Current section tracking
- Loading/error states for each operation

**What this looks like:**

```typescript
// hooks/useReadingStore.ts
import { create } from 'zustand';
import type { Session, Checkpoint, QuizQuestion, ... } from '../types/sessions';

interface ReadingState {
  session: Session | null;
  currentSection: number;
  checkpoints: Checkpoint[];
  // ... other state

  // Actions
  startSession: (assignmentId: string) => Promise<void>;
  submitCheckpoint: (sectionIndex: number, text: string) => Promise<void>;
  setCurrentSection: (index: number) => void;
  // ... other actions
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  session: null,
  currentSection: 0,
  checkpoints: [],
  // ... initial state

  startSession: async (assignmentId) => {
    // fetch, set state
  },
  submitCheckpoint: async (sectionIndex, text) => {
    // submit, update state
  },
  setCurrentSection: (index) => set({ currentSection: index }),
}));
```

`ReadingPage.tsx` calls `useReadingStore.getState().startSession(assignmentId)` on mount. Sub-components use `useReadingStore(state => state.currentSection)` to read only the slice they need. No prop drilling.

### Why not Zustand for everything?

Auth and Theme are already clean as Context. Context has zero learning curve for new developers. Adding Zustand for two values that change rarely would be complexity without benefit. Zustand earns its place on the reading page specifically because of the prop drilling problem.

---

## TypeScript Migration Strategy

### Why now

The user chose to include TypeScript in this refactor. The rationale: we're already touching every frontend file during the Vite migration, error boundary addition, and API client cleanup. Adding type annotations at the same time means we convert each file once instead of revisiting it later.

### How it integrates into the refactor

TypeScript is **not** a standalone step. Instead, each file gets converted as it's touched for other reasons:

1. **During Vite migration** — rename `index.js` → `main.tsx`, `App.js` → `App.tsx`, add `tsconfig.json`, add `vite-env.d.ts`.
2. **During API client cleanup** — convert `api.js` → `api.ts`, `supabase.js` → `supabase.ts`, `superpowersApi.js` → `superpowersApi.ts`. Add type definitions in `types/`.
3. **During component work** — each component gets converted as it's touched for ErrorBoundary, RoleRoute, or Zustand work.
4. **Pages last** — pages are the most complex files. Convert them after the infrastructure (API client, types, stores) is in place, so pages can import from typed modules.

### Type definitions

Type definitions live in `src/types/`, one file per domain. These define the shapes that the frontend expects from the backend API. Example:

```typescript
// types/papers.ts
export interface Paper {
  id: string;
  title: string;
  extracted_text: string;
  figures: Figure[];
  pdf_path: string;
  uploaded_by: string;
  created_at: string;
}

export interface Figure {
  page: number;
  index: number;
  data: string;  // base64
  ext: string;
  width: number;
  height: number;
}
```

These types are inferred from the backend's actual responses, not from the backend's code. This is intentional — the backend returns raw dicts (no Pydantic response models), so the TypeScript types are the single source of truth for what the frontend expects. If the backend changes a response shape, the TypeScript compiler will flag every place that breaks.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

`strict: true` is the goal. Some files may need `// @ts-expect-error` comments during conversion (especially the reading page with its complex state). These should be tracked and resolved — they're not permanent.

### Dependencies to add

```bash
npm install -D typescript @types/react @types/react-dom
```

That's it. No `@types/` for Zustand (it ships its own), Axios (ships its own), or react-router-dom (ships its own).

---

## API Client Pattern

**Target: Central Axios instance with interceptors + two thin typed wrapper modules.**

### `lib/api.ts` — Axios instance and interceptors only

```typescript
import axios from 'axios';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach Supabase JWT
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  return config;
});

// Response interceptor: normalize errors, handle token refresh
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (
      err.response?.status === 401 &&
      err.response?.data?.detail === "Token expired" &&
      !original._retry
    ) {
      original._retry = true;
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          const stored = localStorage.getItem("readlab_user");
          if (stored) {
            const parsed = JSON.parse(stored);
            localStorage.setItem("readlab_user", JSON.stringify({
              ...parsed,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }));
          }
          original.headers.Authorization = `Bearer ${session.access_token}`;
          return api(original);
        }
      } catch {
        localStorage.removeItem("readlab_user");
        window.location.href = "/auth";
        return Promise.reject(new Error("Session expired. Please log in again."));
      }
    }
    const rawDetail = err.response?.data?.detail;
    const msg = rawDetail
      ? (typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail))
      : (err.message || 'An error occurred');
    return Promise.reject(new Error(msg));
  }
);

export default api;
export { API_URL };
```

### Endpoint wrappers

Active endpoints only. Every function has typed parameters and return types. Dead code (the ~12 unused API namespaces from the current `api.js`) is removed.

The endpoint wrappers will live alongside the Axios export or in `lib/endpoints.ts`, depending on how many there are. Given that the active endpoints are roughly 15-20 functions (papers CRUD, classes CRUD, assignments, enrollment, sessions, plus the superpowers API which is already in its own file), keeping them in `api.ts` alongside the instance is fine. If the file grows past ~100 lines of endpoint definitions, split into `lib/endpoints.ts`.

### `lib/superpowersApi.ts` — Unchanged in structure, typed

The existing `superpowersApi.js` is already clean — 53 lines, one function per endpoint. Add type annotations to parameters and return types.

---

## Error Handling Strategy

### Backend

**Consistent error envelope.** Every error response from the backend follows `{ "detail": "string" }`. This is already the FastAPI default. The global exception handler in `main.py` ensures even unhandled exceptions return this shape.

**Improvement**: In production, the global handler should return a generic message to avoid leaking internal details:

```python
content={"detail": "Internal server error" if settings.environment == "production" else str(exc)}
```

### Frontend — Three Layers

1. **Axios response interceptor** (`api.ts`): Catches HTTP errors, normalizes them into `Error` objects with human-readable messages, handles token refresh on 401. Already implemented and working well.

2. **React error boundary** (`ErrorBoundary.tsx`): Catches render crashes. Wraps the app below the providers. Displays a "Something went wrong" UI with a reload button instead of a white screen. This is the safety net for unhandled errors.

3. **Page-level error handling**: Each page handles expected errors (404, validation failures) locally with toast notifications (`react-hot-toast`). The refactor standardizes on **toast for API errors** and **inline messages for form validation**. Loading states get consistent spinner/skeleton treatment.

---

## Environment & Secrets

### Target State

| File | Committed? | Purpose |
|------|-----------|---------|
| `.env` (root) | No | All secrets, both backend and frontend |
| `.env.example` (root) | Yes | Template with descriptions for every variable |

The separate `frontend/.env` is removed — Vite reads env vars from the project root.

### `.env.example` contents

```
# ── Supabase ──────────────────────────────────────
# Find these in: Supabase Dashboard → Project Settings → API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key    # NEVER expose to frontend
SUPABASE_JWT_SECRET=your-jwt-secret                # Backend-only, for token verification

# ── Gemini AI ─────────────────────────────────────
GEMINI_API_KEY=your-gemini-api-key

# ── CORE API (optional — for self-study paper search) ──
CORE_API_KEY=your-core-api-key

# ── Frontend (prefixed VITE_ — exposed to browser by Vite) ──
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000/api/v1

# ── Backend ────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:5173
ENVIRONMENT=development
```

Note that `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` have no `VITE_` prefix and are therefore invisible to the frontend — Vite only exposes `VITE_`-prefixed vars. This is the correct security boundary.

---

## Database Access: Why the Custom QueryBuilder Stays

Three options were evaluated:

| | Custom QueryBuilder (current) | Async PostgREST (`postgrest-py`) | SQLAlchemy ORM |
|---|---|---|---|
| Type safety | None (returns dicts) | None (returns dicts) | Full (model classes) |
| Migration effort | Zero | Medium (rewrite `db.py`) | High (rewrite all DB calls) |
| Supabase compatibility | Native (PostgREST HTTP) | Native (PostgREST HTTP) | Requires direct Postgres connection |
| RLS compatibility | Works (service role or anon headers) | Same | Bypasses PostgREST; needs Postgres role management |
| Schema migration coexistence | Supabase migrations only | Same | Conflicts — would need Alembic alongside Supabase migrations |
| IDE support | No autocompletion | No autocompletion | Full autocompletion |
| New dependency | None | Yes | Yes (SQLAlchemy + asyncpg) |

**Decision**: Keep the custom QueryBuilder. It works, it's tested, and it's architecturally aligned with Supabase (PostgREST over HTTP). The type safety gap is addressed on the frontend via TypeScript (the API client types define what the frontend expects) and on the backend via Pydantic response models (the schemas define what the API returns). You get the contract safety without the migration cost.

---

## CRA → Vite Migration Plan

This is the highest-risk single step in the refactor.

### What changes

| Item | CRA | Vite |
|------|-----|------|
| Dev command | `react-scripts start` (port 3000) | `vite` (port 5173) |
| Build command | `react-scripts build` | `vite build` |
| Entry point | `src/index.js` renders into `public/index.html` | `src/main.tsx` referenced by root `index.html` |
| Env var prefix | `REACT_APP_*` | `VITE_*` |
| HTML location | `public/index.html` | `frontend/index.html` (project root) |
| `%PUBLIC_URL%` in HTML | Resolved by CRA | Not supported — use `/` or `import.meta.env.BASE_URL` |
| CSS processing | Built-in PostCSS | Built-in PostCSS (same) |
| Tailwind | Works via PostCSS | Works via PostCSS (same config) |
| `require()` | Supported | Not supported (ESM only) |
| `process.env` | Injected at build | `import.meta.env` |

### Step-by-step migration

1. **Install Vite + React plugin + TypeScript**: `npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom`
2. **Create `vite.config.ts`** at `frontend/` root.
3. **Create `tsconfig.json`** at `frontend/` root (see TypeScript section).
4. **Create `frontend/index.html`** — move from `public/index.html`, add `<script type="module" src="/src/main.tsx">`, replace `%PUBLIC_URL%` with `/`.
5. **Rename `src/index.js` → `src/main.tsx`**, remove `reportWebVitals()`.
6. **Rename all `.js`/`.jsx` source files → `.ts`/`.tsx`**.
7. **Replace `process.env.REACT_APP_*` with `import.meta.env.VITE_*`** in `lib/supabase.ts`, `lib/api.ts`.
8. **Update `.env`** with `VITE_`-prefixed vars.
9. **Update `package.json` scripts**: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"preview": "vite preview"`.
10. **Remove `react-scripts`** from dependencies.
11. **Add `src/vite-env.d.ts`** with `/// <reference types="vite/client" />`.
12. **Update Playwright config** `webServer` to point at `vite` instead of `react-scripts start`.
13. **Run tests and verify build**.

### What could break

- **Environment variables**: Highest risk. If any `REACT_APP_` reference is missed, it will be `undefined` at runtime. Grep for `REACT_APP_` and `process.env` across all source files.
- **`require()` calls**: Not used in this codebase (confirmed by audit). Not a risk.
- **Playwright config**: Dev server port changes from 3000 to 5173.
- **CORS**: Backend's `allow_origins` must include `http://localhost:5173` for local dev.

### How to verify

1. `npm run build` succeeds with no TypeScript errors.
2. The built app loads and renders correctly.
3. All Playwright tests pass.
4. `grep -r "process.env" src/` returns zero hits.
5. `grep -r "REACT_APP_" src/` returns zero hits.

---

## Supabase Posture

- The baseline migration `supabase/migrations/20260329000000_initial_schema.sql` captures the current schema and is **immutable**.
- During the refactor, any schema change must be a **new migration file** with a later timestamp.
- **No schema changes are proposed in this refactor.**
- RLS policies are comprehensive and correct. The refactor does not touch them.
- Note: The service role key bypasses RLS. The backend's ownership checks are the primary authorization mechanism. This is documented in `CLAUDE.md`.

---

## Deployment: Vercel + Railway

### Why this combination

| Concern | Vercel + Railway | Supabase Edge Functions |
|---------|-------------------|------------------------|
| Language support | Python (your entire backend) | Deno/TypeScript only |
| PDF processing | PyMuPDF runs natively | No native PDF parsing — would need external service |
| Gemini integration | `google-generativeai` Python SDK works | Would need Deno equivalent + rewrite all AI calls |
| Background tasks | FastAPI BackgroundTasks work | 150s timeout limit, no background execution |
| Migration effort | Zero code changes | Full backend rewrite (~3,500 lines) |
| Cost (prototype) | $0-5/month | $0 (free tier) or $25/month (Pro) |

**Decision**: Vercel (frontend) + Railway (backend). Your Python backend runs as-is with zero code changes. Deployment is connecting GitHub repos to each platform and setting env vars.

### Vercel (frontend)

- Connect `frontend/` as a Vite project. Vercel auto-detects the framework.
- Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` as environment variables in Vercel's dashboard.
- Every push to `main` triggers a build and deploy.
- Preview deployments for every PR.
- **Cost**: Free (Hobby plan). 100GB bandwidth/month, unlimited deployments.

### Railway (backend)

- Connect `backend/` as a Python project. Railway detects FastAPI via `requirements.txt`.
- Set all backend env vars in Railway's dashboard.
- Railway runs `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
- **Cost**: Free trial ($5 credit). After trial, usage-based pricing — approximately $5/month for a small FastAPI app.

### When to revisit

- If traffic grows significantly (thousands of concurrent users), consider containerized deployment on Fly.io or AWS.
- If you want everything on one platform, consider moving the frontend to Railway as well (they support static sites).
- If background task reliability becomes a problem, add a database-backed queue (`saq` with your existing Postgres) — no new service needed.

---

## Testing Strategy

### Playwright (E2E) — Primary Safety Net

Playwright tests are the safety net for the refactor. Before every structural change, confirm the baseline is green. After the change, confirm it's still green.

**Current coverage**: Good for happy paths across auth, landing, student, and teacher flows.

**Changes during refactor**:
- Update `webServer` config to use `vite` dev server.
- Update dev server port from 3000 to 5173.
- No new test cases — the goal is preserving existing behavior.

### Backend pytest — Existing, Maintained

The 1,622-line pytest suite covers all routers with mocked DB and auth. No changes during refactor except import path updates when schemas are extracted.

### TypeScript compilation as a test

With `strict: true` in `tsconfig.json`, the TypeScript compiler catches:
- Mismatched API response shapes
- Missing or wrong props passed to components
- Undefined variables, null/undefined access
- Incorrect function argument types

This runs as part of `npm run build` (`tsc -b && vite build`). If TypeScript errors exist, the build fails. This is a free safety net that didn't exist before.

---

## Background Tasks

**Decision: Keep FastAPI BackgroundTasks.**

The current approach works for a prototype. Gemini calls complete in 5-30 seconds. The server-restart-during-task scenario is rare. When deployed to Railway, zero-downtime deployments reduce the restart window.

**When to revisit**: If users report missing reading guides or if you add longer-running tasks. At that point, `saq` (a lightweight async task queue backed by Postgres or Redis) would be the cheapest upgrade — it uses your existing Postgres, no new service needed.

---

*End of Phase 2 Architecture Proposal (revised). Each section explains the recommendation, the alternatives considered, and the reasoning tied to this specific codebase.*
