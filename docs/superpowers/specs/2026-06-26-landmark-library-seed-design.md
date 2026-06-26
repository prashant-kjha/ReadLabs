# Landmark-Paper Library Seed — Design Spec

**Date:** 2026-06-26
**Status:** Draft (awaiting user review)

---

## Overview

A one-time batch job that builds a durable **landmark-paper library**: for a curated list of famous open-access papers, generate high-quality reading guides (Gemini 2.5 **Pro**) in **three difficulty variants** plus a quiz per variant, and store them as standalone self-study assignments so students have instant content without a teacher uploading anything. This converts expiring GCP promotional credits into permanent product value.

This spec covers **only the generation** ("generate now"). The student-facing browse/exposure and the embeddings/semantic-search feature are explicitly deferred to a follow-up ("expose later") spec.

---

## Background & Motivation

- Vertex AI is live (`AI_PROVIDER=vertex`); Gemini spend now bills `readlabs-prod` and is covered by the $300 new-developer credits, which **expire tonight (2026-06-26)**.
- A "library paper" already exists as a concept: an `assignments` row with `class_id=NULL`, `status=published`, owned by its uploader (`backend/routers/library.py`). Seeding is therefore **data insertion**, not schema work.
- CORE (`backend/services/core_api.py`) returns open-access **full text** directly via `fetch_core_full_text(core_id, title)` — licensing-clean, no PDF wrangling.
- **Binding constraint:** CORE's free tier caps at ~1,000 fetches/day, so sourcing — not budget — is today's ceiling. At max richness (~$0.19/paper), ~1,000 papers ≈ ~$190 theoretical, realistically a few hundred today ≈ ~$50–100. The win is a high-quality seeded library, not exhausting $300.

---

## Goals & Non-Goals

**Goals**
- Generate, for each landmark paper: **3 Pro reading guides** (beginner/intermediate/advanced) + **1 Pro quiz per difficulty**, stored as publishable self-study assignments.
- Reuse the existing `generate_reading_guide` / `generate_quiz_questions` (extended minimally and backward-compatibly to accept a model + difficulty).
- Source papers from CORE (open-access full text).
- Be **idempotent** and **resumable** so the run survives restarts and never double-inserts.
- Spend credits on Pro generation today.

**Non-Goals (deferred to the "expose later" spec)**
- Student-facing landmark-library browse (backend query + frontend section).
- Embeddings + semantic search (pgvector table, chunking, similarity endpoint).
- Multi-user curation / admin UI for the list.
- Surfacing the `field` taxonomy in the UI (the source list preserves it for later).

---

## Design Decisions

1. **Multi-difficulty = 3 assignments per paper** (beginner/intermediate/advanced), each `class_id=NULL`. Fits the existing schema and reader unchanged; the exposure feature later groups the 3 levels under one paper.
2. **Pro via a backward-compatible `ai_provider` extension**: add optional `model` (default Flash) and `difficulty` (default auto-detect) params. Prod traffic is untouched; only the batch opts into Pro + targeted difficulty.
3. **Defer embeddings** to the search phase — they consume ~$0.002/paper (negligible credit value) and need a pgvector table; not worth the complexity in the generate-now script.
4. **Run locally, resumable**: `AI_PROVIDER=vertex` via the operator's gcloud ADC + service-role key in `.env`. Fastest path to spending credits; idempotent inserts make restarts safe. (Upgrade path: Cloud Run job.)
5. **Service-user ownership**: all seeded papers/assignments are owned by a dedicated landmark service auth user; the exposure feature later filters on it.

---

## Detailed Design

### 1. Paper list (input) — `backend/data/landmark_papers.json`

Compiled by parallel subagents (one per field). Format:

```json
[
  {"core_id": "12345", "title": "Attention Is All You Need", "field": "cs"},
  {"core_id": "67890", "title": "CRISPR ...", "field": "biology"}
]
```

Target ~200–1000 entries across fields (cs, biology, physics, medicine, economics, …). Each entry must be a real CORE `core_id` with open-access full text.

### 2. `backend/ai_provider.py` extension (backward-compatible)

- `_generate(prompt, *, temperature, json_mode=False, model=_MODEL_NAME)` — add `model` param (default unchanged); pass it to `generate_content(model=model, …)`.
- `generate_reading_guide(extracted_text, figure_count, *, model=_MODEL_NAME, difficulty=None)` — add `model`; add optional `difficulty`. When `difficulty` is set, inject a targeting instruction into the prompt (e.g. *"Frame all guiding questions, key-term explanations, and framing for a {difficulty} reader (beginner=high school, intermediate=undergraduate, advanced=graduate)."*) and override the returned `difficulty` to the target. When `None`, current auto-detect behavior is preserved exactly.
- `generate_quiz_questions(paper_title, sections, difficulty, *, model=_MODEL_NAME)` — add `model` param.

