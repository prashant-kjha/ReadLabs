# Codebase Cleanup — Design Spec

**Date:** 2026-05-02
**Branch (target):** `cleanup/2026-05-02` in worktree `../ReadLabAI-cleanup`
**Author:** Claude (Opus 4.7) under user direction
**Status:** awaiting user review before implementation

---

## 1. Why this exists

Three audit cycles have already shipped in the past four days:

- **Apr 29-30 refactor** (9 steps, 7 commits): TypeScript, Vite, Zustand store, ErrorBoundary, RoleRoute, lazy Gemini init, async deprecation, schema extraction, dead-code removal.
- **May 1 security review** (11 fixes): JWT alg allowlist, signup role hardcoded to student, IDOR on PDF URLs, cross-tenant insights leak, CSPRNG class codes, rate limiting, prompt-injection hardening, Pydantic settings hardening, PDF size limit.
- **May 1 feature audit** (6 fixes): jargon term passing, `/superpowers/recommendations` rewrite, self-study Start button, library/categories removal, `core_id` migration, library/upload form cleanup.

Despite all that, several items from the original `docs/refactor/01-audit.md` were explicitly deferred and never came back. This spec closes those out, plus a small set of reliability and testing gaps surfaced during a fresh review on 2026-05-02.

**Out of scope:** Phase 6 launch blockers (CORS production domain, Sentry, RLS policy audit, Gemini spend caps, email-confirmation redirect handling). Those need decisions and credentials only the user can supply.

---

## 2. Goals

1. Pay down the deferred architectural debt the user already knows about.
2. Close two reliability bugs (JWKS cache TTL, session-start race).
3. Add response-model contracts to the highest-bug-risk endpoints.
4. Add tests proving the recent fixes hold AND covering the new code (rate limiter, response models).
5. Add a baseline accessibility scan and mobile/tablet viewport coverage so the user has a fix list before launch.

**Non-goals:** Live integration tests against real Supabase/Gemini, load testing, browser-matrix testing, design-system overhaul, mobile-first redesign of the reading page.

---

## 3. The fixes (six commits)

### Commit 1 — `refactor(backend): replace dual Supabase client with async db.from_() in background tasks`

**Files:** `backend/routers/sessions.py`, `backend/routers/superpowers.py`, `backend/requirements.txt`

**Problem:** Background-task helpers `_run_checkpoint_feedback`, `_run_sowhat_feedback`, `_run_jargon_explanation` (all in `sessions.py`) and module-level imports in `superpowers.py` use the synchronous `supabase-py` client wrapped in `asyncio.to_thread`. The rest of the backend uses the custom async `db.from_()` helper from `db.py`. This was anti-pattern #2 in the original audit, deferred during the Apr 29-30 refactor.

**Fix:**
```python
# Before
from supabase import create_client as _sc
supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
await asyncio.to_thread(
    lambda: supa.table("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()
)

# After
db = get_db()
await db.from_("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()
```

`get_db()` is a global singleton — no `Depends()` required. Drop `supabase==2.x` from `requirements.txt`.

**Tests:** Existing `backend/tests/test_sessions.py` covers the background-task call paths via mocks. Run pytest after change to confirm no regression.

---

### Commit 2 — `refactor(backend): collapse require_teacher/require_student into require_role factory`

**Files:** `backend/deps.py`, every router that imports the old helpers (`auth.py`, `papers.py`, `classes.py`, `assignments.py`, `enrollment.py`, `sessions.py`, `dashboard.py`, `library.py`, `superpowers.py`)

**Problem:** `require_teacher` and `require_student` in `deps.py:78-103` are byte-identical except for the role string.

