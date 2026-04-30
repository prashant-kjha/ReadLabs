# ReadLabAI

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

Copy `.env.example` and fill in:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `VITE_SUPABASE_URL` | Same Supabase URL (for frontend) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (for frontend) |
| `VITE_API_URL` | Backend API URL |

## Testing

```bash
# Frontend E2E tests (104 tests, mocked API)
cd frontend && npx playwright test

# Backend unit tests
cd backend && pytest
```

## Deployment

- **Frontend**: Deploy `frontend/` to Vercel — `vercel.json` included for SPA routing
- **Backend**: Deploy `backend/` to Railway using the included `Dockerfile`
- Set environment variables on both platforms

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

## License

Private — all rights reserved.
