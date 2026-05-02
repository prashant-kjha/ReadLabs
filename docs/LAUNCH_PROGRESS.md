# ReadLabAI Launch Progress Tracker

**Last Updated:** 2026-05-01
**Target Launch:** TBD

---

## Phase 1: Codebase Cleanup (Before GitHub)

- [ ] 1.1 Remove 7 stale worktree branches (`worktree-agent-*`, `worktree-feature+superpowers`)
- [x] 1.2 Strengthen `.gitignore` (added `.env.*` pattern with `.env.example` allow-list; existing entries already cover `.claude/`, `.playwright-mcp/`, `.superpowers/`, `playwright-report/`, `test-results/`, `landing-*.png`)
- [ ] 1.3 Audit git history for secrets (`git log --all -p -- "*.env*"`) — current `.env` files are not tracked, but verify no key ever leaked in history
- [x] 1.4 ~~Remove `frontend/.env` from tracking~~ — confirmed never committed
- [ ] 1.5 Clean root directory (remove or `.gitignore` the `landing-*.png` screenshots)
- [ ] 1.6 Verify no service role keys or JWT secrets appear anywhere in history

## Phase 2: Deployment Platform Setup

- [ ] 2.1 Choose platform (recommended: **Render** — free static site + free backend with spin-down)
- [ ] 2.2 Create Dockerfile for FastAPI backend
- [ ] 2.3 Create `render.yaml` (or equivalent config) for deployment
- [ ] 2.4 Set up environment variables on the platform (Supabase, Gemini, CORE API keys) — **must include `ENVIRONMENT=production`** so the new startup secret check fires and exception details stay hidden
- [ ] 2.5 Configure build command for React frontend (`npm run build`)
- [ ] 2.6 Set up separate Supabase project for production (or isolate with different keys)
- [ ] 2.7 Verify CORS `allowed_origins` points to production domain (currently hardcoded to `http://localhost:3000` in `backend/main.py`)
- [ ] 2.8 Configure `slowapi` storage for production — switch from in-memory to Redis (`SLOWAPI_STORAGE_URI=redis://...`) if running multi-instance
- [ ] 2.9 Test deployment end-to-end (signup → email confirm → signin → upload paper → read paper)

## Phase 3: Frontend Redesign

- [ ] 3.1 Send design prompt to Claude (web) and iterate on Landing Page
- [ ] 3.2 ~~Design Auth Page (login/signup with role selection)~~ — **role selector removed**; signup is student-only and shows "Check your email" confirmation panel after submit
- [ ] 3.3 Design Layout shell (navbar, theme toggle, user menu)
- [ ] 3.4 Design Student Dashboard (assigned papers list with progress)
- [ ] 3.5 Design Reading Page (three-panel: sections | PDF | AI guidance)
- [ ] 3.6 Design Teacher: Papers Page (upload + paper grid)
- [ ] 3.7 Design Teacher: Classes Page (class cards with join codes)
- [ ] 3.8 Design Teacher: Dashboard (class-specific overview + stats)
- [ ] 3.9 Design Teacher: Assign Paper Page (assignment form)
- [ ] 3.10 Design Teacher: Assignment Review Page (student progress table)
- [ ] 3.11 Design Student: Self-Study Page (paper library + search)
- [ ] 3.12 Bring all designs back to Claude Code for integration (routing, state, API wiring)

## Phase 4: Branding

- [ ] 4.1 Decide on final project name (ReadLabAI or new name)
- [ ] 4.2 Purchase domain name
- [ ] 4.3 Design or commission logo (SVG wordmark/monogram or full logo)
- [ ] 4.4 Create favicon and app icons from logo
- [ ] 4.5 Update all references to project name in codebase (package.json, title tags, landing page)
- [ ] 4.6 Choose brand colors if changing from current indigo palette

## Phase 5: GitHub Preparation

- [ ] 5.1 Write a proper README.md (project description, setup instructions, screenshots)
- [ ] 5.2 Add LICENSE file (MIT recommended for open source)
- [ ] 5.3 Add CONTRIBUTING.md (if accepting contributions)
- [ ] 5.4 Squash/rebase feature branches, clean up branch structure
- [ ] 5.5 Ensure `main` branch is the default
- [ ] 5.6 Create GitHub repository (start private, make public when ready)
- [ ] 5.7 Push clean codebase
- [ ] 5.8 Add repo badges to README (license, tech stack, deployment status)

## Phase 6: Production Hardening (Security Review — 2026-05-01)

### Done in security review (2026-05-01)

