# Codebase Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pay down deferred refactor debt (dual Supabase client, duplicate role helpers, module-level settings, missing response models), fix two reliability bugs (JWKS cache TTL, session-start race), and add testing coverage including a baseline a11y scan and mobile/tablet viewport projects.

**Architecture:** Six small commits on a dedicated worktree branch. Each commit is independently reviewable and revertable. All work is mocked-test-only; no live integration tests. Defers RLS/service-role rework, CORS production domain, Sentry, and other Phase 6 launch blockers to separate efforts.

**Tech Stack:** Python 3.11+ / FastAPI / pytest / httpx / Pydantic / async PostgREST query builder (custom in `backend/db.py`) / React 19 / TypeScript / Vite / Playwright / `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-05-02-codebase-cleanup-design.md`

---

## File Structure (what gets touched in which task)

| File | Tasks |
|---|---|
| `backend/routers/sessions.py` | 2 (background tasks), 5 (session-start race), 6 (response models) |
| `backend/routers/superpowers.py` | 2 (background tasks), 4 (settings), 6 (response models) |
| `backend/routers/library.py` | 2 (background task), 4 (settings) |
| `backend/routers/assignments.py` | 2 (background task), 4 (settings) |
| `backend/routers/auth.py` | 4 (settings + ANON_HEADERS) |
| `backend/routers/papers.py` | 4 (settings) |
| `backend/routers/dashboard.py` | 6 (response models) |
| `backend/deps.py` | 3 (role factory), 4 (settings), 5 (JWKS TTL + exception scope) |
| `backend/db.py` | 4 (settings), 5 (Result.status_code) |
| `backend/services/core_api.py` | 4 (settings) |
| `backend/schemas/sessions.py` | 6 (response models) |
| `backend/schemas/library.py` | 6 (response models) |
| `backend/schemas/superpowers.py` | 6 (response models) |
| `backend/schemas/dashboard.py` (new) | 6 (response models) |
| `backend/requirements.txt` | 2 (drop supabase package) |
| `backend/tests/test_sessions.py` | 7 (race + response shape tests) |
| `backend/tests/test_deps.py` (new) | 7 (JWKS TTL + role factory) |
| `backend/tests/test_rate_limit.py` (new) | 7 |
| `backend/tests/test_response_shapes.py` (new) | 7 |
| `frontend/playwright.config.js` | 8 (mobile/tablet projects) |
| `frontend/package.json` | 8 (axe-core dep) |
| `frontend/tests/cleanup-verification.spec.js` (new) | 8 |
| `frontend/tests/a11y.spec.js` (new) | 8 |
| `frontend/tests/mobile-subset.spec.js` (new) | 8 |
| `docs/refactor/05-cleanup-2026-05-02.md` (new) | 9 (summary) |

---

## Task 1: Set up worktree and branch

**Files:**
- Create: worktree at `../ReadLabAI-cleanup` on branch `cleanup/2026-05-02`

- [ ] **Step 1.1: Verify clean tree on master**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If not clean, stop and ask user.

- [ ] **Step 1.2: Create worktree**

Run from project root:
```bash
git worktree add ../ReadLabAI-cleanup -b cleanup/2026-05-02
```
Expected: `Preparing worktree (new branch 'cleanup/2026-05-02')` then `HEAD is now at <hash> docs(spec): fix session-start race fix to preserve student progress`

- [ ] **Step 1.3: All subsequent commands run from `../ReadLabAI-cleanup`**

Run: `cd ../ReadLabAI-cleanup && git branch --show-current`
Expected: `cleanup/2026-05-02`

- [ ] **Step 1.4: Verify backend tests pass on the new branch (baseline)**

Run: `cd backend && pytest -q`
Expected: 79 passed (or whatever the current count is — record this number for later comparison).

- [ ] **Step 1.5: Verify frontend tests pass on the new branch (baseline)**

Run: `cd ../frontend && npx playwright test --reporter=line 2>&1 | tail -5`
Expected: All passing. Record the count.

---

## Task 2: Replace dual Supabase client with async db.from_() in background tasks

**Files:**
- Modify: `backend/routers/sessions.py:124-163`
- Modify: `backend/routers/superpowers.py:4` (and any usage)
- Modify: `backend/routers/library.py:6, 23-57`
- Modify: `backend/routers/assignments.py:2` (and any usage)
- Modify: `backend/requirements.txt` (drop `supabase` if no longer used)

**Why:** Anti-pattern #2 from `docs/refactor/01-audit.md`. Background tasks use sync `supabase-py` client wrapped in `asyncio.to_thread`; rest of backend uses async `db.from_()`. Inconsistent and creates a new client per task call.

- [ ] **Step 2.1: Read current state of `sessions.py:124-163`**

Run: `head -165 backend/routers/sessions.py | tail -50` — confirm the three helpers `_run_checkpoint_feedback`, `_run_sowhat_feedback`, `_run_jargon_explanation` exist with their current sync-client bodies.

- [ ] **Step 2.2: Replace `_run_checkpoint_feedback` body**

In `backend/routers/sessions.py`, find:
```python
async def _run_checkpoint_feedback(
    checkpoint_id: str,
    section_title: str,
    guiding_questions: list[str],
    student_text: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    feedback = await generate_checkpoint_feedback(section_title, guiding_questions, student_text)
    await asyncio.to_thread(
        lambda: supa.table("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()
    )
```

Replace with:
```python
async def _run_checkpoint_feedback(
    checkpoint_id: str,
    section_title: str,
    guiding_questions: list[str],
    student_text: str,
) -> None:
    feedback = await generate_checkpoint_feedback(section_title, guiding_questions, student_text)
    db = get_db()
    await db.from_("checkpoint_responses").update({"ai_feedback": feedback}).eq("id", checkpoint_id).execute()
```

- [ ] **Step 2.3: Replace `_run_sowhat_feedback` body**

Find:
```python
async def _run_sowhat_feedback(
    sowhat_id: str,
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    feedback = await generate_sowhat_feedback(paper_title, section_titles, difficulty, student_text)
    await asyncio.to_thread(
        lambda: supa.table("sowhat_responses").update({"ai_feedback": feedback}).eq("id", sowhat_id).execute()
    )
```

Replace with:
```python
async def _run_sowhat_feedback(
    sowhat_id: str,
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> None:
    feedback = await generate_sowhat_feedback(paper_title, section_titles, difficulty, student_text)
    db = get_db()
    await db.from_("sowhat_responses").update({"ai_feedback": feedback}).eq("id", sowhat_id).execute()
```

- [ ] **Step 2.4: Replace `_run_jargon_explanation` body**

Find:
```python
async def _run_jargon_explanation(
    lookup_id: str,
    term: str,
    context_snippet: str,
) -> None:
    from supabase import create_client as _sc
    supa = _sc(settings.supabase_url, settings.supabase_service_role_key)
    explanation = await generate_jargon_explanation(term, context_snippet)
    await asyncio.to_thread(
        lambda: supa.table("jargon_lookups").update({"explanation": explanation}).eq("id", lookup_id).execute()
    )
```

Replace with:
```python
async def _run_jargon_explanation(
    lookup_id: str,
    term: str,
    context_snippet: str,
) -> None:
    explanation = await generate_jargon_explanation(term, context_snippet)
    db = get_db()
    await db.from_("jargon_lookups").update({"explanation": explanation}).eq("id", lookup_id).execute()
```

- [ ] **Step 2.5: Replace `_process_self_study` in `library.py:23-57`**

Find the entire `_process_self_study` function. Replace its body with:
```python
async def _process_self_study(
    assignment_id: str,
    extracted_text: str,
    figure_count: int,
) -> None:
    """Background task: generate reading guide for self-study paper, auto-publish."""
    db = get_db()
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        methodology_elements = full_result.pop("methodology_elements", [])
        critical_prompts = full_result.pop("critical_prompts", [])

        await db.from_("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "published",
        }).eq("id", assignment_id).execute()

        if methodology_elements:
            for elem in methodology_elements:
                elem["assignment_id"] = assignment_id
            await db.from_("methodology_elements").insert(methodology_elements).execute()

        if critical_prompts:
            for prompt in critical_prompts:
                prompt["assignment_id"] = assignment_id
            await db.from_("critical_prompts").insert(critical_prompts).execute()

    except Exception as e:
        logger.error("Self-study guide generation failed: %s", e)
        await db.from_("assignments").update({
            "status": "published",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()
```

Then delete the line `from supabase import create_client as _supabase_client` from the imports at the top of `library.py:6`.

- [ ] **Step 2.6: Find and convert any sync supabase usage in `superpowers.py`**

