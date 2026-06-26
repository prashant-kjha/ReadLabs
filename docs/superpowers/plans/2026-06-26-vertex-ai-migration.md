# Vertex AI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route production Gemini calls through Vertex AI (billed to `readlabs-prod`, authenticated by the Cloud Run runtime SA) while leaving local dev on the AI Studio API key, selected by an `AI_PROVIDER` env var.

**Architecture:** A dual-mode client: `_get_client()` in `backend/ai_provider.py` builds a Vertex client when `AI_PROVIDER=vertex`, else the existing API-key client. `_generate()` — the single SDK contact point all seven AI functions use — is unchanged, so no prompts, models, router call sites, or existing tests change. Production deploy sets `AI_PROVIDER=vertex` + project/region env vars; the runtime SA gets `roles/aiplatform.user`. The $7 kill-switch is raised to $25 with credits counted so moving AI into the project can't trip it.

**Tech Stack:** Python / FastAPI backend, `google-genai==2.5.0` (already supports `vertexai=True`), pydantic-settings, GitHub Actions → Cloud Run, GCP IAM + Cloud Billing budgets.

**Spec:** `docs/superpowers/specs/2026-06-26-vertex-ai-migration-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/config.py` | App settings + production-required check | Add `ai_provider`, `gcp_project_id`, `gcp_region`; replace `_REQUIRED_FOR_PRODUCTION` tuple with provider-aware `_required_for_production(s)` |
| `backend/ai_provider.py` | Build the Gemini client | `_get_client()` dual-mode (Vertex vs API key). `_generate()` and all public functions unchanged |
| `backend/tests/test_config.py` | New | Unit tests for `_required_for_production` |
| `backend/tests/test_ai_provider.py` | Existing | Append `_get_client()` surface-selection tests |
| `.github/workflows/backend-deploy.yml` | Cloud Run deploy | Add `AI_PROVIDER=vertex`, `GCP_PROJECT_ID`, `GCP_REGION` env vars. Keep `GEMINI_API_KEY` secret |
| (infra, no repo file) | Enable Vertex API, grant IAM, recalibrate kill-switch | Manual gcloud + Console/REST ops in Task 5 |

**Ordering rationale:** Tasks 1–4 are local code/tests/CI — no GCP access needed (default `ai_provider=studio`, tests mock the client). Task 5 (infra) runs **before** the merge in Task 6 so Vertex is callable the instant prod flips. The kill-switch is recalibrated in Task 5 so ongoing AI spend (now inside the project) cannot trip the old $7 cap.

---

## Task 1: Provider-aware config

**Files:**
- Modify: `backend/config.py`
- Test: `backend/tests/test_config.py` (create)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_config.py`:

```python
from backend.config import Settings, _required_for_production


def test_vertex_provider_does_not_require_gemini_key():
    s = Settings(ai_provider="vertex", gcp_project_id="readlabs-prod")
    required = _required_for_production(s)
    assert "gemini_api_key" not in required
    assert "gcp_project_id" in required


def test_studio_provider_requires_gemini_key():
    s = Settings(ai_provider="studio")
    required = _required_for_production(s)
    assert "gemini_api_key" in required
    assert "gcp_project_id" not in required