**Fix:**
```python
def require_role(role: str):
    async def _check(
        user: dict = Depends(get_current_user),
        db = Depends(get_db),
    ) -> dict:
        user_id = user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        result = await db.from_("user_profiles").select("role").eq("user_id", user_id).single().execute()
        if hasattr(result, "error") and result.error:
            raise HTTPException(status_code=500, detail="Database error checking role")
        if not result.data:
            raise HTTPException(status_code=403, detail="User profile not found")
        if result.data.get("role") != role:
            raise HTTPException(status_code=403, detail=f"{role.capitalize()} access required")
        return user
    return _check

require_teacher = require_role("teacher")
require_student = require_role("student")
```

Public API unchanged — call sites do not need updating.

**Tests:** Existing pytest covers both role paths. Add one new test (`test_role_factory_rejects_wrong_role`) asserting a teacher token is rejected on a student-only endpoint.

---

### Commit 3 — `refactor(backend): move module-level settings/headers into request scope`

**Files:** `backend/db.py`, `backend/deps.py`, `backend/routers/auth.py`, plus any router with `settings = get_settings()` at module level (`papers.py`, `classes.py`, `sessions.py`, `superpowers.py`, `library.py`).

**Problem:** Anti-pattern #4 from original audit. Module-level `settings = get_settings()` makes settings hard to override in tests. Also `ANON_HEADERS` is still defined at module scope in `auth.py:14-18` — the security-review note "removed 2 duplicate dicts" only removed `ADMIN_HEADERS`.

**Fix:** Move `get_settings()` calls inside function bodies where they're used. For headers, inline the small dicts into the two call sites (`signup`, `signin`) or move to a helper in `db.py` (`anon_auth_headers()`).

**Risk:** Touches many files but each diff is 2-3 lines. Mechanical.