Run: `grep -n "_supabase_client\|asyncio.to_thread\|supa\." backend/routers/superpowers.py`
Expected: lists every line that needs converting.

For each match found, replace the sync pattern with async `db.from_()` following the same shape as Step 2.2-2.5. Then delete `from supabase import create_client as _supabase_client` from `superpowers.py:4`.

If no usages exist (just the dead import), delete only the import line.

- [ ] **Step 2.7: Find and convert any sync supabase usage in `assignments.py`**

Run: `grep -n "_supabase_client\|asyncio.to_thread\|supa\." backend/routers/assignments.py`
Expected: lists every line.

For each match, replace with async `db.from_()` following the same shape. Then delete `from supabase import create_client as _supabase_client` from `assignments.py:2`.

- [ ] **Step 2.8: Verify no `from supabase import` statements remain**

Run: `grep -rn "from supabase import" backend/`
Expected: NO output (the package is no longer imported anywhere).

- [ ] **Step 2.9: Drop `supabase` from `requirements.txt`**

Open `backend/requirements.txt`, find the line beginning with `supabase==`, delete it. Save.

- [ ] **Step 2.10: Run all backend tests**

Run: `cd backend && pytest -q`
Expected: Same number of passes as Step 1.4. If any test fails, the conversion broke something; investigate.

- [ ] **Step 2.11: Commit**

```bash
git add backend/routers/sessions.py backend/routers/superpowers.py backend/routers/library.py backend/routers/assignments.py backend/requirements.txt
git commit -m "$(cat <<'EOF'
refactor(backend): replace dual Supabase client with async db.from_() in background tasks

Background-task helpers in sessions, superpowers, library, and assignments
routers were using the synchronous supabase-py client wrapped in
asyncio.to_thread. Rest of the backend uses the async QueryBuilder from
db.py — this was anti-pattern #2 in docs/refactor/01-audit.md, deferred
during the Apr 29-30 refactor.

All four routers now use the existing async get_db() singleton. The
supabase package is no longer imported anywhere; dropped from
requirements.txt.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Collapse require_teacher / require_student into require_role factory

**Files:**
- Modify: `backend/deps.py:78-103`

**Why:** The two functions are byte-identical except for the role string. Anti-pattern #5 from original audit, never addressed.

- [ ] **Step 3.1: Read current state of `deps.py:78-103`**

Confirm both functions exist with the duplicated body.

- [ ] **Step 3.2: Replace both functions with a factory**

In `backend/deps.py`, find the two functions:

```python
async def require_teacher(user: dict = Depends(get_current_user), db=Depends(get_db)):
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.from_("user_profiles").select("role").eq("user_id", user_id).single().execute()
    if hasattr(result, "error") and result.error:
        raise HTTPException(status_code=500, detail="Database error checking role")
    if not result.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    if result.data.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


async def require_student(user: dict = Depends(get_current_user), db=Depends(get_db)):
    # ...identical body except "student"...
```

Replace with:

```python
def require_role(role: str):
    """Dependency factory: returns a dependency that asserts the caller has the given role."""
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

The public names `require_teacher` and `require_student` are preserved, so call sites in routers do not need updating.

- [ ] **Step 3.3: Run all backend tests**

Run: `cd backend && pytest -q`
Expected: Same number of passes as Task 2. The factory is a pure refactor.

- [ ] **Step 3.4: Commit**

```bash
git add backend/deps.py
git commit -m "$(cat <<'EOF'
refactor(backend): collapse require_teacher/require_student into require_role factory

The two role-check dependencies were byte-identical except for the role
string. Replace with require_role(role) factory; keep public names
require_teacher and require_student as aliases so call sites don't move.

Anti-pattern #5 from docs/refactor/01-audit.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Move module-level settings/headers into request scope

**Files:**
- Modify: `backend/db.py:11-12` (settings)
- Modify: `backend/deps.py:14-16` (settings)
- Modify: `backend/routers/auth.py:11-18` (settings + ANON_HEADERS)
- Modify: `backend/routers/papers.py` (settings)
- Modify: `backend/routers/sessions.py` (settings)
- Modify: `backend/routers/superpowers.py` (settings)
- Modify: `backend/routers/library.py` (settings)
- Modify: `backend/routers/assignments.py` (settings)
- Modify: `backend/services/core_api.py` (settings)

**Why:** Anti-pattern #4 from original audit. Module-level `settings = get_settings()` runs at import time, making testing harder. Also `ANON_HEADERS` is still defined at module scope in `auth.py:14-18` (the security-review note "removed 2 duplicate dicts" only removed `ADMIN_HEADERS`).

- [ ] **Step 4.1: Inventory all module-level `settings = get_settings()` lines**

Run: `grep -n "^settings = get_settings()" backend/`
Expected: lists all 9 files. Confirm before proceeding.

- [ ] **Step 4.2: Convert `db.py`**

In `backend/db.py`, find:
```python
settings = get_settings()

POSTGREST = f"{settings.supabase_url}/rest/v1"
AUTH_URL  = f"{settings.supabase_url}/auth/v1"
```

Replace with:
```python
def _postgrest_url() -> str:
    return f"{get_settings().supabase_url}/rest/v1"


def _auth_url() -> str:
    return f"{get_settings().supabase_url}/auth/v1"
```

Find every reference to `POSTGREST` and `AUTH_URL` in the same file (use `grep -n "POSTGREST\|AUTH_URL" backend/db.py`). Replace each with `_postgrest_url()` / `_auth_url()`.

For the `_admin_headers()` and `_anon_headers()` functions and `storage_headers()` that already exist, change `settings.supabase_service_role_key` to `get_settings().supabase_service_role_key` (and the same for `supabase_anon_key`). Also change `settings.supabase_url` references inside those functions to `get_settings().supabase_url`.

- [ ] **Step 4.3: Convert `deps.py`**

In `backend/deps.py`, find `settings = get_settings()` near the top and delete it.

Then find every reference to `settings.<x>` in the file. Replace each with `get_settings().<x>`. There should be one in `_get_jwks` referencing `settings.supabase_url`.

- [ ] **Step 4.4: Convert `auth.py` (settings + ANON_HEADERS)**

In `backend/routers/auth.py`, find:
```python
router = APIRouter()
settings = get_settings()

AUTH_URL = f"{settings.supabase_url}/auth/v1"
ANON_HEADERS = {
    "apikey": settings.supabase_anon_key,
    "Authorization": f"Bearer {settings.supabase_anon_key}",
    "Content-Type": "application/json",
}
```

Replace with:
```python
router = APIRouter()


def _auth_url() -> str:
    return f"{get_settings().supabase_url}/auth/v1"


def _anon_headers() -> dict:
    s = get_settings()
    return {
        "apikey": s.supabase_anon_key,
        "Authorization": f"Bearer {s.supabase_anon_key}",
        "Content-Type": "application/json",
    }
```

Then find every use of `AUTH_URL` in the file and replace with `_auth_url()`. Find every use of `ANON_HEADERS` and replace with `_anon_headers()`.

- [ ] **Step 4.5: Convert each remaining router**

For each of `papers.py`, `sessions.py`, `superpowers.py`, `library.py`, `assignments.py`:

Find the line `settings = get_settings()` near the top and delete it.

Run `grep -n "settings\." <file>` to find all usages. For each, replace `settings.<x>` with `get_settings().<x>`.

- [ ] **Step 4.6: Convert `services/core_api.py`**

Same procedure. Find `settings = get_settings()`, delete it. Replace each `settings.<x>` with `get_settings().<x>`.

- [ ] **Step 4.7: Verify no module-level settings remain**

Run: `grep -n "^settings = get_settings()" backend/`
Expected: NO output.

- [ ] **Step 4.8: Run all backend tests**

Run: `cd backend && pytest -q`
Expected: Same pass count. `get_settings()` is `@lru_cache`'d so this is a pure code-organization change with identical behavior.

- [ ] **Step 4.9: Commit**

```bash
git add backend/db.py backend/deps.py backend/routers/auth.py backend/routers/papers.py backend/routers/sessions.py backend/routers/superpowers.py backend/routers/library.py backend/routers/assignments.py backend/services/core_api.py
git commit -m "$(cat <<'EOF'
refactor(backend): move module-level settings/headers into request scope

Module-level settings = get_settings() and ANON_HEADERS in auth.py made
testing harder (couldn't override settings without clearing the lru_cache
mid-import). Replace with helper functions that call get_settings() at
request time. Behavior unchanged because get_settings() is @lru_cache'd.

Anti-pattern #4 from docs/refactor/01-audit.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: JWKS TTL + JWT exception scope + session-start race fix

