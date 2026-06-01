# ReadLabs

AI-guided research paper reading tool for students. Teachers upload papers, Gemini generates reading guides with guiding questions and checkpoints, and students read interactively with real-time AI feedback, jargon lookup, and comprehension quizzes. Hosted at [readlabs.org](readlabs.org)

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
- A free [Supabase](https://supabase.com) project (see schema setup below)
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)

**Apply the schema** to your Supabase project — either:
- Run `supabase db push --linked` after `supabase link --project-ref <ref>` ([Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)), **or**
- Paste each file in `supabase/migrations/` into the Supabase Dashboard → SQL Editor in chronological order.

### Backend

```bash
cd backend
cp ../.env.example .env       # fill in Supabase, Gemini, CORE keys
pip install -r requirements.txt
uvicorn main:app --reload     # http://localhost:8000
```

### Frontend

```bash
cd frontend
cp .env.example .env.local    # fill in VITE_* vars
npm install
npm run dev                   # http://localhost:3000
```

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
| `SENTRY_DSN` | Backend error monitoring (optional, leave empty to disable) |
| `ALLOWED_ORIGINS` | CORS origins, comma-separated (prod only) |
| `ENVIRONMENT` | `development` or `production` |

**Frontend (`frontend/.env.local`):**

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Same Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_URL` | Backend API URL (`http://localhost:8000` for dev) |
| `VITE_SENTRY_DSN` | Frontend error monitoring (optional, leave empty to disable) |

## Testing

```bash
# Frontend E2E tests (Playwright, mocked API — runs on chromium, mobile, tablet)
cd frontend && npx playwright test

# Backend unit tests
cd backend && pytest
```

CI runs both suites on every PR via GitHub Actions (see [`.github/workflows/`](.github/workflows/)).

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

## Operational Hygiene

### Cleaning up old PDFs

Uploaded PDFs accumulate in Supabase Storage over time. A standalone script
deletes papers (and their PDFs) once they have been inactive for a configurable
window — by default, 90 days since the most recent assignment activity.

```bash
# Preview what would be deleted (no changes):
python -m backend.scripts.cleanup_old_papers --dry-run --verbose

# Actually delete papers inactive for 90+ days:
python -m backend.scripts.cleanup_old_papers --days 90
```

Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment.
Wire it to Cloud Scheduler, a GitHub Actions cron, or run it manually — it
exits after a single pass. Deleting a paper row cascades to all dependent
rows (assignments, sessions, responses) via `ON DELETE CASCADE`.

### Keeping PyMuPDF current

PDF parsing happens via PyMuPDF (`fitz`), which wraps the MuPDF C library.
Malformed-PDF parser CVEs do occur upstream, so bump the pinned version in
`backend/requirements.txt` quarterly and rebuild the backend image. Check the
[PyMuPDF changelog](https://pymupdf.readthedocs.io/en/latest/changes.html)
for security notes before upgrading.

### Copyright takedown

Reports route to `legal@readlabs.org`, referenced in
`frontend/src/pages/TermsPage.tsx` and both footers (`LandingPage.tsx`,
`Layout.tsx`). This address is a Cloudflare Email Routing alias that forwards to
the operator's inbox. If you operate in the US and want DMCA safe-harbor
protection, register a Designated Agent with the US Copyright Office.

## Contributing

Bug reports and PRs welcome. Please open an issue first for any non-trivial
change so we can discuss the approach.

## License

[MIT](LICENSE) © 2026 Prashant Jha