**Tests:** Existing pytest covers all routers; if any test relied on module-level settings being read at import time (it shouldn't), it would surface immediately.

---

### Commit 4 — `fix(backend): tighten JWKS cache TTL, scope JWT exception handler, fix session-start race`

**Files:** `backend/deps.py`, `backend/routers/sessions.py`

**Three sub-fixes:**

**4a. JWKS cache TTL (`deps.py:19-32`):**
Currently the JWKS cache is module-level and only invalidates on verify failure. If Supabase rotates keys, every request 401s until the next failure-driven refresh. Add a 10-minute soft TTL.

```python
_JWKS_TTL_SECONDS = 600
_jwks_cache: tuple[dict, float] | None = None  # (jwks, fetched_at_monotonic)

async def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache
    now = time.monotonic()
    if not force_refresh and _jwks_cache and (now - _jwks_cache[1]) < _JWKS_TTL_SECONDS:
        return _jwks_cache[0]
    # ...fetch as before...
    _jwks_cache = (data, now)
    return data
```

On verify failure, call `_get_jwks(force_refresh=True)` and retry once before giving up.

**4b. Scope JWT exception handler (`deps.py:47`):**
Replace `except (JWTError, JWKError, Exception)` with `except (JWTError, JWKError)` only. Bare `Exception` masks programming bugs as auth failures.

**4c. Session-start race (`sessions.py:43-59`):**
The current code's flaw is treating *any* error as "duplicate, fall back to fetch." A real DB error (network, schema drift) gets silently swallowed and the user gets the wrong existing row — or worse, no row at all and a misleading 500.

Do NOT switch to a naive `upsert` with `resolution=merge-duplicates`. That would write `current_section_index: 0` over an existing in-progress session and **wipe the student's reading progress on every page reload.**

Correct fix is two parts:

(i) Extend `db.py:Result` and `QueryBuilder.execute()` to surface the HTTP status code:
```python
class Result:
    def __init__(self, data, error, status_code: int = 0):
        self.data = data
        self.error = error
        self.status_code = status_code
```

(ii) In `sessions.py:start_session`, only fall back to fetch when the error is specifically a unique-constraint violation (HTTP 409, PostgREST error `23505`):
```python
result = await db.from_("student_sessions").insert({
    "student_id": user["sub"],
    "assignment_id": body.assignment_id,
    "status": "in_progress",
    "current_section_index": 0,
}).execute()

if result.data:
    session = result.data[0]
elif result.status_code == 409:
    # Race condition or re-open — fetch existing, preserves progress
    existing = await db.from_("student_sessions") \
        .select("id, status, current_section_index") \
        .eq("student_id", user["sub"]) \
        .eq("assignment_id", body.assignment_id) \
        .single().execute()
    if not existing.data:
        raise HTTPException(status_code=500, detail="Session conflict but row not found")
    session = existing.data
else:
    raise HTTPException(status_code=500, detail=f"Failed to create session: {result.error}")
```

Drops the cargo-culted `isinstance(result.data, list)` checks at lines 51 and 59 — PostgREST always returns a list.

**Tests:**
- New `test_jwks_cache_refreshes_after_ttl` (monkeypatch time, assert refresh call count).
- New `test_session_start_race_returns_same_session` (call POST /sessions/ concurrently with same student/assignment, assert same session_id).
- New `test_session_restart_preserves_progress` (start session, advance to section 5, call POST /sessions/ again, assert `current_section_index` still 5 — guards against the upsert-clobber regression).
- New `test_session_start_db_error_surfaces` (mock DB returning 500, assert endpoint returns 500 with detail, not silently fetching wrong row).
- Existing `test_jwt_*` tests cover the scope-narrowed handler.

---

### Commit 5 — `feat(backend): add Pydantic response models for sessions/dashboard/library/superpowers`

**Files:** `backend/schemas/sessions.py`, `backend/schemas/dashboard.py` (new), `backend/schemas/library.py`, `backend/schemas/superpowers.py`, plus `response_model=` parameters on the corresponding route decorators.

**Problem:** Anti-pattern #6 from original audit. Auth has response models (`AuthResponse`, `MeResponse`, `SignupResponse`); the other ~45 endpoints return raw dicts. Frontend has no schema guarantee.

**Fix:** Add response models for the bug-prone surface only:

| Endpoint | New response model |
|---|---|
| `POST /sessions/` | `SessionStartResponse` |
| `GET /sessions/` | `list[SessionListItem]` |
| `GET /sessions/{id}` | `SessionDetailResponse` |
| `POST /sessions/{id}/checkpoint` | `CheckpointPendingResponse` |
| `POST /sessions/{id}/sowhat` | `SoWhatPendingResponse` |
| `POST /sessions/{id}/jargon` | `JargonResponse` |
| `POST /sessions/{id}/keyterm` | `KeyTermResponse` |
| `GET /dashboard/classes/{id}/progress` | `ClassProgressResponse` |
| `GET /dashboard/.../responses` | `StudentResponsesResponse` |
| `GET /dashboard/.../insights` | `AssignmentInsightsResponse` |
| `GET /library/browse` | `list[LibraryPaperResponse]` |
| `GET /library/status/{id}` | `LibraryStatusResponse` |
| `GET /superpowers/stats` | `ReadingStatsResponse` |
| `POST /superpowers/stats/xp` | `XpResultResponse` |
| `GET /superpowers/quiz/{aid}` | `list[QuizQuestionResponse]` |
| `POST /superpowers/quiz/attempt` | `QuizAttemptResponse` |
| `GET /superpowers/recommendations` | `list[RecommendationResponse]` |

**Not touching** assignments, classes, papers — they're stable, no test failures, no recent bugs. Can do in a follow-up if useful.

**Tests:** Each new model gets one assertion test (`test_*_response_matches_schema`) that the existing endpoint returns a body conforming to the model. No behavior change asserted — these are contract tests.

---

### Commit 6 — `test: cover rate limits, jargon term, session race, response shapes, a11y, mobile`

**Files:**
- `backend/tests/test_rate_limit.py` (new)
- `backend/tests/test_response_shapes.py` (new)
- `backend/tests/test_sessions.py` (extend with race test)
- `backend/tests/test_deps.py` (new — JWKS TTL, role factory)
- `frontend/tests/cleanup-verification.spec.js` (new)
- `frontend/tests/a11y.spec.js` (new)
- `frontend/playwright.config.js` (add `mobile` and `tablet` projects)
- `frontend/package.json` (add `@axe-core/playwright`)

**Backend (Level 1) — ~14 new pytest cases:**

| Test | Asserts |
|---|---|
| `test_rate_limit_signup_429` | 6th POST in an hour gets 429 |
| `test_rate_limit_signin_429` | 11th POST in a minute gets 429 |
| `test_rate_limit_jargon_429` | 61st POST in a minute gets 429 |
| `test_rate_limit_per_ip_independent` | Different `X-Forwarded-For` IPs don't share counter |
| `test_session_start_race_returns_same_session` | Concurrent POST with same student/assignment returns same id |
| `test_session_restart_preserves_progress` | Re-opening assignment doesn't reset `current_section_index` |
| `test_session_start_db_error_surfaces` | Non-409 DB error returns 500, not silent fallback |
| `test_jargon_endpoint_rejects_empty_term` | Backend returns 422 if `term` is empty/whitespace |
| `test_jwks_cache_refreshes_after_ttl` | After TTL, next request triggers refetch |
| `test_jwks_cache_refreshes_on_verify_failure` | After failed verify, cache is invalidated |
| `test_jwt_unknown_alg_rejected` | HS256 token rejected even with valid signature |
| `test_role_factory_rejects_wrong_role` | Teacher token on student endpoint → 403 |
| `test_session_response_matches_schema` | Sample of new response models |
| `test_dashboard_insights_response_matches_schema` | Sample of new response models |

**Frontend (Level 2) — ~10 new Playwright cases + a11y suite + viewport projects:**

`cleanup-verification.spec.js`:

| Test | Asserts |
|---|---|
| `jargon-lookup-sends-typed-term` | Network intercept: request body includes `term: "<value>"`, not empty |
| `recommendations-card-navigates-to-reading` | Click Start on mocked recommendation → routes to `/student/read/<assignment_id>` |
| `self-study-form-has-no-category-field` | DOM check that the removed dropdown is gone |
| `email-confirmation-panel-shown-after-signup` | Post-signup screen shows "check your email", no redirect, no token in localStorage |
| `email-not-confirmed-error-shown-on-signin` | Mock 401 with that detail → toast displays the message |
| `rate-limit-toast-shown-on-429` | Mock 429 from any rate-limited endpoint → friendly toast |
| `recommendations-empty-state-renders` | Mock empty `[]` response → empty-state UI |
| `auth-contract-no-token-on-signup` | Confirm signup response no longer includes `access_token` |
| `signin-redirects-by-role` | Teacher → `/teacher/papers`; student → `/student/dashboard` |
| `reading-page-handles-missing-assignment-id` | Bad route param shows error state, not crash |

`a11y.spec.js`:
- One test per page (landing, auth, student dashboard, teacher dashboard, papers, classes, reading, self-study)
- Each loads the page (with auth mocked where needed) and runs `AxeBuilder` from `@axe-core/playwright`
- Asserts no `serious` or `critical` violations; logs `moderate` for the user to address later

`playwright.config.js` additions:
```js
projects: [
  { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile', use: { ...devices['iPhone SE'] }, testMatch: /mobile-subset\.spec\.js$/ },
  { name: 'tablet', use: { ...devices['iPad'] }, testMatch: /mobile-subset\.spec\.js$/ },
]
```

`mobile-subset.spec.js` runs auth flow + reading page + dashboard at small viewports. Failures expected — they become the user's mobile fix list.

---

## 4. Architecture decisions

### Worktree strategy

Cleanup work happens in `../ReadLabAI-cleanup` on branch `cleanup/2026-05-02`. Six commits, each independently reviewable. No squashing. User merges (or cherry-picks) at their pace.

### No new dependencies (except testing)

The fixes above remove one dependency (`supabase`) and add one (`@axe-core/playwright` to frontend). No new backend deps.

### Test isolation

`slowapi`'s in-memory limiter is process-scoped. To test rate limits without polluting state across tests, each rate-limit test gets its own isolated limiter via dependency override or a fixture that clears `limiter._storage` between tests.

### Background tasks still use `BackgroundTasks`

Not migrating to a queue system (Celery, Dramatiq). That was anti-pattern #5 in the architecture doc as a "future hardening" — out of scope here. Current `BackgroundTasks` works for sub-30s Gemini calls; the only fix is making them use the same async DB client (Commit 1).

### Service-role-key-everywhere is unchanged

Anti-pattern #8 in the original audit — backend uses service-role key, bypassing RLS, relying on manual ownership checks. Original audit acknowledged this as a "defense-in-depth gap" not a vulnerability. Fixing it would require a deep RLS audit + switching to per-request user-scoped clients — major rewrite, out of scope.

---

## 5. Verification (definition of done)

Before declaring complete, all must pass:

1. `cd backend && pytest` — all existing 79 + ~14 new pytest cases green
2. `cd frontend && npx playwright test --project=desktop` — all existing 301 + ~10 new cases green
3. `cd frontend && npx playwright test --project=desktop a11y.spec.js` — no serious/critical violations on tested pages
4. `cd frontend && npx playwright test --project=mobile mobile-subset.spec.js` — runs (failures expected, recorded for user)
5. `cd frontend && npm run build` — Vite build succeeds, no TS errors
6. `git log --oneline cleanup/2026-05-02 ^master` — shows 6 clean commits
7. Summary written to `docs/refactor/05-cleanup-2026-05-02.md` listing what changed, what didn't, and what's still deferred

User then runs the manual smoke test in `AUDIT_2026-05-01.md` against their live stack.

---

## 6. What's explicitly NOT in this spec

| Item | Why deferred |
|---|---|
| CORS production domain | Phase 6.1 — needs production domain |
| Sentry / error monitoring | Phase 6.3 — needs DSN |
| Supabase RLS audit | Phase 6.5 — major rewrite |
| Gemini spend caps | Phase 6.6 — Google Cloud console only |
| Email-confirmation redirect handling | Phase 6.12 — needs frontend route + Supabase template config |
| Pagination on list endpoints | Original audit risk-area — not yet hitting it; defer until volumes warrant |
| Background task queue (Celery/Dramatiq) | Sub-30s Gemini calls don't need it yet |
| Per-request user-scoped Supabase clients (RLS defense-in-depth) | Major rewrite, separate effort |
| Live Supabase/Gemini integration tests | Needs dev project + user-in-loop |
| Load testing | Premature for pre-launch single-dev app |
| Browser-matrix testing (Firefox/Safari/Edge) | Cheap to add later via Playwright projects; not blocking |
| Mobile-first redesign | Out of scope; this spec only adds the failing-test signal |

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Commit 1 changes background-task DB writes; if `db.from_().execute()` differs subtly from sync supabase client, feedback might not save | Pytest covers the helpers via mock. Worst case: revert single commit. |
| Commit 4 JWKS TTL refresh race (two concurrent failures both refresh) | Acceptable — refresh is idempotent and cheap |
| Commit 4c session-start: must distinguish unique-constraint violation from real errors — naive upsert would wipe `current_section_index` on every reload | Use `Result.status_code == 409` gating, NOT upsert-merge-duplicates. Explicit test `test_session_restart_preserves_progress` guards against regression. |
| Commit 4c adds `status_code` field to `Result` class — used by `db.py` consumers across the codebase | New field defaults to `0`; existing call sites that ignore it remain correct. Safe addition. |
| Commit 5 response models tighten contracts; if a real response field is misspelled, tests fail at runtime | Models match what tests already assert. Each model gets a contract test. |
| Mobile/a11y failures will be alarming | Expected — they become a punch list, not a regression |

---

## 8. Hand-off

This spec, once approved, hands off to `superpowers:writing-plans` to produce the executable implementation plan. The plan will sequence the six commits, list every file to modify, and include the verification checklist for each step.