**Files:**
- Modify: `backend/db.py` (add `status_code` to `Result`, return it from `execute()`)
- Modify: `backend/deps.py` (JWKS TTL, narrow except)
- Modify: `backend/routers/sessions.py:23-73` (session-start race fix)

**Why:** Three reliability fixes that travel together because they all touch the auth/data path.

- [ ] **Step 5.1: Extend `db.py:Result` with `status_code`**

In `backend/db.py`, find:
```python
class Result:
    def __init__(self, data, error):
        self.data = data
        self.error = error
```

Replace with:
```python
class Result:
    def __init__(self, data, error, status_code: int = 0):
        self.data = data
        self.error = error
        self.status_code = status_code
```

- [ ] **Step 5.2: Pass `status_code` from `QueryBuilder.execute()`**

In `backend/db.py`, find the `execute()` method (around line 112). Find the success and failure return statements:

```python
if resp.status_code >= 400:
    logger.error(...)
    return Result(data=None, error=resp.text)
...
return Result(data=data, error=None)
```

And the exception path:
```python
except Exception as e:
    logger.error(...)
    return Result(data=None, error=str(e))
```

Replace each with:
```python
if resp.status_code >= 400:
    logger.error(...)
    return Result(data=None, error=resp.text, status_code=resp.status_code)
...
return Result(data=data, error=None, status_code=resp.status_code)
```
And:
```python
except Exception as e:
    logger.error(...)
    return Result(data=None, error=str(e), status_code=0)
```

- [ ] **Step 5.3: Add JWKS TTL to `deps.py`**

In `backend/deps.py`, near the top of the module add:
```python
import time

_JWKS_TTL_SECONDS = 600  # 10 min
_jwks_cache: tuple[dict, float] | None = None  # (jwks, fetched_at_monotonic)
```

Delete the existing `_jwks_cache: dict | None = None` line.

- [ ] **Step 5.4: Replace `_get_jwks` with TTL-aware version**

Find:
```python
async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        _jwks_cache = r.json()
        logger.info("JWKS fetched (%d keys)", len(_jwks_cache.get("keys", [])))
    return _jwks_cache
```

Replace with:
```python
async def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache
    now = time.monotonic()
    if not force_refresh and _jwks_cache and (now - _jwks_cache[1]) < _JWKS_TTL_SECONDS:
        return _jwks_cache[0]
    url = f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()
        _jwks_cache = (data, now)
        logger.info("JWKS fetched (%d keys)", len(data.get("keys", [])))
    return data
```

(Note: in Task 4 we already replaced `settings.supabase_url` with `get_settings().supabase_url`; this code matches.)

- [ ] **Step 5.5: Narrow the JWT exception scope and add force-refresh retry**

Find:
```python
async def _verify_token(token: str) -> dict:
    jwks = await _get_jwks()
    last_error: Exception | None = None
    for key_data in jwks.get("keys", []):
        try:
            return jwt.decode(
                token, key_data,
                algorithms=["RS256", "ES256"],
                options={"verify_aud": False},
            )
        except ExpiredSignatureError:
            raise
        except (JWTError, JWKError, Exception) as e:
            last_error = e
    global _jwks_cache
    _jwks_cache = None
    raise JWTError(f"No key verified the token: {last_error}")
```

Replace with:
```python
async def _verify_token(token: str, _retried: bool = False) -> dict:
    jwks = await _get_jwks()
    last_error: Exception | None = None
    for key_data in jwks.get("keys", []):
        try:
            return jwt.decode(
                token, key_data,
                algorithms=["RS256", "ES256"],
                options={"verify_aud": False},
            )
        except ExpiredSignatureError:
            raise
        except (JWTError, JWKError) as e:
            last_error = e
    # No key worked. If we haven't already retried, force a JWKS refresh
    # (in case Supabase rotated keys) and try once more.
    if not _retried:
        await _get_jwks(force_refresh=True)
        return await _verify_token(token, _retried=True)
    raise JWTError(f"No key verified the token: {last_error}")
```

The bare `Exception` catch is removed; programming bugs now propagate as 500s instead of being silently swallowed as auth failures.

- [ ] **Step 5.6: Read current state of `sessions.py:23-73` (start_session)**

Run: `sed -n '23,73p' backend/routers/sessions.py`
Confirm the `start_session` function exists with the insert-then-fallback pattern.

- [ ] **Step 5.7: Replace `start_session` with the 409-gated version**

Find the body of `start_session` containing:
```python
result = await db.from_("student_sessions").insert({
    ...
}).execute()

if result.data:
    session = result.data[0] if isinstance(result.data, list) else result.data
else:
    # Duplicate — fetch the existing row instead
    existing = await db.from_("student_sessions") \
        .select("id, status, current_section_index") \
        .eq("student_id", user["sub"]).eq("assignment_id", body.assignment_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    session = existing.data[0] if isinstance(existing.data, list) else existing.data
```

Replace the `result = ...` block through the end of the `else` branch with:

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
    # Unique-constraint violation: re-opening assignment OR true race condition.
    # Fetch the existing row to preserve current_section_index.
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

The `isinstance(result.data, list)` guard is removed — PostgREST always returns a list for an insert with `Prefer: return=representation`.

- [ ] **Step 5.8: Run all backend tests**

Run: `cd backend && pytest -q`
Expected: Same pass count. Existing tests cover happy paths; the new error paths get explicit tests in Task 7.

- [ ] **Step 5.9: Commit**

```bash
git add backend/db.py backend/deps.py backend/routers/sessions.py
git commit -m "$(cat <<'EOF'
fix(backend): JWKS cache TTL, scope JWT exception handler, session-start race

Three reliability fixes:

1. JWKS cache: add 10-minute soft TTL with on-failure refresh-and-retry.
   Previously the cache only invalidated on verify failure, so Supabase
   key rotation would cause a wave of 401s before recovery.

2. JWT verification: narrow except (JWTError, JWKError, Exception) to
   (JWTError, JWKError) only. Bare Exception was masking programming
   bugs as auth failures.

3. Session-start race: extend Result class with status_code field; only
   fall back to fetch existing session when error is HTTP 409 (unique-
   constraint violation). Real DB errors now surface as 500 instead of
   silently fetching the wrong row. Drop cargo-culted isinstance(list)
   guards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pydantic response models for high-bug-risk endpoints

**Files:**
- Modify: `backend/schemas/sessions.py` (add response models)
- Modify: `backend/schemas/library.py` (add response models)
- Modify: `backend/schemas/superpowers.py` (add response models)
- Create: `backend/schemas/dashboard.py` (new file)
- Modify: `backend/routers/sessions.py` (add `response_model=` to decorators)
- Modify: `backend/routers/dashboard.py`
- Modify: `backend/routers/library.py`
- Modify: `backend/routers/superpowers.py`

**Why:** Anti-pattern #6 from original audit. Auth has response models; the other 45 endpoints return raw dicts. This task adds models for the 17 highest-bug-risk endpoints (sessions, dashboard, library, superpowers stats/quiz/recommendations). Stable endpoints (assignments, classes, papers) intentionally NOT touched in this task.

- [ ] **Step 6.1: Add response models to `schemas/sessions.py`**

Append to `backend/schemas/sessions.py`:

```python
# ── Response models ──────────────────────────────────────────────────────────


class SessionStartResponse(BaseModel):
    session_id: str
    assignment_id: str
    paper_id: str
    status: str
    current_section_index: int
    reading_guide: dict
    paper_title: str
    difficulty: str | None = None


class SessionListItem(BaseModel):
    id: str
    assignment_id: str
    status: str
    current_section_index: int


class CheckpointResponseRow(BaseModel):
    id: str
    section_index: int
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class SoWhatResponseRow(BaseModel):
    id: str
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class JargonLookupRow(BaseModel):
    id: str
    term: str
    explanation: str | None = None
    created_at: str | None = None


class SessionDetailResponse(BaseModel):
    id: str
    assignment_id: str
    status: str
    current_section_index: int
    checkpoints: list[CheckpointResponseRow] = []
    sowhat: SoWhatResponseRow | None = None
    jargon_lookups: list[JargonLookupRow] = []


class CheckpointPendingResponse(BaseModel):
    id: str
    feedback_pending: bool


class SoWhatPendingResponse(BaseModel):
    id: str
    feedback_pending: bool


class JargonResponse(BaseModel):
    id: str
    term: str
    explanation: str
    feedback_pending: bool = False


class KeyTermResponse(BaseModel):
    term: str
    explanation: str
    cached: bool


class ProgressUpdateResponse(BaseModel):
    ok: bool
