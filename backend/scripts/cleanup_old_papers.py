"""Delete papers and their PDFs once they have been inactive for N days.

A paper is considered inactive when:
  - No assignment references it, AND it was uploaded more than --days days ago, OR
  - Every assignment that references it was created more than --days days ago.

Deletion order: PDF in Supabase Storage first, then the `papers` row. Downstream
rows (assignments, sessions, etc.) cascade via ON DELETE CASCADE.

Usage:
  python -m backend.scripts.cleanup_old_papers --dry-run            # preview, 90d default
  python -m backend.scripts.cleanup_old_papers --days 30            # actually delete
  python -m backend.scripts.cleanup_old_papers --days 365 --verbose

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (the same
vars the backend uses). Intended to be wired to Cloud Scheduler / GitHub Actions
/ any cron — runs once and exits.
"""
from __future__ import annotations
import argparse
import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone

import httpx

from backend.config import get_settings
from backend.db import get_db, storage_headers

logger = logging.getLogger("cleanup_old_papers")


async def _delete_storage_object(object_path: str) -> bool:
    """Delete a single object from the `papers` bucket. Returns True on success."""
    url = f"{get_settings().supabase_url}/storage/v1/object/papers/{object_path}"
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.delete(url, headers=storage_headers())
    if r.status_code in (200, 204):
        return True
    if r.status_code == 404:
        logger.info("storage object already gone: %s", object_path)
        return True
    logger.warning("storage delete failed (%s) for %s: %s", r.status_code, object_path, r.text[:200])
    return False


async def find_stale_papers(cutoff: datetime) -> list[dict]:
    """Return papers whose assignment activity (if any) is all older than cutoff."""
    db = get_db()
    # Embed assignments(created_at) so we can decide per-paper without N+1 queries.
    result = await db.from_("papers") \
        .select("id,title,pdf_path,created_at,assignments(created_at)") \
        .execute()
    if result.error:
        raise RuntimeError(f"Failed to list papers: {result.error}")

    cutoff_iso = cutoff.isoformat()
    stale: list[dict] = []
    for p in (result.data or []):
        assignments = p.get("assignments") or []
        if not assignments:
            # Orphan paper: stale if it's old enough.
            if p["created_at"] < cutoff_iso:
                stale.append(p)
            continue
        latest = max(a["created_at"] for a in assignments)
        if latest < cutoff_iso:
            stale.append(p)
    return stale


async def cleanup(days: int, dry_run: bool, verbose: bool) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    logger.info("scanning for papers inactive since %s (--days %d)", cutoff.isoformat(), days)

    stale = await find_stale_papers(cutoff)
    if not stale:
        logger.info("no stale papers found — nothing to do")
        return 0

    logger.info("found %d stale paper(s)", len(stale))
    if verbose or dry_run:
        for p in stale:
            n = len(p.get("assignments") or [])
            logger.info("  - %s  '%s'  uploaded=%s  assignments=%d",
                        p["id"], (p["title"] or "")[:60], p["created_at"], n)

    if dry_run:
        logger.info("dry-run: no changes made")
        return 0

    deleted_storage = 0
    deleted_rows = 0
    db = get_db()
    for p in stale:
        pdf_path = p.get("pdf_path")
        if pdf_path:
            # Stored as "papers/<user>/<uuid>.pdf"; storage API wants the path without the bucket prefix.
            object_path = pdf_path.removeprefix("papers/")
            if await _delete_storage_object(object_path):
                deleted_storage += 1

        row = await db.from_("papers").delete().eq("id", p["id"]).execute()
        if row.error:
            logger.warning("row delete failed for %s: %s", p["id"], row.error)
        else:
            deleted_rows += 1

    logger.info("done: %d storage object(s), %d paper row(s) deleted", deleted_storage, deleted_rows)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete inactive papers and their PDFs.")
    parser.add_argument("--days", type=int, default=90,
                        help="Inactivity threshold in days (default: 90).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be deleted, change nothing.")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Print each candidate paper.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    try:
        return asyncio.run(cleanup(args.days, args.dry_run, args.verbose))
    except KeyboardInterrupt:
        logger.warning("interrupted")
        return 130


if __name__ == "__main__":
    sys.exit(main())