def test_base_secrets_always_required_regardless_of_provider():
    s = Settings(ai_provider="vertex", gcp_project_id="p")
    required = _required_for_production(s)
    for base in ("supabase_url", "supabase_anon_key", "supabase_service_role_key"):
        assert base in required
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: FAIL — `ImportError: cannot import name '_required_for_production'` (function doesn't exist yet).

- [ ] **Step 3: Add the provider settings fields**

In `backend/config.py`, replace the Gemini settings block:

```python
    # Gemini AI
    gemini_api_key: str = ""
```

with:

```python
    # Gemini AI
    gemini_api_key: str = ""  # used when ai_provider == "studio" (local/dev)
    # AI provider surface: "studio" (API key) | "vertex" (project billing via ADC, prod).
    # Explicit switch so production can flip back to the key path without a redeploy.
    ai_provider: str = "studio"
    gcp_project_id: str = ""  # required when ai_provider == "vertex"
    gcp_region: str = "us-central1"  # Vertex region; must match the Cloud Run region
```

- [ ] **Step 4: Replace the required-check tuple with a provider-aware function**

In `backend/config.py`, replace this block:

```python
# Secrets that MUST be set for the app to function correctly. Listed explicitly
# so a misconfigured deployment fails at startup, not on the first auth request.
_REQUIRED_FOR_PRODUCTION = (
    "supabase_url",
    "supabase_anon_key",
    "supabase_service_role_key",
    "gemini_api_key",  # AI reading-guide/feedback generation; fail fast if missing
)
```

with:

```python
# Secrets that MUST be set for the app to function correctly. Listed explicitly
# so a misconfigured deployment fails at startup, not on the first auth request.
# Provider-aware: Vertex authenticates via ADC (no key) and needs the project id;
# the AI Studio path needs the Gemini API key.
def _required_for_production(s: Settings) -> list[str]:
    base = ["supabase_url", "supabase_anon_key", "supabase_service_role_key"]
    if s.ai_provider == "vertex":
        return base + ["gcp_project_id"]
    return base + ["gemini_api_key"]
```

- [ ] **Step 5: Update get_settings() to call the new function**

In `backend/config.py`, replace:

```python
@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.environment == "production":
        missing = [name for name in _REQUIRED_FOR_PRODUCTION if not getattr(s, name)]
        if missing:
            raise RuntimeError(
                f"Missing required production env vars: {', '.join(missing)}"
            )
    return s
```

with:

```python
@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.environment == "production":
        missing = [name for name in _required_for_production(s) if not getattr(s, name)]
        if missing:
            raise RuntimeError(
                f"Missing required production env vars: {', '.join(missing)}"
            )
    return s
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: PASS — 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/config.py backend/tests/test_config.py
git commit -m "feat(config): provider-aware required-secrets check for Vertex AI"
```

---

## Task 2: Dual-mode AI client

**Files:**
- Modify: `backend/ai_provider.py` (only `_get_client()`)
- Test: `backend/tests/test_ai_provider.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_ai_provider.py`:

```python
import backend.ai_provider as ai_provider_module


@pytest.fixture
def reset_ai_client():
    """_get_client() caches its client in a module global; reset it around each test."""
    ai_provider_module._client = None
    yield
    ai_provider_module._client = None


def test_get_client_uses_vertex_when_configured(reset_ai_client):
    settings = MagicMock()
    settings.ai_provider = "vertex"
    settings.gcp_project_id = "readlabs-prod"
    settings.gcp_region = "us-central1"
    with patch("backend.ai_provider.genai") as mock_genai, patch(
        "backend.ai_provider.get_settings", return_value=settings
    ):
        ai_provider_module._get_client()
    mock_genai.Client.assert_called_once_with(
        vertexai=True, project="readlabs-prod", location="us-central1"
    )


def test_get_client_uses_api_key_in_studio_mode(reset_ai_client):
    settings = MagicMock()
    settings.ai_provider = "studio"
    settings.gemini_api_key = "fake-key"
    with patch("backend.ai_provider.genai") as mock_genai, patch(
        "backend.ai_provider.get_settings", return_value=settings
    ):
        ai_provider_module._get_client()
    mock_genai.Client.assert_called_once_with(api_key="fake-key")
```

Also add `MagicMock` to the existing import line at the top of the file. Change:

```python
from unittest.mock import AsyncMock, patch
```

to:

```python
from unittest.mock import AsyncMock, MagicMock, patch
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_ai_provider.py::test_get_client_uses_vertex_when_configured tests/test_ai_provider.py::test_get_client_uses_api_key_in_studio_mode -v`
Expected: FAIL — `AssertionError` because `_get_client()` always calls `genai.Client(api_key=...)` regardless of provider.

- [ ] **Step 3: Make _get_client() provider-aware**

In `backend/ai_provider.py`, replace:

```python
def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key)
    return _client
```

with:

```python
def _get_client() -> genai.Client:
    global _client
    if _client is None:
        s = get_settings()
        if s.ai_provider == "vertex":
            # Vertex AI: authenticates via the Cloud Run runtime SA (ADC). No API key;
            # bills the GCP project so promotional credits apply.
            _client = genai.Client(
                vertexai=True,
                project=s.gcp_project_id,
                location=s.gcp_region,
            )
        else:
            # AI Studio: API-key auth (local/dev fallback).
            _client = genai.Client(api_key=s.gemini_api_key)
    return _client
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd backend && pytest tests/test_ai_provider.py::test_get_client_uses_vertex_when_configured tests/test_ai_provider.py::test_get_client_uses_api_key_in_studio_mode -v`
Expected: PASS — 2 passed.

- [ ] **Step 5: Run the full ai_provider suite to confirm no regressions**

Run: `cd backend && pytest tests/test_ai_provider.py -v`
Expected: PASS — all existing tests (which patch `_generate`) still green.

- [ ] **Step 6: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat(ai): dual-mode Gemini client (Vertex in prod, API key in dev)"
```

---

## Task 3: Deploy workflow env vars

**Files:**
- Modify: `.github/workflows/backend-deploy.yml`

- [ ] **Step 1: Add the Vertex env vars to the Cloud Run deploy**

In `.github/workflows/backend-deploy.yml`, replace the `--set-env-vars` line:

```
            --set-env-vars "ENVIRONMENT=production,ALLOWED_ORIGINS=${{ vars.ALLOWED_ORIGINS }},SUPABASE_URL=${{ vars.SUPABASE_URL }},SENTRY_DSN=${{ vars.SENTRY_DSN }}" \
```

with:

```
            --set-env-vars "ENVIRONMENT=production,AI_PROVIDER=vertex,GCP_PROJECT_ID=${{ vars.GCP_PROJECT_ID }},GCP_REGION=${{ vars.GCP_REGION }},ALLOWED_ORIGINS=${{ vars.ALLOWED_ORIGINS }},SUPABASE_URL=${{ vars.SUPABASE_URL }},SENTRY_DSN=${{ vars.SENTRY_DSN }}" \
```

Leave the `--update-secrets` line **unchanged** — `GEMINI_API_KEY=gemini-api-key:latest` stays so the `AI_PROVIDER=studio` rollback works without a redeploy.

- [ ] **Step 2: Verify the edit**

Run: `grep -n "AI_PROVIDER\|GEMINI_API_KEY" .github/workflows/backend-deploy.yml`
Expected: a line containing `AI_PROVIDER=vertex` and the unchanged `GEMINI_API_KEY=gemini-api-key:latest`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backend-deploy.yml
git commit -m "ci(deploy): set AI_PROVIDER=vertex + project/region on Cloud Run"
```

---

## Task 4: Full test suite + push + open PR

**Files:** none (verification + git)

- [ ] **Step 1: Run the entire backend test suite**

Run: `cd backend && pytest -q`
Expected: PASS — all tests green (no behavior change; new tests added).

- [ ] **Step 2: Push the feature branch**

Run:
```bash
git push -u origin feat/vertex-ai-migration
```

- [ ] **Step 3: Open the PR**

Run:
```bash
"C:\Users\prash\AppData\Local\gh-cli\bin\gh.exe" pr create \
  --base main --head feat/vertex-ai-migration \
  --title "feat: migrate Gemini to Vertex AI (dual-mode)" \
  --body "Production Gemini calls route through Vertex AI (runtime SA / ADC), billed to readlabs-prod so the \$300 GCP credits apply. Local dev keeps the AI Studio key. Selected by AI_PROVIDER for instant no-redeploy rollback. Kill-switch raised \$7→\$25 with credits counted. Spec: docs/superpowers/specs/2026-06-26-vertex-ai-migration-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**Do not merge yet** — Task 5 (infra) must run first.

---

## Task 5: Infra runbook (run BEFORE merging the PR)

These are manual GCP ops. They make Vertex callable the moment prod flips in Task 6. `gcloud` works from Git Bash.

- [ ] **Step 1: Confirm the runtime service account name**

Run:
```bash
gcloud run services describe readlabs-api --region us-central1 \
  --format='value(spec.template.spec.serviceAccountName)'
```
Expected: `readlabs-runtime@readlabs-prod.iam.gserviceaccount.com`
If it differs, substitute the actual SA in Step 3.

- [ ] **Step 2: Enable the Vertex AI API**

Run:
```bash
gcloud services enable aiplatform.googleapis.com --project=readlabs-prod
```
Expected: `Operation finished successfully.` (enabling is free; billed only on use).

- [ ] **Step 3: Grant the runtime SA Vertex access**

Run:
```bash
gcloud projects add-iam-policy-binding readlabs-prod \
  --member="serviceAccount:readlabs-runtime@readlabs-prod.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```
Expected: `Updated iam policy for [readlabs-prod].`

- [ ] **Step 4: Recalibrate the kill-switch budget ($7 → $25, count credits)**

In the Cloud Console: **Billing → Budgets & alerts →** open the **$7 kill-switch budget** (the one whose Pub/Sub topic is `billing-killswitch`, not the $5 alert-only budget). Edit:
- **Amount:** $7 → **$25**
- **Credits:** set to **"Include all credits"** (so `costAmount` in the Pub/Sub message is net-of-credits; today's credit-covered batch reports ~$0 and cannot trip the cap)

If the Console UI can't set credit treatment, use the REST API:
```bash
# Get the budget resource name first (BILLING_ACCOUNT_ID and BUDGET_ID from Console):
gcloud billing budgets list --billing-account=BILLING_ACCOUNT_ID
# Patch via the billingBudgets REST API (creditTypesTreatment=INCLUDE_ALL_CREDITS, amount=25).
```
Verify: the kill-switch budget shows $25 and credit treatment "Include all credits". The $5 alert-only budget is unchanged.

---

## Task 6: Merge → deploy → smoke test → verify rollback

**Files:** none (deploy + verification)

- [ ] **Step 1: Merge the PR (triggers auto-deploy)**

Merge `feat/vertex-ai-migration` → `main`. The `Backend tests` workflow runs, then `Deploy backend to Cloud Run` deploys with `AI_PROVIDER=vertex`.

- [ ] **Step 2: Confirm the new env vars are live on Cloud Run**

Run:
```bash
gcloud run services describe readlabs-api --region us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```
Expected: `AI_PROVIDER: vertex`, `GCP_PROJECT_ID: readlabs-prod`, `GCP_REGION: us-central1` present.

- [ ] **Step 3: Smoke test three AI paths against live Vertex**

As a teacher/student via the app (or API), exercise:
1. **Reading-guide generation** — upload/assign a short paper → guide + sections appear.
2. **Jargon lookup** — click a key term → plain-English explanation returns.
3. **Quiz generation** — trigger quiz → 5 questions returned.

Expected: each returns 200 with sane output. If any fails with a Vertex permission/config error, run Step 5 (rollback) immediately and re-check Task 5.

- [ ] **Step 4: Confirm rollback command is armed (do NOT run it)**

Note the one-command rollback for future use:
```bash
gcloud run services update readlabs-api --region us-central1 \
  --update-env-vars AI_PROVIDER=studio
```
(No redeploy; flips back to the mounted `GEMINI_API_KEY` within seconds.)

- [ ] **Step 5: Rollback if smoke test fails**

Run the command from Step 4, confirm `api.readlabs.org` recovers on the AI Studio path, then diagnose the Vertex config issue before re-flipping to `vertex`.

---

## Self-Review Notes

- **Spec coverage:** config change (Task 1), `_get_client` dual-mode (Task 2), deploy env vars (Task 3), infra runbook incl. kill-switch recalibration (Task 5), smoke test + rollback (Task 6). All spec sections mapped to tasks. The "keep the key" decision is honored (Task 3 leaves `GEMINI_API_KEY` mounted; Task 6 rollback depends on it).
- **Type/name consistency:** `_required_for_production(s)` (Task 1) matches the import in `test_config.py`; `ai_provider`, `gcp_project_id`, `gcp_region` field names match usage in `_get_client()` (Task 2) and the deploy env vars (Task 3). The `reset_ai_client` fixture is referenced by both new `_get_client` tests.
- **No placeholders:** every code/command step contains the full content.