No change to any existing caller; all existing tests remain green.

### 3. Generator — `backend/scripts/seed_landmark_library.py`

Async, bounded-concurrency, resumable. Per paper:

1. **Idempotency check:** skip if `papers.core_id` already exists (dedup key).
2. **Fetch:** `fetch_core_full_text(core_id, title)`. Skip + log if no full text.
3. **Insert paper** once: `papers(title, extracted_text, uploaded_by=LANDMARK_USER_ID, core_id)` → `paper_id`.
4. **For each `difficulty` in `[beginner, intermediate, advanced]`:**
   - `guide = generate_reading_guide(text, figure_count=0, model="gemini-2.5-pro", difficulty=difficulty)`
   - insert `assignments(paper_id, class_id=NULL, status="published", reading_guide=guide, difficulty=difficulty, …)` → `assignment_id`
   - insert `critical_prompts` rows from `guide["critical_prompts"]`
   - `quiz = generate_quiz_questions(title, guide["sections"], difficulty, model="gemini-2.5-pro")`
   - insert `quiz_questions` rows
5. **Progress:** append a line to a run log; rely on `core_id` idempotency for resume.

**Concurrency & rate-limiting:** an asyncio semaphore (≈5 concurrent papers); a separate limiter for Vertex Pro calls to stay under Pro RPM/TPM quota; a CORE fetch counter that **stops before the ~1,000/day cap**. Per-paper `try/except` so one failure doesn't abort the batch.

**Insertion method:** Supabase REST via the **service-role key** (bypasses RLS), using the existing query builder in `backend/db.py` (or a direct service-role client). Exact required columns for `papers`/`assignments`/`critical_prompts`/`quiz_questions` are taken from `supabase/migrations/20260329000000_initial_schema.sql` (verified during implementation).

### 4. Prerequisite: landmark service user

`papers.uploaded_by` is FK → `auth.users(id)`, so inserts require a real auth user. **Create a dedicated landmark service user** in Supabase Auth (via the admin API with the service-role key), record its UUID as `LANDMARK_USER_ID` (env var). All seeded rows are owned by it; the future exposure feature filters `uploaded_by = LANDMARK_USER_ID`.

---

## Testing

- **Unit:** the `ai_provider` param additions — assert `_generate` passes `model` through; assert `generate_reading_guide(difficulty="beginner")` injects the targeting line and overrides the returned difficulty; assert default behavior (no kwargs) is byte-identical to today.
- **Dry-run:** run the generator on a **2–3 paper slice** of the list against live CORE + live Vertex Pro + the real Supabase DB; verify paper + 3 assignments + critical_prompts + quiz_questions insert correctly and a second run skips them (idempotency).
- **Then** the full run.

---

## Safety & Rate Limits

| Concern | Handling |
|---|---|
| CORE ~1,000/day cap | fetch counter; stop before cap; resumable next day if ever needed |
| Vertex Pro RPM/TPM | dedicated throttle in the generator; bounded concurrency |
| Partial failure | per-paper `try/except`; bad paper logged + skipped, batch continues |
| Double-insert on restart | idempotent on `papers.core_id` |
| Cost runaway | credits are counted in the $25 kill-switch (`INCLUDE_ALL_CREDITS`), so a credit-covered batch reports ~$0 net and cannot trip the cap |

---

## Credit Spend (honest estimate)

~$0.19/paper (3 Pro guides @ ~$0.05 + 3 quizzes @ ~$0.014). At the ~1,000-paper CORE daily cap ≈ ~$190 theoretical; realistically a few hundred papers today ≈ **~$50–100**. Sourcing-bound, as established — the durable library is the win, not credit exhaustion.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CORE full text missing for some IDs | skip + log; curate list toward papers known to have full text |
| Pro quota limits slow/abort the run | throttle + resume; idempotent so re-runs are cheap |
| `uploaded_by` FK reject | create the landmark service user first (prerequisite) |
| Schema column mismatch | verify exact required columns from migrations before the full run (dry-run catches it) |
| Local run interrupted | resumable + idempotent; restart continues |

---

## Out of Scope (separate "expose later" spec)

- Landmark-library browse endpoint + frontend section (filter `uploaded_by = LANDMARK_USER_ID`).
- Embeddings + pgvector + semantic search.
- Grouping the 3 difficulty assignments under one paper in the UI.
