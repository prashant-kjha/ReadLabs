# Gemini → Vertex AI Migration — Design Spec

**Date:** 2026-06-26
**Status:** Draft (awaiting user review)

---

## Overview

Move production Gemini calls from **Google AI Studio** (API-key authenticated, billed to the owner's personal account) to **Vertex AI** (project-authenticated via the Cloud Run runtime service account, billed to the `readlabs-prod` GCP project). This is the prerequisite that makes the project's $300 new-developer GCP credits applicable to AI spend, and it brings Gemini cost under the project's existing budgets/monitoring.

Local development keeps the current AI Studio API-key path unchanged. A single environment variable selects the surface, which also provides an instant production rollback with no redeploy.

---

## Background & Motivation

**Current state**
- All AI features route through one helper, `_generate()` in `backend/ai_provider.py`, which calls `_get_client().aio.models.generate_content(model="gemini-2.5-flash", ...)`.
- `_get_client()` builds the client as `genai.Client(api_key=get_settings().gemini_api_key)` — the **AI Studio** surface. The `gemini-api-key` Secret Manager secret is mounted as `GEMINI_API_KEY`, read via `backend/config.py`, and is in `_REQUIRED_FOR_PRODUCTION`.
- AI Studio bills the owner **directly**, outside the GCP project. Cloud Run, by contrast, bills the project.
- `google-genai==2.5.0` is already a dependency and supports both surfaces; `gemini-2.5-flash` is a valid model name on both.

**Why migrate**
1. **Credits.** The $300 GCP promotional credits sit on the `readlabs-prod` billing account and cover Vertex AI but **not** AI Studio. Without this migration the credits cannot touch the project's largest ongoing cost (AI generation).
2. **Cost control.** Today Gemini spend has no kill-switch, no budget, no alerting — a retry-loop bug or usage burst could quietly run up a personal bill. Moving it into the project puts it under the same controls as Cloud Run.
3. **Operational simplicity.** One billing account, one monitoring surface; the `gemini-api-key` secret can eventually be retired.

**Risk posture (decided during brainstorming)**
- Worst-case downside is **bounded, finite, and data-free**: the kill-switch caps real-money spend at ~$25, the instant `AI_PROVIDER=studio` flip stops new Vertex spend within seconds, and no database/storage/frontend changes are involved.
- Reversibility is required at every layer; see the Rollback section.

---

## Goals & Non-Goals

**Goals**
- Production Gemini calls bill the `readlabs-prod` project via Vertex AI, authenticated by the runtime SA (ADC, no API key).
- Local development workflow is unchanged (still uses `GEMINI_API_KEY` in `.env`).
- All existing tests pass without modification.
- The $7 kill-switch is recalibrated so that (a) moving AI into the project does not trip it during normal operation, and (b) today's credit-covered batch work cannot trip it.
- A one-command, no-redeploy rollback to the AI Studio path exists.

**Non-Goals (out of scope — separate spec)**
- Landmark-paper library seeding / batch guide generation.
- pgvector embeddings and semantic-search / RAG features.
- Deleting the `gemini-api-key` Secret Manager entry (kept for rollback; cleanup deferred until Vertex is proven stable).
- Any change to prompts, models, router call sites, the frontend, or the database.

---

## Design Decisions

1. **Dual-mode, env-selected** (not full Vertex-only). Production uses Vertex; local dev uses the API key. An explicit `AI_PROVIDER` env var (`studio` | `vertex`) selects the surface rather than keying off `ENVIRONMENT`, because it is independently testable and enables the instant rollback.
2. **Keep the AI Studio key mounted in production.** `GEMINI_API_KEY` stays in `--update-secrets` exactly as today. Vertex mode ignores it; it exists so `AI_PROVIDER=studio` can revert instantly and completely. The Secret Manager entry is **not** deleted in this change.
3. **Kill-switch recalibration: $7 → $25, count promotional credits.** `creditTypesTreatment = INCLUDE_ALL_CREDITS` so the `costAmount` the kill-switch reads is net-of-credits; today's $300 batch reports ~$0 net and cannot trip the cap.

---

## Detailed Design

### 1. `backend/config.py`

Add provider settings:

```python
# AI provider surface: "studio" (API key, local/dev) | "vertex" (project billing, prod)
ai_provider: str = "studio"
gcp_project_id: str = ""        # required when ai_provider == "vertex"
gcp_region: str = "us-central1"  # Vertex Gemini available here; matches GCP_REGION
```

Make the production-required check **provider-aware** (replaces the hardcoded `_REQUIRED_FOR_PRODUCTION` tuple):

```python
def _required_for_production(s: Settings) -> list[str]:
    base = ["supabase_url", "supabase_anon_key", "supabase_service_role_key"]
    if s.ai_provider == "vertex":
        return base + ["gcp_project_id"]   # key not needed; ADC authenticates
    return base + ["gemini_api_key"]        # studio path still needs the key
```

`get_settings()` calls `_required_for_production(Settings())` instead of the tuple. Effect: prod (`AI_PROVIDER=vertex`) no longer requires `GEMINI_API_KEY`, and a missing `GCP_PROJECT_ID` fails fast at startup rather than on the first AI call.

### 2. `backend/ai_provider.py` — the only behavioral change

`_get_client()` becomes provider-aware; `_generate()`, `_MODEL_NAME`, all seven public functions, and every router call site are **unchanged**:

```python
def _get_client() -> genai.Client:
    global _client
    if _client is None:
        s = get_settings()
        if s.ai_provider == "vertex":
            # Authenticates via the Cloud Run runtime SA (ADC). No API key.
            _client = genai.Client(
                vertexai=True,
                project=s.gcp_project_id,
                location=s.gcp_region,
            )
        else:
            _client = genai.Client(api_key=s.gemini_api_key)
    return _client
```

`_MODEL_NAME = "gemini-2.5-flash"` is valid on both surfaces, so no prompt or model edits.

### 3. `.github/workflows/backend-deploy.yml`

Add to the Cloud Run `--set-env-vars`:
```
AI_PROVIDER=vertex, GCP_PROJECT_ID=${{ vars.GCP_PROJECT_ID }}, GCP_REGION=${{ vars.GCP_REGION }}
```
`GEMINI_API_KEY` **stays** in `--update-secrets` (kept for rollback). `GCP_PROJECT_ID` / `GCP_REGION` are already GitHub variables used elsewhere in the workflow, so no new secrets are introduced.

### 4. Infra runbook (one-time, performed BEFORE the code deploy)

```bash
# 0. Confirm the runtime SA name (don't assume):
gcloud run services describe readlabs-api --region us-central1 \
  --format='value(spec.template.spec.serviceAccountName)'
#   expected: readlabs-runtime@readlabs-prod.iam.gserviceaccount.com

# 1. Enable Vertex AI API (no cost to enable; billed only on use):
gcloud services enable aiplatform.googleapis.com --project=readlabs-prod

# 2. Grant the runtime SA Vertex access:
gcloud projects add-iam-policy-binding readlabs-prod \
  --member="serviceAccount:readlabs-runtime@readlabs-prod.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

**Kill-switch recalibration** (edit the existing **$7 kill-switch budget**, not the $5 alert-only budget):
- Amount: **$7 → $25**
- Credit treatment: **INCLUDE_ALL_CREDITS** (Console: Budget → *Credits* → "Include all credits"; or the `billingBudgets` REST API `creditTypesTreatment` field).

This change increases headroom (a trip becomes *less* likely short-term) while keeping a hard real-money ceiling.

---

## Testing

- **Existing tests unchanged.** `backend/tests/test_ai_provider.py` patches `backend.ai_provider._generate` and never constructs a real client; with `_generate()`'s signature preserved, all current tests pass as-is.
- **New unit test** for `_get_client()` surface selection: patch `genai.Client` and `get_settings`, assert it is called with `vertexai=True, project=…, location=…` when `ai_provider == "vertex"`, and with `api_key=…` otherwise. (No network; the real client is never built.)
- **Smoke test after deploy** (manual): exercise three paths end-to-end against live Vertex — reading-guide generation, jargon explanation, quiz generation — confirming 200s and sane output.

---

## Rollout Sequence

1. **Infra first** (runbook steps 0–2 + kill-switch recalibration). Vertex must be callable the moment prod flips.
2. **Push to `backend/`** on the feature branch → review → merge to `main` → auto-deploys to Cloud Run with `AI_PROVIDER=vertex`.
3. **Smoke test** the three AI paths.
4. (Later, separate spec) run the credit-funded batch work.

---

## Rollback / Safety

| Layer | How to revert |
|---|---|
| Production AI surface | `gcloud run services update readlabs-api --region us-central1 --update-env-vars AI_PROVIDER=studio` — instant, no redeploy (key is still mounted) |
| Code | `git revert <merge-sha>` on `main`, or simply keep the branch unmerged |
| Vertex API / IAM | `gcloud services disable aiplatform.googleapis.com`; `remove-iam-policy-binding` — both harmless to leave |
| Kill-switch budget | Edit back to $7 / original credit treatment |
| Data | Not involved — no DB, Storage, or frontend changes |

Ultimate worst case: a few dollars of real spend (bounded by the $25 kill-switch), then flip one env var to be byte-for-byte back to today's behavior.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Vertex call fails in prod (API/IAM misconfig) | Infra runbook runs **before** deploy; fail-fast `GCP_PROJECT_ID` check; instant `AI_PROVIDER=studio` rollback |
| Batch work trips the kill-switch and takes the API offline | `INCLUDE_ALL_CREDITS` ⇒ credit-covered batch reports ~$0 net; cap raised to $25 gives headroom |
| Cost runaway after credits expire | $25 kill-switch (hard cap) + existing Cloud Monitoring error alerts; Flash is cheap |
| Accidental secret deletion breaks rollback | Secret is explicitly **kept** in this change; deletion deferred to a later, separate cleanup |

---

## Open Questions

None blocking. The $25 cap value and the "keep the key" decision were confirmed during brainstorming.