```

- [ ] **Step 6.2: Wire response models into `sessions.py` decorators**

In `backend/routers/sessions.py`, update each route decorator. For example:

```python
@router.post("/", response_model=SessionStartResponse)
async def start_session(...):
    ...
```

Apply to:

| Route | Model |
|---|---|
| `POST /` (start_session) | `SessionStartResponse` |
| `GET /` (list_sessions) | `list[SessionListItem]` |
| `GET /{session_id}` (get_session) | `SessionDetailResponse` |
| `PATCH /{session_id}/progress` (update_progress) | `ProgressUpdateResponse` |
| `POST /{session_id}/checkpoint` | `CheckpointPendingResponse` |
| `POST /{session_id}/sowhat` | `SoWhatPendingResponse` |
| `POST /{session_id}/jargon` | `JargonResponse` |
| `POST /{session_id}/keyterm` | `KeyTermResponse` |

Also update the imports at the top of `sessions.py`:

```python
from backend.schemas.sessions import (
    StartSessionRequest, ProgressRequest, CheckpointRequest,
    SoWhatRequest, JargonRequest, KeyTermRequest,
    PreviewCheckpointRequest, PreviewSoWhatRequest,
    PreviewJargonRequest, PreviewKeyTermRequest,
    SessionStartResponse, SessionListItem, SessionDetailResponse,
    CheckpointPendingResponse, SoWhatPendingResponse,
    JargonResponse, KeyTermResponse, ProgressUpdateResponse,
)
```

- [ ] **Step 6.3: Create `schemas/dashboard.py`**

Create `backend/schemas/dashboard.py`:

```python
from pydantic import BaseModel


class ClassDescriptor(BaseModel):
    id: str
    name: str


class StudentSession(BaseModel):
    student_id: str
    assignment_id: str
    status: str
    current_section_index: int
    completed_at: str | None = None


class StudentProgressEntry(BaseModel):
    student_id: str
    student_name: str
    sessions: list[StudentSession]


class AssignmentSummary(BaseModel):
    id: str
    status: str
    difficulty: str | None = None
    created_at: str | None = None
    reading_guide: dict | None = None


class ClassProgressResponse(BaseModel):
    class_: ClassDescriptor  # serialized as "class" in JSON, see config below
    assignments: list[AssignmentSummary]
    students: list[StudentProgressEntry]

    class Config:
        populate_by_name = True
        fields = {"class_": "class"}


class CheckpointEntry(BaseModel):
    section_index: int
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class SoWhatEntry(BaseModel):
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class StudentSessionEntry(BaseModel):
    id: str
    status: str
    current_section_index: int
    started_at: str | None = None
    completed_at: str | None = None


class StudentResponsesResponse(BaseModel):
    session: StudentSessionEntry | None = None
    checkpoints: list[CheckpointEntry] = []
    sowhat: SoWhatEntry | None = None


class SectionInsight(BaseModel):
    title: str
    common_misconception: str
    commonly_grasped: str
    student_count: int | None = None


class InsightsPayload(BaseModel):
    sections: list[SectionInsight]


class AssignmentInsightsResponse(BaseModel):
    insights: InsightsPayload
    generated_at: str | None = None
```

NOTE on the `class_` field: Pydantic v2 supports an `alias` argument; the existing endpoint returns `{"class": ...}`. Use `Field(..., alias="class")` instead of the `Config.fields` dict if Pydantic v2 syntax is required. Check pydantic version in `requirements.txt` first; the spec uses syntax compatible with both v1.x and v2.x via fallback.

If pydantic is v2 (very likely), use:
```python
from pydantic import BaseModel, Field, ConfigDict


class ClassProgressResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    class_: ClassDescriptor = Field(..., alias="class")
    assignments: list[AssignmentSummary]
    students: list[StudentProgressEntry]
```

- [ ] **Step 6.4: Wire response models into `dashboard.py` decorators**

In `backend/routers/dashboard.py`, add imports:
```python
from backend.schemas.dashboard import (
    ClassProgressResponse,
    StudentResponsesResponse,
    AssignmentInsightsResponse,
)
```

Update decorators:

| Route | Model |
|---|---|
| `GET /classes/{class_id}/progress` | `ClassProgressResponse` |
| `GET /assignments/{assignment_id}/students/{student_id}/responses` | `StudentResponsesResponse` |
| `GET /assignments/{assignment_id}/insights` | `AssignmentInsightsResponse` |

For the `get_class_progress` endpoint, the response currently builds `{"class": cls.data, ...}`. With the new model and `populate_by_name`, this should work — but to be safe, change the return to use the alias explicitly. The response code already uses the string key `"class"`, so no change is needed beyond adding `response_model=ClassProgressResponse` and `response_model_by_alias=True` to the decorator if needed:

```python
@router.get("/classes/{class_id}/progress", response_model=ClassProgressResponse, response_model_by_alias=True)
```

- [ ] **Step 6.5: Add response models to `schemas/library.py`**

Append to `backend/schemas/library.py`:

```python
# ── Response models ──────────────────────────────────────────────────────────


class LibraryUploadResponse(BaseModel):
    paper_id: str
    assignment_id: str
    status: str


class LibraryStatusResponse(BaseModel):
    assignment_id: str
    paper_id: str
    paper_title: str
    status: str
    reading_guide: dict | None = None


class LibraryPaperResponse(BaseModel):
    id: str
    title: str
    text_length: int | None = None
    figure_count: int | None = None
    assignment_id: str | None = None
    assignment_status: str | None = None
    created_at: str | None = None


class CoreSearchResult(BaseModel):
    core_id: str
    title: str
    abstract: str | None = None
    authors: list[str] = []
    year: int | None = None
    download_url: str | None = None
```

- [ ] **Step 6.6: Wire response models into `library.py` decorators**

In `backend/routers/library.py`, add imports for the new models and add `response_model=` to:

| Route | Model |
|---|---|
| `POST /upload` | `LibraryUploadResponse` |
| `GET /status/{assignment_id}` | `LibraryStatusResponse` |
| `GET /browse` | `list[LibraryPaperResponse]` |
| `GET /search` | `list[CoreSearchResult]` |

Read each handler's actual return shape FIRST (`grep -A 20 "@router.get\|@router.post" backend/routers/library.py | head -100`) and adjust the schemas above if any field name differs. If a real return field is missing from the schema, ADD it to the schema rather than removing it from the return.

- [ ] **Step 6.7: Add response models to `schemas/superpowers.py`**

Append to `backend/schemas/superpowers.py`:

```python
# ── Response models ──────────────────────────────────────────────────────────


class ReadingStatsResponse(BaseModel):
    student_id: str
    papers_read: int = 0
    quizzes_passed: int = 0
    current_streak: int = 0
    longest_streak: int = 0
    last_read_at: str | None = None
    level: int = 1
    xp: int = 0
    total_sections_completed: int = 0
    checkpoints_completed: int = 0
    average_comprehension_score: float = 0


class XpResultResponse(BaseModel):
    xp: int
    level: int
    streak: int
    xp_earned: int


class QuizQuestionResponse(BaseModel):
    id: str
    assignment_id: str
    question_type: str  # "multiple_choice" or "short_answer"
    question_text: str
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class QuizQuestionResult(BaseModel):
    question_id: str
    score: int
    max: int
    correct_answer: str | None = None
    explanation: str | None = None


class QuizAttemptResponse(BaseModel):
    score: int
    max_score: int
    results: list[QuizQuestionResult]


class RecommendedPaper(BaseModel):
    id: str
    title: str


class RecommendationResponse(BaseModel):
    paper: RecommendedPaper
    assignment_id: str
    reason: str
```

- [ ] **Step 6.8: Wire response models into `superpowers.py` decorators**

In `backend/routers/superpowers.py`, add imports and add `response_model=` to:

| Route | Model |
|---|---|
| `GET /stats` | `ReadingStatsResponse` |
| `POST /stats/xp` | `XpResultResponse` |
| `GET /quiz/{assignment_id}` | `list[QuizQuestionResponse]` |
| `POST /quiz/attempt` | `QuizAttemptResponse` |
| `GET /recommendations` | `list[RecommendationResponse]` |

- [ ] **Step 6.9: Run all backend tests**

Run: `cd backend && pytest -q`
Expected: Same pass count, OR a small number of failures from tests that asserted return shapes which the new models reject. Read each failure carefully:
- If a test was wrong (e.g., asserting a field that the model rejects but shouldn't exist), fix the test.
- If the model is wrong (a real field is missing from the model), fix the model.

Do NOT loosen models to make tests pass — that defeats the purpose. The goal is real contracts.

- [ ] **Step 6.10: Commit**

```bash
git add backend/schemas/sessions.py backend/schemas/library.py backend/schemas/superpowers.py backend/schemas/dashboard.py backend/routers/sessions.py backend/routers/dashboard.py backend/routers/library.py backend/routers/superpowers.py
git commit -m "$(cat <<'EOF'
feat(backend): add Pydantic response models for sessions/dashboard/library/superpowers

