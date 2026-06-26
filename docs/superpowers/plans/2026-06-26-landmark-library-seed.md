# Landmark-Paper Library Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, for a curated list of landmark open-access papers, three Pro reading guides (beginner/intermediate/advanced) + a quiz per difficulty, stored as published self-study assignments — converting expiring GCP credits into a durable student library.

**Architecture:** A resumable async generator (`backend/scripts/seed_landmark_library.py`) reads a paper list, resolves each via CORE (search + title-verified full-text fetch), calls the existing `generate_reading_guide`/`generate_quiz_questions` (extended with optional `model`/`difficulty` params) on **Pro**, and inserts paper + 3 assignments + critical_prompts + quiz_questions via the service-role key. Idempotent on paper title; resumable; runs locally with `AI_PROVIDER=vertex`.

**Tech Stack:** Python/asyncio, `google-genai` (Vertex, gemini-2.5-pro), CORE API (`backend/services/core_api.py`), Supabase PostgREST (`backend/db.py`), pytest.

**Spec:** `docs/superpowers/specs/2026-06-26-landmark-library-seed-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/ai_provider.py` | Gemini calls | Add optional `model` to `_generate`/`generate_reading_guide`/`generate_quiz_questions`; optional `difficulty` to `generate_reading_guide`. Backward-compatible |
| `backend/tests/test_ai_provider.py` | Tests | Add tests for model passthrough + difficulty targeting |
| `backend/config.py` | Settings | Add `landmark_user_id` setting (script-only) |
| `backend/scripts/seed_landmark_library.py` | Generator | Create: read list → CORE resolve → Pro generate×3 difficulties → insert |
| `backend/data/landmark_papers.json` | Input data | Create: curated list of `{title, field, arxiv_id?}` (subagent-compiled) |

**Execution model:** Tasks 1 & 3 are code (subagent-driven, sequential — 3 depends on 1). Task 2 (paper list) is independent data work via **parallel subagents** — dispatch it early, concurrently with the code build. Task 4 (service user) is one-time ops. Tasks 5–6 (dry-run, full run) are controller-run after 1–4 complete.

---

## Task 1: ai_provider — model + difficulty params

**Files:**
- Modify: `backend/ai_provider.py` (`_generate`, `generate_reading_guide`, `generate_quiz_questions`)
- Test: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_ai_provider.py`. Also add `_generate` to the existing import from `backend.ai_provider` (top of file):

```python
import backend.ai_provider as ai_provider_module
from backend.ai_provider import _generate  # add to the existing import line
```

Then append:

```python
@pytest.mark.asyncio
async def test_generate_passes_model_through():
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=MagicMock(text="ok"))
    with patch("backend.ai_provider._get_client", return_value=mock_client):
        await _generate("prompt", temperature=0.1, model="gemini-2.5-pro")
    assert mock_client.aio.models.generate_content.call_args.kwargs["model"] == "gemini-2.5-pro"


@pytest.mark.asyncio
async def test_reading_guide_targets_difficulty_when_set():
    captured = {}

    async def fake(prompt, **kwargs):
        captured["prompt"] = prompt
        return json.dumps({
            "sections": [{"title": "X", "text": "t", "guiding_questions": [],
                          "key_terms": [], "teacher_notes": "", "section_type": "Other"}],
            "difficulty": "whatever",
            "critical_prompts": [],
        })

    with patch("backend.ai_provider._generate", side_effect=fake):
        result = await generate_reading_guide("text", figure_count=0,
                                              model="gemini-2.5-pro", difficulty="beginner")
    assert "high-school reader" in captured["prompt"]
    assert result["difficulty"] == "beginner"


