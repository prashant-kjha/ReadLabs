# ReadLabs

AI-guided research paper reading tool for students. Teachers upload papers, Gemini generates reading guides with guiding questions and checkpoints, and students read interactively with real-time AI feedback, jargon lookup, and comprehension quizzes.

## Tech Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite + Tailwind CSS
- **Backend**: FastAPI (async Python) with custom PostgREST query builder
- **Database/Auth**: Supabase (Postgres + Auth + RLS + Storage)
- **AI**: Google Gemini 2.5 Flash
- **State**: Zustand (reading page), React state (simple pages)

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- A Supabase project with the migration applied
- A Google Gemini API key

### Backend

```bash
cd backend
cp ../.env.example .env   # fill in your keys
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
cp ../.env.example .env   # fill in VITE_ vars
npm install
npm run dev
```

Open http://localhost:3000

### Environment Variables

The backend reads `backend/.env`; the frontend reads `frontend/.env.local`.
See [`frontend/.env.example`](frontend/.env.example) for the frontend template.

**Backend (`backend/.env`):**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `CORE_API_KEY` | CORE.ac.uk key (optional, for paper search) |
| `ALLOWED_ORIGINS` | CORS origins, comma-separated (prod only) |
| `ENVIRONMENT` | `development` or `production` |

**Frontend (`frontend/.env.local`):**

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Same Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_URL` | Backend API URL (`http://localhost:8000` for dev) |

## Testing

```bash
# Frontend E2E tests (104 tests, mocked API)
cd frontend && npx playwright test

# Backend unit tests
cd backend && pytest
```

## Deployment

ReadLabs runs entirely on free tiers:

- **Frontend** → Cloudflare Pages (Vite static build)
- **Backend** → Google Cloud Run (FastAPI in Docker)
- **DB / Auth / Storage** → Supabase
- **AI** → Google Gemini

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full step-by-step
self-hosting guide.

## Project Structure

```
backend/
  main.py              # FastAPI app + middleware
  routers/             # API route handlers
  schemas/             # Pydantic request/response models
  ai_provider.py       # Gemini AI integration
  db.py                # DB query builder + storage helpers

frontend/
  src/
    pages/             # Route pages (teacher/ + student/)
    components/        # Shared + reading components
    hooks/             # Zustand store (useReadingStore)
    lib/               # API client, Supabase client, superpowers API
    context/           # Auth + Theme context providers
    types/             # TypeScript type definitions

supabase/migrations/   # SQL migration files
```

## Contributing

Bug reports and PRs welcome. Please open an issue first for any non-trivial
change so we can discuss the approach.

## License

[MIT](LICENSE) © 2026 Prash