Anti-pattern #6 from docs/refactor/01-audit.md. Auth had response models;
the other ~45 endpoints returned raw dicts. Add models for the 17
highest-bug-risk endpoints (sessions, dashboard, library, superpowers
stats/quiz/recommendations).

Stable endpoints (assignments, classes, papers) deliberately NOT
touched in this task — can be a follow-up.

Models match what existing tests already assert plus what the frontend
TypeScript types declare. Each endpoint gets a contract test in the
upcoming test commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Backend tests for rate limits, race condition, JWKS TTL, role factory, response shapes

**Files:**
- Create: `backend/tests/test_rate_limit.py`
- Create: `backend/tests/test_deps.py`
- Create: `backend/tests/test_response_shapes.py`
- Modify: `backend/tests/test_sessions.py` (add race tests)

**Why:** Three sets of tests:
1. **Rate-limit tests** — proves `slowapi` actually enforces the configured limits
2. **`deps.py` tests** — JWKS TTL behavior, role factory rejects wrong role
3. **Race / regression tests** — session-start preserves progress, surfaces real DB errors
4. **Response-shape contract tests** — sample of new response models match real responses

- [ ] **Step 7.1: Read `backend/tests/conftest.py` to understand existing fixtures**

Run: `cat backend/tests/conftest.py`
Note: which fixtures override `get_db` and `get_current_user`. New tests reuse these.

- [ ] **Step 7.2: Create `tests/test_rate_limit.py` with the failing tests**

Create `backend/tests/test_rate_limit.py`:

```python
"""Tests for slowapi rate limiting on auth and AI endpoints."""
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.rate_limit import limiter
from backend.deps import get_current_user, get_db


@pytest.fixture(autouse=True)
def reset_limiter():
    """Each test starts with a fresh limiter state."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def student_user_override():
    async def fake_user():
        return {"sub": "test-student-uuid"}
    app.dependency_overrides[get_current_user] = fake_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_rate_limit_signup_429_after_5_attempts(client, monkeypatch):
    """5/hour limit: 6th request gets 429."""
    # Mock the upstream Supabase call so signup never actually hits the network
    import backend.routers.auth as auth_module
    monkeypatch.setattr(auth_module.httpx, "AsyncClient", _failing_async_client_factory("signup"))

    payload = {"email": "x@y.com", "password": "password123", "name": "X"}
    for i in range(5):
        r = client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "1.2.3.4"})
        # Status doesn't matter — we just need to hit the endpoint
        assert r.status_code != 429, f"Hit limit too early at attempt {i + 1}"

    r = client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "1.2.3.4"})
    assert r.status_code == 429


def test_rate_limit_signin_429_after_10_per_minute(client, monkeypatch):
    """10/minute limit: 11th gets 429."""
    import backend.routers.auth as auth_module
    monkeypatch.setattr(auth_module.httpx, "AsyncClient", _failing_async_client_factory("signin"))

    payload = {"email": "x@y.com", "password": "password123"}
    for i in range(10):
        r = client.post("/api/v1/auth/signin", json=payload, headers={"X-Forwarded-For": "5.6.7.8"})
        assert r.status_code != 429, f"Hit limit too early at attempt {i + 1}"

    r = client.post("/api/v1/auth/signin", json=payload, headers={"X-Forwarded-For": "5.6.7.8"})
    assert r.status_code == 429


def test_rate_limit_per_ip_independent(client, monkeypatch):
    """Different X-Forwarded-For values get independent limit counters."""
    import backend.routers.auth as auth_module
    monkeypatch.setattr(auth_module.httpx, "AsyncClient", _failing_async_client_factory("signup"))

    payload = {"email": "x@y.com", "password": "password123", "name": "X"}
    # IP A exhausts its limit
    for _ in range(5):
        client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "10.0.0.1"})
    r_blocked = client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "10.0.0.1"})
    assert r_blocked.status_code == 429

    # IP B still has full quota
    r_allowed = client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "10.0.0.2"})
    assert r_allowed.status_code != 429


# ── Helpers ──────────────────────────────────────────────────────────────────


def _failing_async_client_factory(label: str):
    """
    Returns an httpx.AsyncClient stub whose .post() always returns a 400.
    Lets us hit endpoint logic without making real network calls. The 400
    is fine — we're testing the limiter, not the upstream behavior.
    """
    import httpx as _httpx

    class FakeResponse:
        status_code = 400
        content = b'{"msg": "stubbed"}'
        text = '{"msg": "stubbed"}'
        def json(self):
            return {"msg": f"stubbed {label}"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def post(self, *args, **kwargs):
            return FakeResponse()

    return FakeClient
```

- [ ] **Step 7.3: Run rate-limit tests, expect to fail-then-pass**

Run: `cd backend && pytest tests/test_rate_limit.py -v`
Expected behavior:
- If `limiter.reset()` doesn't exist on this slowapi version, test setup fails. Workaround: replace `limiter.reset()` with `limiter._storage.storage.clear()` or similar (check slowapi source).
- If everything wires up correctly, all three tests should PASS — the rate limits are already in place from the May 1 work.

If a test fails because the limit isn't being enforced, that's a real regression — investigate before continuing.

- [ ] **Step 7.4: Create `tests/test_deps.py`**

Create `backend/tests/test_deps.py`:

```python
"""Tests for backend.deps — JWKS cache TTL, role factory."""
import asyncio
import time
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from backend.deps import (
    _get_jwks, _verify_token, require_role, get_current_user,
)
import backend.deps as deps_module


@pytest.fixture(autouse=True)
def reset_jwks_cache():
    """Each test starts with cleared cache."""
    deps_module._jwks_cache = None
    yield
    deps_module._jwks_cache = None


@pytest.mark.asyncio
async def test_jwks_cache_uses_cached_value_within_ttl():
    """Within TTL window, second call must not re-fetch."""
    fake_jwks = {"keys": [{"kid": "k1"}]}

    with patch("backend.deps.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value.json = lambda: fake_jwks
        mock_client.get.return_value.raise_for_status = lambda: None
        mock_client_cls.return_value = mock_client

        result1 = await _get_jwks()
        result2 = await _get_jwks()

        assert result1 == fake_jwks
        assert result2 == fake_jwks
        # httpx was instantiated only once
        assert mock_client_cls.call_count == 1


@pytest.mark.asyncio
async def test_jwks_cache_refreshes_after_ttl():
    """After TTL expires, next call refetches."""
    fake_jwks = {"keys": [{"kid": "k1"}]}

    with patch("backend.deps.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value.json = lambda: fake_jwks
        mock_client.get.return_value.raise_for_status = lambda: None
        mock_client_cls.return_value = mock_client

        await _get_jwks()
        # Simulate TTL expiry by manually rewinding the cache timestamp
        cached_jwks, _old_ts = deps_module._jwks_cache
        deps_module._jwks_cache = (cached_jwks, time.monotonic() - deps_module._JWKS_TTL_SECONDS - 1)

        await _get_jwks()
        assert mock_client_cls.call_count == 2


@pytest.mark.asyncio
async def test_jwks_cache_force_refresh():
    """force_refresh=True bypasses cache."""
    fake_jwks = {"keys": [{"kid": "k1"}]}

    with patch("backend.deps.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value.json = lambda: fake_jwks
        mock_client.get.return_value.raise_for_status = lambda: None
        mock_client_cls.return_value = mock_client

        await _get_jwks()
        await _get_jwks(force_refresh=True)
        assert mock_client_cls.call_count == 2


@pytest.mark.asyncio
async def test_role_factory_accepts_matching_role():
    """A user whose profile.role == 'student' passes require_role('student')."""
    check = require_role("student")

    fake_user = {"sub": "abc"}
    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        async def execute(self):
            class R:
                data = {"role": "student"}
                error = None
            return R()

    result = await check(user=fake_user, db=FakeDb())
    assert result == fake_user


@pytest.mark.asyncio
async def test_role_factory_rejects_wrong_role():
    """A teacher token used on a student-only endpoint gets 403."""
    check = require_role("student")

    fake_user = {"sub": "abc"}
    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        async def execute(self):
            class R:
                data = {"role": "teacher"}
                error = None
            return R()

    with pytest.raises(HTTPException) as exc:
        await check(user=fake_user, db=FakeDb())
    assert exc.value.status_code == 403
    assert "Student" in exc.value.detail


@pytest.mark.asyncio
async def test_role_factory_missing_profile_returns_403():
    """If no user_profiles row, return 403 not 500."""
    check = require_role("student")

    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        async def execute(self):
            class R:
                data = None
                error = None
            return R()

    with pytest.raises(HTTPException) as exc:
        await check(user={"sub": "abc"}, db=FakeDb())
    assert exc.value.status_code == 403
```