@pytest.mark.asyncio
async def test_reading_guide_default_leaves_prompt_unchanged():
    captured = {}

    async def fake(prompt, **kwargs):
        captured["prompt"] = prompt
        return json.dumps({
            "sections": [{"title": "X", "text": "t", "guiding_questions": [],
                          "key_terms": [], "teacher_notes": "", "section_type": "Other"}],
            "difficulty": "intermediate",
            "critical_prompts": [],
        })

    with patch("backend.ai_provider._generate", side_effect=fake):
        await generate_reading_guide("text", figure_count=0)
    assert "Target this guide specifically" not in captured["prompt"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_ai_provider.py -k "passes_model_through or targets_difficulty or default_leaves_prompt" -v`
Expected: FAIL — `TypeError: _generate() got an unexpected keyword argument 'model'`.

- [ ] **Step 3: Add model param to _generate()**

In `backend/ai_provider.py`, replace:

```python
async def _generate(prompt: str, *, temperature: float, json_mode: bool = False) -> str:
    """Single point of contact with the Gemini SDK.

    Tests patch this function directly to bypass network calls.
    """
    config_kwargs: dict = {"temperature": temperature}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"
    response = await _get_client().aio.models.generate_content(
        model=_MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(**config_kwargs),
    )
    return response.text or ""
```

with:

```python
async def _generate(prompt: str, *, temperature: float, json_mode: bool = False, model: str = _MODEL_NAME) -> str:
    """Single point of contact with the Gemini SDK.

    Tests patch this function directly to bypass network calls.
    """
    config_kwargs: dict = {"temperature": temperature}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"
    response = await _get_client().aio.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(**config_kwargs),
    )
    return response.text or ""
```

- [ ] **Step 4: Add difficulty targeting to generate_reading_guide()**

In `backend/ai_provider.py`, replace the `generate_reading_guide` signature and the call to `_generate`. Change:

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_reading_guide(extracted_text: str, figure_count: int) -> dict:
```

to:

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_reading_guide(
    extracted_text: str,
    figure_count: int,
    *,
    model: str = _MODEL_NAME,
    difficulty: str | None = None,
) -> dict:
```

Then, immediately after the line `This paper contains {figure_count} embedded figures, images, or tables.` inside the prompt f-string, add a conditional targeting block. Replace:

```python
This paper contains {figure_count} embedded figures, images, or tables.

Return a JSON object with this exact structure:
```

with:

```python
This paper contains {figure_count} embedded figures, images, or tables.
{_difficulty_block(difficulty)}
Return a JSON object with this exact structure:
```

And add a module-level helper just above `generate_reading_guide`:

```python
_DIFFICULTY_AUDIENCE = {
    "beginner": "a high-school reader",
    "intermediate": "an undergraduate student",
    "advanced": "a graduate researcher",
}


def _difficulty_block(difficulty: str | None) -> str:
    """Extra prompt instructions when a specific reading level is requested.
    Empty string preserves the original auto-detect behavior."""
    if not difficulty:
        return ""
    audience = _DIFFICULTY_AUDIENCE.get(difficulty, difficulty)
    return (
        f"\nTarget this guide specifically at {audience}. Frame all guiding "
        f"questions, key-term explanations, and section framing to be appropriately "
        f"accessible for that level, and set the \"difficulty\" field to \"{difficulty}\".\n"
    )
```

Finally, replace the tail of the function:

```python
    raw = await _generate(prompt, temperature=0.3, json_mode=True)
    return _parse_json(raw)
```

with:

```python
    raw = await _generate(prompt, temperature=0.3, json_mode=True, model=model)
    data = _parse_json(raw)
    if difficulty:
        data["difficulty"] = difficulty
    return data
```

- [ ] **Step 5: Add model param to generate_quiz_questions()**

In `backend/ai_provider.py`, replace:

```python
async def generate_quiz_questions(paper_title: str, sections: list[dict], difficulty: str) -> list[dict]:
```

with:

```python
async def generate_quiz_questions(
    paper_title: str,
    sections: list[dict],
    difficulty: str,
    *,
    model: str = _MODEL_NAME,
) -> list[dict]:
```

And replace its final call:

```python
    raw = await _generate(prompt, temperature=0.3, json_mode=True)
    return _parse_json(raw)
```

with:

```python
    raw = await _generate(prompt, temperature=0.3, json_mode=True, model=model)
    return _parse_json(raw)
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `cd backend && pytest tests/test_ai_provider.py -k "passes_model_through or targets_difficulty or default_leaves_prompt" -v`
Expected: PASS — 3 passed.

- [ ] **Step 7: Run the full ai_provider suite (no regressions)**

Run: `cd backend && pytest tests/test_ai_provider.py -v`
Expected: PASS — all existing tests still green (defaults preserve prior behavior).