- [x] 6.S1 Hardcode signup `role` to `student` (privilege escalation fix); teachers must be promoted manually via Supabase dashboard
- [x] 6.S2 Switch signup to public `/auth/v1/signup` endpoint — email confirmation now required before sign-in
- [x] 6.S3 IDOR fix on `GET /papers/{id}/pdf-url` — student must own paper or have a session for it
- [x] 6.S4 Cross-tenant data leak fix in `/dashboard/.../insights` — checkpoint responses scoped to sessions for the requested assignment only
- [x] 6.S5 `/library/browse` now scoped to caller's own papers
- [x] 6.S6 JWT algorithm allowlist tightened to `["RS256", "ES256"]` (HS256 removed)
- [x] 6.S7 Class codes generated via `secrets.choice` (CSPRNG) instead of `random`
- [x] 6.2 Rate limiting added (`slowapi`) on auth + AI endpoints (signup 5/h, signin 10/min, jargon/keyterm 60/min, checkpoint 30/min, sowhat 20/min, uploads 10/h, quiz generate 10/h)
- [x] 6.S8 Prompt-injection hardening — untrusted input wrapped in delimiter tags + sanitization + system instruction in every AI prompt
- [x] 6.S9 Pydantic settings: `extra = "forbid"` (typo'd env vars now error at startup); production-only required-secret check in `get_settings()`
- [x] 6.4 PDF upload size limit (20 MB) — already enforced in `papers.py` and `library.py`

### Still to do

- [ ] 6.1 Lock CORS to production domain only (currently hardcoded `http://localhost:3000`); wire `settings.allowed_origins` into `app.add_middleware`
- [ ] 6.3 Add error monitoring (Sentry or equivalent) — wire DSN into FastAPI and React
- [ ] 6.5 Audit Supabase RLS policies on every table (note: backend uses `service_role` which bypasses RLS, so policies are only the safety net for direct client→Supabase access; verify storage bucket `papers` is **private**, not public)
- [ ] 6.6 Set Gemini API spending caps on Google Cloud billing
- [ ] 6.7 Verify HTTPS everywhere (handled by platform, but confirm)
- [ ] 6.8 Add loading state for backend cold starts ("Waking up..." message)
- [ ] 6.9 Test all user flows in production environment
- [ ] 6.10 Configure Supabase Auth email templates (confirmation email subject/body, redirect URL pointing at `/auth?confirmed=1` or similar)
- [ ] 6.11 Decide and document the teacher-onboarding path (manual SQL? invite codes? allow-listed domains?) — currently a manual `UPDATE user_profiles SET role='teacher' WHERE ...`
- [ ] 6.12 Handle the email-confirmation redirect on the frontend (right now the user clicks the link from email and lands on Supabase; ideally redirect them back to `/auth` with a success state)
- [ ] 6.13 Reconcile schema drift in `library.py` — code references `core_id`, `is_self_study`, `category`, `authors`, `year_published` columns that don't exist in `supabase/migrations/20260329000000_initial_schema.sql`; either add the columns in a new migration or remove the dead code paths
- [ ] 6.14 Update test suite to match new auth contract (frontend Playwright + backend pytest) — see "Testing" section below

### Testing follow-ups (2026-05-01)

- [x] T.1 Update `frontend/tests/auth.spec.js` to remove role-selector assertions
- [x] T.2 Update `frontend/tests/auth-extended.spec.js` to test the "check your email" success state instead of auto-redirect after signup
- [x] T.3 Update `frontend/tests/helpers.js` `mockAuthRoutes` to return the new `{user_id, email_confirmation_required}` shape
- [x] T.4 Update `backend/tests/test_auth.py` — invert `test_signup_accepts_teacher_role` to confirm role is *not* honored, fix `test_signup_rejects_invalid_role` (no longer relevant — role field removed from schema)
- [x] T.5 Ran the full Playwright + pytest suite — 300 Playwright tests pass, 79 pytest tests pass (3 pre-existing pytest failures fixed: dashboard-insights mock updated to match new query order, jargon test renamed and updated to expect synchronous response, pdf-url test rewritten with new ownership-check mock + new test for the unauthorized case)

## Phase 7: Launch

- [ ] 7.1 Final QA pass on all pages and user flows
- [ ] 7.2 Test on multiple browsers (Chrome, Firefox, Safari, Edge)
- [ ] 7.3 Test on mobile/tablet (responsive layouts)
- [ ] 7.4 Set up analytics (Plausible, Umami, or similar privacy-friendly option)
- [ ] 7.5 Make GitHub repo public
- [ ] 7.6 Announce launch (social media, Product Hunt, education forums)
- [ ] 7.7 Monitor error logs and user feedback for first 48 hours

---

## Notes

- **Deployment platform research** completed 2026-04-22. Top pick: Render (free tier). Backup: Railway ($5/mo), Koyeb (free nano instance).
- **Frontend redesign** will use Claude (web) for design generation, then Claude Code for integration. Design prompt is ready.
- **Current tech stack**: React 19 + Tailwind CSS + FastAPI + Supabase + Google Gemini API + slowapi (rate limiting)
- **Project name** is undecided — ReadLabAI is the working name, may change before launch.
- **Security review** completed 2026-05-01. 11 issues identified, all fixed. See "Phase 6 / Done in security review" above.
- **Teacher provisioning** is now an explicit manual step. To create a teacher account: have the user sign up normally (they'll come up as `student`), then in the Supabase SQL editor run `UPDATE user_profiles SET role='teacher' WHERE user_id = '<their-uuid>'`. Document this when adding 6.11.