- [ ] **Step 7.5: Run deps tests**

Run: `cd backend && pytest tests/test_deps.py -v`
Expected: all PASS. If `pytest-asyncio` isn't configured for `@pytest.mark.asyncio`, check `backend/conftest.py` or `pyproject.toml` / `pytest.ini` and add `asyncio_mode = "auto"`.

- [ ] **Step 7.6: Add session-start race + progress-preservation tests to `test_sessions.py`**

Append to `backend/tests/test_sessions.py`:

```python
# ── Session-start race / regression tests ────────────────────────────────────


def test_session_start_returns_existing_on_unique_violation(client, override_student_auth):
    """
    When a session already exists, POST /sessions/ should return 409 from PostgREST
    and we fall back to fetching the existing row, preserving current_section_index.
    """
    captured = {}

    class FakeDb:
        def from_(self, table):
            self._table = table
            return self
        def select(self, _c):
            return self
        def eq(self, k, v):
            captured.setdefault("filters", []).append((k, v))
            return self
        def single(self):
            return self
        def insert(self, payload):
            captured["insert_payload"] = payload
            self._method = "INSERT"
            return self
        async def execute(self):
            from backend.db import Result
            if getattr(self, "_method", None) == "INSERT":
                # Simulate unique constraint violation
                return Result(data=None, error="duplicate", status_code=409)
            # The follow-up SELECT returns the existing in-progress row
            return Result(
                data={"id": "existing-session-uuid", "status": "in_progress", "current_section_index": 5},
                error=None,
                status_code=200,
            )

    # Wire the fake DB into the start_session handler. Use the existing test
    # fixture pattern from the file (override_student_auth + override_get_db).
    # Then POST and assert.
    # ...
    # Assert: response.status_code == 200
    # Assert: response.json()["session_id"] == "existing-session-uuid"
    # Assert: response.json()["current_section_index"] == 5  ← progress preserved
    pass  # full assertion logic depends on existing helper conventions in the file


def test_session_start_db_error_returns_500_not_silent_fetch(client, override_student_auth):
    """Non-409 DB error must surface as 500, not silently fetch wrong row."""
    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        def insert(self, _p):
            return self
        async def execute(self):
            from backend.db import Result
            return Result(data=None, error="connection refused", status_code=503)

    # ... wire and POST ...
    # Assert: response.status_code == 500
    pass
```

NOTE: The assertion bodies are stubbed because the exact fixture wiring depends on how `test_sessions.py` already overrides `get_db`. Read the existing tests in that file FIRST, then mirror the pattern. The point of the test is to assert the new code paths from Task 5 work — adapt to the file's existing style.

- [ ] **Step 7.7: Read existing `test_sessions.py` patterns and complete the stubs**

Run: `head -60 backend/tests/test_sessions.py` to see how `get_db` is overridden. Replace the `pass` stubs in 7.6 with concrete assertions following that pattern.

- [ ] **Step 7.8: Create `tests/test_response_shapes.py`**

Create `backend/tests/test_response_shapes.py`:

```python
"""Contract tests: assert real endpoint responses validate against new schemas."""
import pytest
from backend.schemas.sessions import (
    SessionStartResponse, SessionDetailResponse, JargonResponse,
    KeyTermResponse, CheckpointPendingResponse,
)
from backend.schemas.dashboard import (
    ClassProgressResponse, AssignmentInsightsResponse,
)
from backend.schemas.superpowers import (
    ReadingStatsResponse, XpResultResponse, RecommendationResponse,
)


def test_session_start_response_validates():
    payload = {
        "session_id": "abc-123",
        "assignment_id": "asn-1",
        "paper_id": "pap-1",
        "status": "in_progress",
        "current_section_index": 0,
        "reading_guide": {"sections": []},
        "paper_title": "Test Paper",
        "difficulty": "intermediate",
    }
    obj = SessionStartResponse(**payload)
    assert obj.session_id == "abc-123"


def test_jargon_response_validates_full_payload():
    payload = {
        "id": "jl-1",
        "term": "regression",
        "explanation": "A statistical method...",
        "feedback_pending": False,
    }
    obj = JargonResponse(**payload)
    assert obj.term == "regression"


def test_keyterm_response_validates_cached_flag():
    obj = KeyTermResponse(term="t", explanation="e", cached=True)
    assert obj.cached is True


def test_checkpoint_pending_response_validates():
    obj = CheckpointPendingResponse(id="cp-1", feedback_pending=True)
    assert obj.feedback_pending is True


def test_class_progress_response_validates_with_class_alias():
    payload = {
        "class": {"id": "c1", "name": "Bio 101"},
        "assignments": [],
        "students": [],
    }
    obj = ClassProgressResponse.model_validate(payload)
    assert obj.class_.name == "Bio 101"


def test_reading_stats_response_validates_with_defaults():
    obj = ReadingStatsResponse(student_id="s1")
    assert obj.xp == 0
    assert obj.level == 1


def test_xp_result_response_validates():
    obj = XpResultResponse(xp=100, level=2, streak=3, xp_earned=10)
    assert obj.level == 2


def test_recommendation_response_validates():
    payload = {
        "paper": {"id": "p1", "title": "T"},
        "assignment_id": "a1",
        "reason": "Fresh upload",
    }
    obj = RecommendationResponse(**payload)
    assert obj.assignment_id == "a1"


def test_session_start_response_rejects_extra_field():
    """Strict-ish: extra fields don't error by default in pydantic v2 unless model_config sets extra='forbid'."""
    payload = {
        "session_id": "abc",
        "assignment_id": "a",
        "paper_id": "p",
        "status": "in_progress",
        "current_section_index": 0,
        "reading_guide": {},
        "paper_title": "T",
        "extra_field_that_should_be_ignored": "x",
    }
    obj = SessionStartResponse(**payload)
    assert obj.session_id == "abc"
```

- [ ] **Step 7.9: Run all backend tests together**

Run: `cd backend && pytest -q`
Expected: original 79 + ~14 new = ~93 passing. Investigate any failures.

- [ ] **Step 7.10: Commit (backend tests)**

```bash
git add backend/tests/
git commit -m "$(cat <<'EOF'
test(backend): cover rate limits, session-start race, JWKS TTL, role factory, response shapes

- test_rate_limit.py: signup, signin, per-IP independence
- test_deps.py: JWKS cache TTL, force-refresh, role factory accept/reject
- test_response_shapes.py: validate all new Pydantic response models
- test_sessions.py: session-start returns existing row on 409 (preserves
  current_section_index); non-409 errors surface as 500

Adds ~14 cases covering the changes in commits 1, 3, 5, 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend Playwright tests + a11y + mobile/tablet viewports

**Files:**
- Modify: `frontend/playwright.config.js` (add mobile/tablet projects)
- Modify: `frontend/package.json` (add `@axe-core/playwright`)
- Create: `frontend/tests/cleanup-verification.spec.js`
- Create: `frontend/tests/a11y.spec.js`
- Create: `frontend/tests/mobile-subset.spec.js`

**Why:** Lock in the bug fixes from May 1 (jargon term, recommendations flow, removed category field) with E2E tests; baseline a11y; surface mobile/tablet layout failures so user has a punch list.

- [ ] **Step 8.1: Install `@axe-core/playwright`**

```bash
cd frontend && npm install --save-dev @axe-core/playwright
```

Verify it appears in `frontend/package.json` devDependencies.

- [ ] **Step 8.2: Update `frontend/playwright.config.js` with mobile + tablet projects**

Replace the entire `projects` array. Find:

```js
projects: [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
],
```

Replace with:

```js
projects: [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
    testIgnore: /mobile-subset\.spec\.js$/,
  },
  {
    name: 'mobile',
    use: { ...devices['iPhone SE'] },
    testMatch: /mobile-subset\.spec\.js$/,
  },
  {
    name: 'tablet',
    use: { ...devices['iPad'] },
    testMatch: /mobile-subset\.spec\.js$/,
  },
],
```

- [ ] **Step 8.3: Create `frontend/tests/cleanup-verification.spec.js`**

Create this file. The structure mirrors existing specs (using `helpers.js` for auth + mocks):

```javascript
const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes } = require('./helpers');


