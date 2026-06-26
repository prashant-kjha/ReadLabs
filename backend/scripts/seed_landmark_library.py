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
