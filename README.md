# ReadLabs

AI-guided research paper reading tool for students. Teachers upload papers, Gemini generates reading guides with guiding questions and checkpoints, and students read interactively with real-time AI feedback, jargon lookup, and comprehension quizzes. Hosted at [readlabs.org](readlabs.org)

## Features

**Core reading workflow**
- Teachers upload papers (PDF or via CORE search); Gemini generates a structured reading guide — sections, guiding questions, key terms, and a comprehension quiz.
- Students read with section-by-section AI checkpoint feedback, a "So What?" synthesis prompt, inline jargon / key-term lookup, and quizzes.
- XP, streaks, and levels keep students engaged; teachers get a per-class progress dashboard.

**Landmark Library** — a pre-seeded, browseable collection of classic papers (live in production)
- **149 landmark papers** with **440 pre-generated reading guides** — up to three difficulty levels each (beginner / intermediate / advanced), generated once with Gemini 2.5 Pro via Vertex AI. Students read the pre-built guide directly, so there is **zero per-read AI cost**.
- Students browse `/student/library` (title search + difficulty picker), start reading instantly, see a "Start with a classic" featured row on the dashboard, and track progress with a **My Progress** summary (started / completed counts, filter chips, and a "Continue reading" CTA).
- Teachers browse `/teacher/library` and **assign a landmark paper to a class** — the pre-built guide, critical prompts, and quiz are copied to a class assignment instantly, no generation needed.

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
| `GEMINI_API_KEY` | Google Gemini API key (used when `AI_PROVIDER=studio`) |
| `AI_PROVIDER` | `studio` (API key — default/local) or `vertex` (project billing via ADC — production) |
| `GCP_PROJECT_ID` | GCP project id (required when `AI_PROVIDER=vertex`) |
| `GCP_REGION` | Vertex AI region, e.g. `us-central1` (used when `AI_PROVIDER=vertex`) |
| `CORE_API_KEY` | CORE.ac.uk key (optional, for paper search) |
| `LANDMARK_USER_ID` | Supabase user id of the landmark-library service account; scopes the `/library/landmark*` endpoints. **Required in production** (leave unset locally to disable the library). |
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

### Google sign-in

"Continue with Google" on the auth page uses Supabase's OAuth flow
(`signInWithOAuth` → `/auth/callback` → `POST /api/v1/auth/oauth/profile`).
First-time Google users get a `user_profiles` row created as a **student**
(same gate as email signup); teachers are still provisioned manually.

One-time provider setup (the button shows a Supabase error until this is done):

1. **Google Cloud console** → APIs & Services → Credentials → *Create OAuth
   client ID* (type: Web application):
   - Authorized JavaScript origins: `https://readlabs.org`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. **Supabase dashboard** → Authentication → Providers → Google: enable, paste
   the client ID + secret from step 1.
3. **Supabase dashboard** → Authentication → URL Configuration: add
   `https://readlabs.org/auth/callback` to the redirect allow-list.

For local dev, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` /
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in your shell before `supabase start`
(see `[auth.external.google]` in `supabase/config.toml`).

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

### Seeding / refreshing the landmark library

The landmark library is populated by
[`backend/scripts/seed_landmark_library.py`](backend/scripts/seed_landmark_library.py),
which downloads papers from arXiv, generates up to three difficulty-level
reading guides each (Gemini 2.5 Pro via Vertex AI), and writes them as
`published` self-study assignments owned by the `LANDMARK_USER_ID` service
account. It is **idempotent per difficulty** — safe to re-run to fill gaps
(e.g. papers added to the source list later) without creating duplicates. It
needs Vertex AI credentials (`gcloud auth application-default login`, or a
short-lived user-managed key for the runtime service account — create and
delete it each run). Source paper list:
[`backend/data/landmark_papers.json`](backend/data/landmark_papers.json).

The seeding script stores each paper's **extracted text only**, so the PDF
viewer has nothing to render until
[`backend/scripts/backfill_landmark_pdfs.py`](backend/scripts/backfill_landmark_pdfs.py)
has been run. It downloads each landmark paper's PDF from arXiv, uploads it to
the `papers` Storage bucket under `landmark/<paper_id>.pdf`, and fills in
`papers.pdf_path`. Only rows with `pdf_path IS NULL` are touched, so it is
idempotent and resumable — re-run it to pick up new papers or retry failures.
It needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `LANDMARK_USER_ID`
(no AI credentials):

```bash
# from the repo root
python -m backend.scripts.backfill_landmark_pdfs --dry-run   # preview
python -m backend.scripts.backfill_landmark_pdfs --limit 5   # try a few first
python -m backend.scripts.backfill_landmark_pdfs             # full run
```

Papers with no PDF (a failed backfill, or a CORE-fetched paper that has no PDF
at all) are not an error state: `GET /papers/{id}/pdf-url` answers `{"url":
null}` and the reading page shows a "No PDF available" panel alongside the
reading guide.

## Contributing

Bug reports and PRs welcome. Please open an issue first for any non-trivial
change so we can discuss the approach.

## License

[MIT](LICENSE) © 2026 Prashant Jha
