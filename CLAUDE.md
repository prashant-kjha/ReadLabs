# ReadLabs

AI-guided research paper reading tool for students. Teachers upload papers, Gemini generates reading guides with sections and guiding questions, and students read with AI-powered checkpoints, jargon lookup, and quizzes.

## Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite + Tailwind CSS + React Router v6
- **Backend**: FastAPI (async Python) with custom async PostgREST query builder
- **Database/Auth**: Supabase (Postgres + Auth + RLS + Storage)
- **AI**: Google Gemini 2.5 Flash for reading guides, feedback, quizzes
- **State**: Zustand for complex page state (reading page), React state for simple pages
- **Testing**: Playwright (E2E, mocked API) + pytest (backend, mocked DB)

## Key Paths

- `frontend/src/pages/teacher/` — Teacher pages (dashboard, papers, classes, assignments)
- `frontend/src/pages/student/` — Student pages (dashboard, self-study, reading)
- `frontend/src/hooks/useReadingStore.ts` — Zustand store for reading page state
- `frontend/src/lib/api.ts` — Typed API client (Axios) with auto-auth
- `backend/routers/` — FastAPI route handlers
- `backend/schemas/` — Pydantic request/response models
- `backend/ai_provider.py` — Gemini AI integration (lazy-initialized model)
- `backend/db.py` — Shared DB helpers (query builder, storage headers)
- `supabase/migrations/` — SQL migration files

## Commands

```bash
# Frontend
cd frontend && npm run dev      # Vite dev server on :3000
cd frontend && npm run build    # Production build
cd frontend && npx playwright test  # E2E tests (327)

# Backend
cd backend && uvicorn main:app --reload  # Dev server on :8000
cd backend && pytest                      # Unit tests
```

## Architecture Notes

- API client uses Axios interceptors for 401 auto-refresh
- Zustand store handles all reading page state including polling for AI feedback
- ErrorBoundary wraps the app; RoleRoute guards role-based access
- Backend uses lazy Gemini model init to avoid startup side effects
- `asyncio.get_running_loop()` instead of deprecated `get_event_loop()`
- Reading page has 3-panel layout: sections sidebar | PDF viewer | AI guidance panel