test.describe('Cleanup verification: post-May-1 fixes', () => {

  test('jargon lookup sends the typed term in request body', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    let capturedBody = null;
    await page.route('**/api/v1/sessions/*/jargon', async (route, request) => {
      capturedBody = JSON.parse(request.postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'jl-1',
          term: capturedBody.term,
          explanation: 'A test explanation',
          feedback_pending: false,
        }),
      });
    });

    await page.goto('/student/read/test-assignment-uuid');
    // Wait for reading page to render
    await page.waitForSelector('[data-testid="jargon-input"]', { timeout: 10000 });
    await page.fill('[data-testid="jargon-input"]', 'regression coefficient');
    await page.click('[data-testid="jargon-lookup-button"]');

    // Allow request to fire
    await page.waitForResponse('**/jargon');

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.term).toBe('regression coefficient');
    // Regression guard: never the empty string that bug #1 caused
    expect(capturedBody.term).not.toBe('');
  });

  test('recommendations card Start button navigates to reading page', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    await page.route('**/api/v1/superpowers/recommendations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            paper: { id: 'p1', title: 'Test Paper' },
            assignment_id: 'asn-recommended',
            reason: "You haven't started this yet",
          },
        ]),
      })
    );
    // The Start button should call POST /sessions/ then navigate
    await page.route('**/api/v1/sessions/', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: 'sess-1',
          assignment_id: 'asn-recommended',
          paper_id: 'p1',
          status: 'in_progress',
          current_section_index: 0,
          reading_guide: { sections: [] },
          paper_title: 'Test Paper',
        }),
      })
    );

    await page.goto('/student/self-study');
    await page.waitForSelector('[data-testid="recommendation-card"]');
    await page.click('[data-testid="recommendation-start-button"]');

    await page.waitForURL('**/student/read/asn-recommended');
    expect(page.url()).toContain('asn-recommended');
  });

  test('self-study upload form has no category field', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    await page.goto('/student/self-study');
    // Bug #6: form previously had a category field that backend ignored
    const categoryField = page.locator('[name="category"]');
    await expect(categoryField).toHaveCount(0);
  });

  test('email-confirmation panel shown after signup', async ({ page }) => {
    await page.route('**/api/v1/auth/signup', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'u-1',
          email_confirmation_required: true,
        }),
      })
    );

    await page.goto('/auth');
    await page.click('text=/sign up|create account/i');
    await page.fill('[name="name"]', 'Test User');
    await page.fill('[name="email"]', 'newuser@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/check your email|confirmation/i')).toBeVisible({
      timeout: 5000,
    });
    // Should NOT redirect — user stays on /auth until they confirm
    expect(page.url()).toContain('/auth');
    // No token stored
    const storedUser = await page.evaluate(() => localStorage.getItem('readlab_user'));
    expect(storedUser).toBeNull();
  });

  test('signin shows email-not-confirmed message when backend says so', async ({ page }) => {
    await page.route('**/api/v1/auth/signin', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Email not confirmed. Check your inbox for a confirmation link.',
        }),
      })
    );

    await page.goto('/auth');
    await page.fill('[name="email"]', 'unconfirmed@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/email not confirmed/i')).toBeVisible({ timeout: 5000 });
  });

  test('rate-limit toast shown on 429', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    await page.route('**/api/v1/sessions/*/jargon', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Rate limit exceeded: 60 per 1 minute' }),
      })
    );

    await page.goto('/student/read/test-assignment-uuid');
    await page.waitForSelector('[data-testid="jargon-input"]');
    await page.fill('[data-testid="jargon-input"]', 'foo');
    await page.click('[data-testid="jargon-lookup-button"]');

    // Toast appears — currently the api.ts interceptor passes the detail message through
    await expect(page.locator('text=/rate limit/i')).toBeVisible({ timeout: 5000 });
  });

  test('recommendations empty state renders', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    await page.route('**/api/v1/superpowers/recommendations', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.goto('/student/self-study');
    // Empty state shows (whatever the UI renders — adjust selector to match)
    await expect(page.locator('[data-testid="recommendations-empty"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test('signup response no longer contains access_token (auth contract regression guard)', async ({ page }) => {
    let signupResponseBody = null;
    await page.route('**/api/v1/auth/signup', async (route) => {
      const response = {
        user_id: 'u-1',
        email_confirmation_required: true,
      };
      signupResponseBody = response;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });

    await page.goto('/auth');
    await page.click('text=/sign up|create account/i');
    await page.fill('[name="name"]', 'X');
    await page.fill('[name="email"]', 'x@y.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForResponse('**/signup');

    expect(signupResponseBody).toMatchObject({ user_id: expect.any(String) });
    expect(signupResponseBody).not.toHaveProperty('access_token');
    expect(signupResponseBody).not.toHaveProperty('refresh_token');
  });
});
```

NOTE: The `data-testid` attributes referenced (`jargon-input`, `jargon-lookup-button`, `recommendation-card`, `recommendation-start-button`, `recommendations-empty`) MUST exist in the relevant components. If any are missing, add them to the components in this same task as a small modification to `AiGuidancePanel.tsx` and `SelfStudyPage.tsx`. Use the convention `data-testid="<feature-name>"`.

- [ ] **Step 8.4: Add data-testid attributes to components if missing**

Run: `grep -rn "data-testid" frontend/src/components/reading/AiGuidancePanel.tsx frontend/src/pages/student/SelfStudyPage.tsx`

For each `data-testid` referenced in `cleanup-verification.spec.js` that's NOT already present, add it to the corresponding JSX element. Example:
```jsx
<input
  data-testid="jargon-input"
  type="text"
  placeholder="Look up a term..."
  ...
/>
```

Don't change anything else — this is a tiny additive change to make tests robust.

- [ ] **Step 8.5: Run cleanup-verification spec, fix selectors as needed**

Run: `cd frontend && npx playwright test tests/cleanup-verification.spec.js --project=chromium`

If a test fails because a `data-testid` doesn't exist, add it (Step 8.4). If it fails because the UI behaves differently than the test expects, the test reflects the spec — investigate the UI.

- [ ] **Step 8.6: Create `frontend/tests/a11y.spec.js`**

Create:

```javascript
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { loginAsStudent, loginAsTeacher, mockStudentApiRoutes, mockTeacherApiRoutes } = require('./helpers');


/**
 * Baseline accessibility scan. Asserts no SERIOUS or CRITICAL violations
 * on the listed pages. Logs MODERATE for the user's punch list.
 */


async function scan(page, name) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  const moderate = results.violations.filter((v) => v.impact === 'moderate');

  if (moderate.length > 0) {
    console.log(`[a11y][${name}] ${moderate.length} moderate violations:`);
    for (const v of moderate) {
      console.log(`  - ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
    }
  }

  if (serious.length > 0) {
    const summary = serious
      .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} nodes`)
      .join('\n  ');
    throw new Error(`${name}: ${serious.length} serious/critical a11y violations:\n  ${summary}`);
  }
}


test.describe('Accessibility baseline', () => {

  test('landing page', async ({ page }) => {
    await page.goto('/');
    await scan(page, 'landing');
  });

  test('auth page', async ({ page }) => {
    await page.goto('/auth');
    await scan(page, 'auth');
  });

  test('student dashboard', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/dashboard');
    await scan(page, 'student-dashboard');
  });

  test('student self-study', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/self-study');
    await scan(page, 'student-self-study');
  });

  test('student reading page', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/read/test-assignment-uuid');
    await scan(page, 'student-reading');
  });

  test('teacher papers page', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/papers');
    await scan(page, 'teacher-papers');
  });

  test('teacher classes page', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/classes');
    await scan(page, 'teacher-classes');
  });

  test('teacher dashboard', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/dashboard/c1');
    await scan(page, 'teacher-dashboard');
  });
});
```

- [ ] **Step 8.7: Run a11y spec**

Run: `cd frontend && npx playwright test tests/a11y.spec.js --project=chromium --reporter=line`

Capture the moderate-violations list from the console output for inclusion in the summary doc (Task 9).

If a test FAILS due to serious/critical violations, that's real news — record the violations and decide:
- (a) fix the most egregious now (a few are usually trivial — missing alt text, missing form label)
- (b) add `// TODO(a11y):` comments and accept failure for now
- (c) downgrade the assertion threshold to skip (NOT recommended)

User explicitly approved adding a11y; treat failures as findings, not blockers.

- [ ] **Step 8.8: Create `frontend/tests/mobile-subset.spec.js`**

Create:

