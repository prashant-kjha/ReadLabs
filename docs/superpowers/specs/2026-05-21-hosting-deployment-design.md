# Hosting & Open-Source Deployment Design

**Date**: 2026-05-21
**Author**: Prash
**Status**: Approved (sections 1-2)

## Goal

Make ReadLabAI an open-source project on GitHub with a publicly hosted live demo,
using only free tiers across all platforms. Allow contributors to fork the repo
and stand up their own instance with minimal friction.

## Decisions

| Question | Choice | Reasoning |
|---|---|---|
| Backend host | Google Cloud Run | Scales to zero; 2M req/month free; best free headroom |
| Repo layout | Monorepo | One README, one issue tracker, matches current layout |
| Deploy trigger | Auto from `main` (GitHub Actions for backend, native Cloudflare for frontend) | Standard OSS workflow with PR previews |
| Supabase | Separate prod project | Isolates prod data from dev experiments |
| Domain | Free subdomains (`*.pages.dev`, `*.run.app`) | Zero DNS setup; custom domain trivial to add later |
| Migrations | Manual `supabase db push` from laptop | Guards against accidental destructive migrations |
| License | MIT | Permissive default; expected for student/portfolio OSS |

## Architecture

Three providers, each doing what they do best:

- **Cloudflare Pages** serves the Vite static build from a global CDN.
- **Google Cloud Run** runs the FastAPI server in a Docker container, scales to
  zero when idle, reads secrets from Google Secret Manager.
- **Supabase** provides Postgres, Auth, and Storage. The browser talks to it
  directly for auth and PDF downloads; the backend talks to it via service-role
  key for trusted operations.

Request flow:

1. Browser hits `readlabai.pages.dev` → CDN serves static assets.
2. React app calls Supabase directly for login and signed PDF URLs.
3. React app calls Cloud Run at `https://readlabai-api-xxx.run.app/api/v1/...`
   for business logic + Gemini calls.
4. Cloud Run calls Supabase PostgREST/Storage with service-role key, and calls
   Gemini with API key. Both secrets injected from Secret Manager at boot.

## Files Created

### Backend (Cloud Run)
- `backend/Dockerfile` — multi-stage Python 3.12-slim, uvicorn on `$PORT`
- `backend/.dockerignore` — excludes tests, caches, local env files
- `backend/main.py` — CORS reads from `settings.allowed_origins`

### Frontend (Cloudflare Pages)
- `frontend/.env.example` — documents required `VITE_*` vars
- `frontend/public/_headers` — CSP + security headers
- `frontend/public/_redirects` — SPA fallback for React Router

### CI/CD
- `.github/workflows/backend-deploy.yml` — build + push image + `gcloud run deploy` on push to `main` touching `backend/**`. Uses Workload Identity Federation (no static service-account JSON).
- `.github/workflows/backend-test.yml` — pytest on every PR.
- `.github/workflows/frontend-test.yml` — typecheck + Playwright on every PR. (Cloudflare Pages builds the frontend itself.)

### OSS hygiene
- `LICENSE` — MIT
- `README.md` — adds live demo, screenshots placeholder, deploy-your-own link
- `docs/DEPLOYMENT.md` — step-by-step for self-hosters
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

## Out of Scope (v1)

- Custom domain (easy follow-up; one env var + DNS records)
- Staging environment (single prod env suffices for solo OSS project)
- Database backup automation (Supabase does daily backups on free tier)
- Sentry / observability beyond Cloud Run's built-in logs
- Auto-applied migrations