- [ ] **Step 8: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat(ai): optional model + difficulty params for reading-guide/quiz generation"
```

---

## Task 2: config — landmark_user_id setting

**Files:**
- Modify: `backend/config.py`

- [ ] **Step 1: Add the setting**

In `backend/config.py`, in the `Settings` class, add after the `environment: str = "development"` line:

```python
    # Landmark-library seed script: UUID of the service user that owns seeded
    # papers. Only used by backend/scripts/seed_landmark_library.py (not the app).
    landmark_user_id: str = ""
```

(Not added to `_required_for_production` — it's script-only.)

- [ ] **Step 2: Verify import works**

Run: `cd backend && python -c "from backend.config import get_settings; print(repr(get_settings().landmark_user_id))"`
Expected: prints `''` (empty default), no error.

- [ ] **Step 3: Commit**

```bash
git add backend/config.py
git commit -m "feat(config): add landmark_user_id setting for the seed script"
```

---

## Task 3: Generator script

**Files:**
- Create: `backend/scripts/__init__.py` (empty, so it's a package)
- Create: `backend/scripts/seed_landmark_library.py`

- [ ] **Step 1: Create the scripts package**

Create empty file `backend/scripts/__init__.py` (no contents).

- [ ] **Step 2: Create the generator**

Create `backend/scripts/seed_landmark_library.py`:

```python
"""One-time batch: seed a landmark-paper library.

For each paper in backend/data/landmark_papers.json:
  resolve via CORE (search + title-verified full-text fetch) -> generate three
  Pro reading guides (beginner/intermediate/advanced) + a quiz per difficulty ->
  insert one paper + three published self-study assignments (class_id=NULL) +
  critical_prompts + quiz_questions.

Idempotent (skips papers whose title already exists) and resumable. Run locally
with AI_PROVIDER=vertex (gcloud ADC) + the service-role key in backend/.env.

Env:
  SEED_DRY_RUN=N   process only the first N entries (validation)
  SEED_CONCURRENCY  parallel papers (default 4)
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from backend.config import get_settings
from backend.db import get_db, aclose_shared_client
from backend.services.core_api import search_core, fetch_core_full_text
from backend.ai_provider import generate_reading_guide, generate_quiz_questions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("seed_landmark")

PRO_MODEL = "gemini-2.5-pro"
DIFFICULTIES = ["beginner", "intermediate", "advanced"]
CONCURRENCY = int(os.environ.get("SEED_CONCURRENCY", "4"))
DRY_RUN_SLICE = int(os.environ.get("SEED_DRY_RUN", "0"))
LIST_PATH = Path(__file__).resolve().parent.parent / "data" / "landmark_papers.json"


async def _resolve_and_fetch(entry: dict) -> dict | None:
    """CORE search by arxiv_id (preferred) or title, then title-verified full-text fetch."""
    query = entry.get("arxiv_id") or entry["title"]
    results = await search_core(query, limit=5)
    if not results:
        log.warning("CORE search empty for %r", entry["title"])
        return None
    core = await fetch_core_full_text(results[0]["core_id"], entry["title"])
    if not core or not core.get("full_text"):
        log.warning("No full text for %r", entry["title"])
        return None
    return core


async def _seed_one(db, entry: dict) -> None:
    title = entry["title"]

    # Idempotency: skip if a paper with this curated title already exists.
    existing = await db.from_("papers").select("id").eq("title", title).maybe_single().execute()
    if existing.data:
        log.info("SKIP (exists): %s", title)
        return

    core = await _resolve_and_fetch(entry)
    if not core:
        return

    paper_res = await db.from_("papers").insert({
        "title": title,
        "extracted_text": core["full_text"],
        "figures": [],
        "uploaded_by": get_settings().landmark_user_id,
        "core_id": core["core_id"],
    }).execute()
    if not paper_res.data:
        log.error("paper insert failed: %s — %s", title, paper_res.error)
        return
    paper_id = paper_res.data[0]["id"]

    for difficulty in DIFFICULTIES:
        try:
            guide = await generate_reading_guide(
                core["full_text"], figure_count=0, model=PRO_MODEL, difficulty=difficulty,
            )
            critical_prompts = guide.pop("critical_prompts", [])

            asn_res = await db.from_("assignments").insert({
                "class_id": None,
                "paper_id": paper_id,
                "status": "published",
                "reading_guide": guide,
                "difficulty": difficulty,
            }).execute()
            if not asn_res.data:
                log.error("assignment insert failed: %s [%s]", title, difficulty)
                continue
            assignment_id = asn_res.data[0]["id"]

            if critical_prompts:
                for p in critical_prompts:
                    p["assignment_id"] = assignment_id
                await db.from_("critical_prompts").insert(critical_prompts).execute()

            quiz = await generate_quiz_questions(
                title, guide.get("sections", []), difficulty, model=PRO_MODEL,
            )
            rows = [{**q, "assignment_id": assignment_id} for q in quiz]
            if rows:
                await db.from_("quiz_questions").insert(rows).execute()
            log.info("OK %s [%s]", title, difficulty)
        except Exception as e:
            log.exception("FAILED %s [%s]: %s", title, difficulty, e)


async def main() -> None:
    if not get_settings().landmark_user_id:
        sys.exit("LANDMARK_USER_ID not set — run the create-service-user step first.")
    if not LIST_PATH.exists():
        sys.exit(f"Missing paper list: {LIST_PATH}")

    entries = json.loads(LIST_PATH.read_text())
    if DRY_RUN_SLICE:
        entries = entries[:DRY_RUN_SLICE]
    log.info("Seeding %d papers (concurrency=%d, dry_run=%d)",
             len(entries), CONCURRENCY, DRY_RUN_SLICE)

    db = get_db()
    sem = asyncio.Semaphore(CONCURRENCY)

    async def bounded(entry: dict) -> None:
        async with sem:
            try:
                await _seed_one(db, entry)
            except Exception as e:
                log.exception("UNEXPECTED %s: %s", entry.get("title"), e)

    await asyncio.gather(*(bounded(e) for e in entries))
    await aclose_shared_client()
    log.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Syntax/import check (no network)**

Run: `cd backend && python -c "import backend.scripts.seed_landmark_library as m; print('import ok', m.PRO_MODEL)"`
Expected: prints `import ok gemini-2.5-pro` (proves imports resolve). It must NOT require env vars or network at import time.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/__init__.py backend/scripts/seed_landmark_library.py
git commit -m "feat(scripts): landmark-library seed generator (CORE + Pro x3 difficulties)"
```

---

## Task 4: Paper list (parallel subagents)

**Files:**
- Create: `backend/data/landmark_papers.json`

- [ ] **Step 1: Compile the list via parallel subagents (one per field)**

Dispatch one general-purpose subagent per field (cs, biology, physics, medicine, economics, chemistry, psychology, …) instructing each to produce a JSON array of ~30–60 genuinely famous/landmark open-access papers in that field, each entry `{"title": "<exact paper title>", "field": "<field>", "arxiv_id": "<id or omit>"}`. Titles must be exact (CORE search matches on them). For CS/math papers, include the arXiv ID. Merge all slices into one `backend/data/landmark_papers.json` (a single JSON array). Target ~200–400 papers total (keeps CORE calls within the ~1,000/day cap at 2 calls/paper).

- [ ] **Step 2: Validate the list shape**

Run: `cd backend && python -c "import json; d=json.load(open('data/landmark_papers.json')); print(len(d), 'papers'); assert all('title' in x and 'field' in x for x in d); print('ok')"`
Expected: prints `N papers` then `ok` (N ≈ 200–400).

- [ ] **Step 3: Commit**

```bash
git add backend/data/landmark_papers.json
git commit -m "feat(data): curated landmark-papers list for library seed"
```

---

## Task 5: Create the landmark service user (ops, controller-run)

**Files:** none (writes a UUID into `backend/.env`)

- [ ] **Step 1: Create the user via the Supabase Auth admin API**

Run this Python snippet from the repo root (it reads the service-role key from `backend/.env` via settings):

```bash
cd backend && python -c "
import asyncio, secrets, json, httpx
from backend.config import get_settings
s = get_settings()
pw = secrets.token_urlsafe(18)
r = httpx.post(
    f'{s.supabase_url}/auth/v1/admin/users',
    headers={'apikey': s.supabase_service_role_key, 'Authorization': f'Bearer {s.supabase_service_role_key}'},
    json={'email': 'landmark-library@readlabs.local', 'password': pw, 'email_confirm': True, 'user_metadata': {'full_name': 'Landmark Library'}},
    timeout=15,
)
print('status', r.status_code)
print('UUID', r.json().get('id'))
"
```
Expected: `status 201`, then `UUID <some-uuid>`.

- [ ] **Step 2: Record the UUID in backend/.env**

Append `LANDMARK_USER_ID=<uuid-from-step-1>` to `backend/.env`.

- [ ] **Step 3: Verify the setting loads**

Run: `cd backend && python -c "from backend.config import get_settings; print(get_settings().landmark_user_id)"`
Expected: prints the UUID.

---

## Task 6: Dry-run on 2–3 papers (controller-run)

**Prereq:** Tasks 1–5 done. Local env: `AI_PROVIDER=vertex`, `GCP_PROJECT_ID=readlabs-prod`, `GCP_REGION=us-central1` set in `backend/.env`; operator has run `gcloud auth application-default login`.

- [ ] **Step 1: Run the generator on the first 2 entries**

Run: `cd backend && SEED_DRY_RUN=2 python -m backend.scripts.seed_landmark_library`
Expected: logs `OK <title> [beginner/intermediate/advanced]` for each of 2 papers × 3 difficulties; no `FAILED`/`UNEXPECTED` lines. Terminates with `Done.`

- [ ] **Step 2: Verify the DB rows**

Run (substitute a title from the dry-run):
```bash
cd backend && python -c "
import asyncio
from backend.db import get_db, aclose_shared_client
async def go():
    db = get_db()
    p = await db.from_('papers').select('id,title,uploaded_by,core_id').order('created_at', desc=True).limit(2).execute()
    print('papers', p.data)
    for paper in (p.data or []):
        a = await db.from_('assignments').select('id,difficulty,status').eq('paper_id', paper['id']).execute()
        print(paper['title'], 'assignments', a.data)
    await aclose_shared_client()
asyncio.run(go())
"
```
Expected: 2 papers, each with 3 assignments (beginner/intermediate/advanced, status=published), owned by `LANDMARK_USER_ID`.

- [ ] **Step 3: Re-run to confirm idempotency**

Run: `cd backend && SEED_DRY_RUN=2 python -m backend.scripts.seed_landmark_library`
Expected: logs `SKIP (exists): …` for both; no new rows created.

---

## Task 7: Full run (controller-run)

**Prereq:** Task 6 dry-run passed.

- [ ] **Step 1: Run the full batch**

Run: `cd backend && python -m backend.scripts.seed_landmark_library`
Expected: processes the whole list (~200–400 papers), logging `OK`/`SKIP` per paper×difficulty, occasional `No full text` skips (logged, non-fatal). Resumable — re-running skips completed papers.

- [ ] **Step 2: Spot-check counts**

Run the Task 6 Step 2 snippet with `limit(50)` and confirm many papers × 3 assignments exist, owned by `LANDMARK_USER_ID`.

- [ ] **Step 3: Commit any run artifacts (none expected) + note completion**

No code changes from the run. The durable library now exists in the DB, ready for the deferred "expose later" feature.

---

## Self-Review Notes

- **Spec coverage:** ai_provider model/difficulty (Task 1), config landmark_user_id (Task 2), generator with 3 difficulties + quiz + idempotency + concurrency + resume (Task 3), paper list (Task 4), service-user prerequisite (Task 5), dry-run validation (Task 6), full run (Task 7). Embeddings + student exposure are intentionally out of scope (deferred spec). All spec sections mapped.
- **Type/name consistency:** `model`, `difficulty`, `_difficulty_block`, `_DIFFICULTY_AUDIENCE`, `landmark_user_id`, `PRO_MODEL`, `DIFFICULTIES` are used consistently across tasks. Insert column names (`title`, `extracted_text`, `figures`, `uploaded_by`, `core_id`, `class_id`, `paper_id`, `status`, `reading_guide`, `difficulty`, `assignment_id`) match the existing `library.py`/`superpowers.py` insert patterns verbatim.
- **No placeholders:** every code/command step contains full content. The paper-list entries are generated by subagents at execution (Task 4) — the format and validation are fully specified.