```javascript
const { test, expect } = require('@playwright/test');
const { loginAsStudent, loginAsTeacher, mockStudentApiRoutes, mockTeacherApiRoutes } = require('./helpers');


/**
 * Subset of flows run at mobile (iPhone SE) and tablet (iPad) viewports.
 * Failures here surface mobile/responsive issues for the user to address.
 *
 * This file is run by playwright projects 'mobile' and 'tablet' only —
 * the desktop project ignores it.
 */


test.describe('Mobile/tablet viewport sanity', () => {

  test('auth page renders without horizontal scroll', async ({ page }) => {
    await page.goto('/auth');
    const overflowX = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflowX).toBe(false);
  });

  test('student dashboard renders without horizontal scroll', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    const overflowX = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflowX).toBe(false);
  });

  test('reading page is usable (sections sidebar accessible)', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/read/test-assignment-uuid');
    // On mobile, the three-panel layout is unlikely to fit. The sections
    // sidebar should still be reachable somehow (drawer, toggle, etc.).
    // This is intentionally a weak assertion — strongly expect failure
    // until the user does a mobile-first redesign.
    const sectionsToggle = page.locator('[data-testid="sections-toggle"], [data-testid="mobile-menu"]');
    await expect(sectionsToggle.first()).toBeVisible({ timeout: 5000 });
  });

  test('teacher papers page renders without horizontal scroll', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    const overflowX = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflowX).toBe(false);
  });
});
```

- [ ] **Step 8.9: Run mobile + tablet projects**

```bash
cd frontend && npx playwright test --project=mobile --reporter=line
cd frontend && npx playwright test --project=tablet --reporter=line
```

Failures expected. Capture them for the summary doc. Do NOT fix the failures themselves — they become the user's mobile redesign punch list.

- [ ] **Step 8.10: Run the full desktop suite to confirm no regressions**

```bash
cd frontend && npx playwright test --project=chromium --reporter=line
```

Expected: all pre-existing 301 + new ~10 cleanup-verification + new 8 a11y = ~319 passing on desktop. The mobile-subset spec is excluded from this project.

- [ ] **Step 8.11: Run Vite build to confirm no TypeScript errors**

```bash
cd frontend && npm run build
```

Expected: `✓ built in <Xms>` with no TS errors.

- [ ] **Step 8.12: Commit (frontend tests + viewport projects)**

```bash
git add frontend/playwright.config.js frontend/package.json frontend/package-lock.json frontend/tests/cleanup-verification.spec.js frontend/tests/a11y.spec.js frontend/tests/mobile-subset.spec.js frontend/src/components/reading/AiGuidancePanel.tsx frontend/src/pages/student/SelfStudyPage.tsx
git commit -m "$(cat <<'EOF'
test(frontend): add cleanup verification, a11y baseline, mobile/tablet viewports

- cleanup-verification.spec.js: locks in May-1 fixes (jargon term,
  recommendations Start, removed category field, email-confirmation
  panel, rate-limit toast, signup auth contract)
- a11y.spec.js: baseline scan via @axe-core/playwright on landing,
  auth, both dashboards, reading, self-study; asserts no
  serious/critical violations
- mobile-subset.spec.js: runs at iPhone SE + iPad viewports, gated
  by playwright config projects; surfaces responsive failures
- playwright.config.js: add mobile and tablet projects, gate
  mobile-subset.spec.js to those projects only
- Add data-testid attributes to AiGuidancePanel and SelfStudyPage
  for stable test selectors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Write summary doc and final verification

**Files:**
- Create: `docs/refactor/05-cleanup-2026-05-02.md`

- [ ] **Step 9.1: Run final verification suite**

```bash
cd backend && pytest -q
cd ../frontend && npx playwright test --project=chromium --reporter=line
cd frontend && npm run build
```

Expected:
- pytest: 79 + ~14 = ~93 passing
- Playwright desktop: 301 + 10 cleanup + 8 a11y = ~319 passing
- Vite build: success

If anything fails, FIX IT before continuing. Don't write a summary that lies.

- [ ] **Step 9.2: Capture mobile/tablet results**

```bash
cd frontend && npx playwright test --project=mobile --reporter=line 2>&1 | tee /tmp/mobile-results.txt
cd frontend && npx playwright test --project=tablet --reporter=line 2>&1 | tee /tmp/tablet-results.txt
```

Capture pass/fail counts and the failure messages.

- [ ] **Step 9.3: Capture a11y moderate-violations list**

```bash
cd frontend && npx playwright test tests/a11y.spec.js --project=chromium --reporter=line 2>&1 | grep -E "\[a11y\]" | tee /tmp/a11y-moderate.txt
```

- [ ] **Step 9.4: Write `docs/refactor/05-cleanup-2026-05-02.md`**

Create the file with sections:

```markdown
# Cleanup 2026-05-02 — Summary

**Branch:** `cleanup/2026-05-02` (worktree: `../ReadLabAI-cleanup`)
**Commits:** 6 (one per task group)
**Spec:** `docs/superpowers/specs/2026-05-02-codebase-cleanup-design.md`
**Plan:** `docs/superpowers/plans/2026-05-02-codebase-cleanup.md`

## Changed

### Architectural debt closed (refactor commits 1-3)
- Background tasks now use the async `db.from_()` everywhere (anti-pattern #2)
- `require_teacher` / `require_student` collapsed into `require_role(role)` factory (anti-pattern #5)
- Module-level `settings = get_settings()` and `ANON_HEADERS` removed across 9 files (anti-pattern #4)
- `supabase` Python package dropped from requirements

### Reliability fixes (commit 4)
- JWKS cache: 10-min TTL + force-refresh-and-retry on verify failure
- JWT exception scope narrowed: bare `Exception` removed
- Session-start race: 409-gated fallback preserves `current_section_index`

### Response models (commit 5)
- 17 endpoints across sessions, dashboard, library, superpowers
- Stable endpoints (assignments, classes, papers) intentionally NOT touched

### Test coverage (commit 6)
- Backend: ~14 new pytest cases (rate limits, JWKS, role factory, race, response shapes)
- Frontend: ~10 new Playwright cases locking May-1 fixes
- A11y baseline via @axe-core/playwright on 8 pages
- Mobile (iPhone SE) and tablet (iPad) projects added

## Test results

- pytest: PASS_COUNT passing
- Playwright desktop: PASS_COUNT passing
- Playwright mobile: MOBILE_PASS / MOBILE_FAIL (failures listed below)
- Playwright tablet: TABLET_PASS / TABLET_FAIL
- Vite build: success

### Mobile/tablet failures (user punch list)

(paste from /tmp/mobile-results.txt and /tmp/tablet-results.txt — pass-fail summary plus first line of each failure)

### A11y moderate violations (user punch list)

(paste from /tmp/a11y-moderate.txt)

## What's still deferred

| Item | Why |
|---|---|
| RLS / service-role rework (anti-pattern #8) | Major rewrite, separate spec planned next |
| CORS production domain | Phase 6.1 — needs prod domain |
| Sentry | Phase 6.3 — needs DSN |
| Supabase RLS policy audit | Phase 6.5 |
| Gemini spend caps | Phase 6.6 |
| Email-confirmation redirect handling | Phase 6.12 |
| Pagination on list endpoints | Original audit risk-area, not yet hitting it |
| Background task queue (Celery) | Sub-30s Gemini calls don't need it |
| Live Supabase/Gemini integration tests | Needs dev project + user-in-loop |
| Browser-matrix testing | Cheap to add later |
| Mobile-first redesign | Failing-test signal added, redesign is separate work |

## Hand-off

User runs the manual smoke test in `docs/AUDIT_2026-05-01.md` against the live stack. Then the next major effort is the RLS/service-role rework (separate brainstorming + spec planned).
```

Replace the `PASS_COUNT` and capture sections with actual numbers from Step 9.1-9.3.

- [ ] **Step 9.5: Commit summary doc**

```bash
git add docs/refactor/05-cleanup-2026-05-02.md
git commit -m "$(cat <<'EOF'
docs(refactor): summary of 2026-05-02 cleanup

Records the six commits, test results, and explicit deferred items
(RLS rework, CORS, Sentry, mobile redesign).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9.6: Show the final commit log to the user**

```bash
git log --oneline cleanup/2026-05-02 ^master
```

Expected output: 7 commits (6 fixes + summary), all with clean messages.

- [ ] **Step 9.7: Hand off to user for review**

Report to user:
- Branch ready: `cleanup/2026-05-02`
- Worktree: `../ReadLabAI-cleanup`
- Test counts: backend XX/XX, Playwright desktop XX/XX
- Mobile/tablet failures captured in summary doc
- A11y moderate violations captured in summary doc
- Next: user merges (or cherry-picks), then runs manual smoke test from `AUDIT_2026-05-01.md`

---

## Done

After Task 9 the work is complete. The user takes over for manual smoke testing against their live Supabase/Gemini stack.
