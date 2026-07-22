"""Backfill the landmark library's missing PDFs.

The seeding run (seed_landmark_library.py) stored only each paper's extracted
text, so `papers.pdf_path` is NULL for every landmark paper and the reading
page has nothing to display. This script downloads the original PDF from arXiv,
uploads it to the `papers` Storage bucket, and fills in `pdf_path`.

For each landmark paper with no PDF:
  resolve arXiv id (from `core_id` = "arxiv:<id>", else by title from
  data/landmark_papers.json) -> download the PDF -> verify it is a PDF and that
  its first page actually matches the expected title -> upload to
  papers/landmark/<paper_id>.pdf -> set papers.pdf_path.

Idempotent and resumable: only rows with pdf_path IS NULL are touched, so an
interrupted run can simply be re-run. Nothing is deleted or overwritten in the
database beyond that one column.

Be polite to arXiv: low concurrency plus a per-download delay by default.

Usage:
  python -m backend.scripts.backfill_landmark_pdfs --dry-run
  python -m backend.scripts.backfill_landmark_pdfs --limit 5      # try a few first
  python -m backend.scripts.backfill_landmark_pdfs                # full run

Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and LANDMARK_USER_ID.
"""
from __future__ import annotations
import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

import httpx

from backend.config import get_settings
from backend.db import get_db, storage_headers, aclose_shared_client

logger = logging.getLogger("backfill_landmark_pdfs")

LIST_PATH = Path(__file__).resolve().parent.parent / "data" / "landmark_papers.json"
ARXIV_PDF_URL = "https://arxiv.org/pdf/{arxiv_id}"
USER_AGENT = "ReadLabs-backfill/1.0 (educational reading guides; contact via readlabs)"

# Same stopword/token heuristic the seeding script uses to catch a wrong arXiv
# id. Kept local rather than imported so this script doesn't pull in the whole
# AI-generation stack just to compare two strings.
_STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "are", "via", "its",
    "our", "their", "using", "towards", "toward", "into", "over", "than", "all",
    "new", "you", "but", "not", "can", "has", "have", "based", "such", "without",
}


class PdfTooLarge(Exception):
    """The PDF exceeds the size cap — a deliberate skip, not a download failure."""


def _title_matches(expected_title: str, text: str, *, min_fraction: float = 0.5) -> bool:
    """True when enough of the expected title's significant tokens appear in the
    PDF's opening text — i.e. we downloaded the paper we think we did."""
    head = text[:4000].lower()
    toks = {w for w in re.findall(r"[a-z0-9]+", expected_title.lower())
            if len(w) > 2 and w not in _STOPWORDS}
    if not toks:
        return True
    present = sum(1 for t in toks if t in head)
    return present / len(toks) >= min_fraction


def _first_page_text(pdf_bytes: bytes) -> str:
    """Text of page 1 only. Cheaper than full extraction — this is just a guard."""
    import fitz  # imported lazily so --help works without PyMuPDF loaded

    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        if doc.page_count == 0:
            return ""
        return doc[0].get_text()


def _load_title_index() -> dict[str, str]:
    """title (lowercased) -> arxiv_id, for papers whose core_id isn't an arXiv id."""
    if not LIST_PATH.exists():
        logger.warning("paper list missing at %s — title fallback disabled", LIST_PATH)
        return {}
    entries = json.loads(LIST_PATH.read_text(encoding="utf-8"))
    return {
        e["title"].strip().lower(): e["arxiv_id"]
        for e in entries
        if e.get("title") and e.get("arxiv_id")
    }


def _resolve_arxiv_id(paper: dict, title_index: dict[str, str]) -> str | None:
    core_id = paper.get("core_id") or ""
    if core_id.startswith("arxiv:"):
        return core_id.removeprefix("arxiv:")
    return title_index.get((paper.get("title") or "").strip().lower())


async def _download_pdf(client: httpx.AsyncClient, arxiv_id: str, max_bytes: int) -> bytes | None:
    url = ARXIV_PDF_URL.format(arxiv_id=arxiv_id)
    for attempt in (1, 2):
        try:
            r = await client.get(url, headers={"User-Agent": USER_AGENT})
        except Exception as e:
            logger.warning("download error for %s (attempt %d): %s", arxiv_id, attempt, e)
            if attempt == 1:
                await asyncio.sleep(5)
                continue
            return None
        if r.status_code == 200:
            content = r.content
            if not content.startswith(b"%PDF-"):
                logger.warning("%s: response is not a PDF (starts with %r)", arxiv_id, content[:8])
                return None
            if len(content) > max_bytes:
                raise PdfTooLarge(
                    f"{arxiv_id}: PDF is {len(content) / 1e6:.1f} MB, "
                    f"over the {max_bytes / 1e6:.1f} MB cap")
            return content
        # arXiv rate-limits with 403/429; back off once before giving up.
        if r.status_code in (403, 429) and attempt == 1:
            logger.info("%s: throttled (%s), backing off", arxiv_id, r.status_code)
            await asyncio.sleep(15)
            continue
        logger.warning("%s: download failed with status %s", arxiv_id, r.status_code)
        return None
    return None


async def _upload_pdf(client: httpx.AsyncClient, object_path: str, content: bytes) -> bool:
    """Upload to the `papers` bucket, overwriting any object left by a failed run."""
    url = f"{get_settings().supabase_url}/storage/v1/object/papers/{object_path}"
    headers = {
        **storage_headers(),
        "Content-Type": "application/pdf",
        "x-upsert": "true",
    }
    try:
        r = await client.post(url, headers=headers, content=content)
    except Exception as e:
        logger.warning("storage upload error for %s: %s", object_path, e)
        return False
    if r.status_code in (200, 201):
        return True
    logger.warning("storage upload failed (%s) for %s: %s",
                   r.status_code, object_path, r.text[:200])
    return False


async def _backfill_one(
    paper: dict,
    arxiv_id: str,
    client: httpx.AsyncClient,
    max_bytes: int,
    delay: float,
) -> str:
    """Returns one of: 'done', 'skipped', 'failed'."""
    paper_id, title = paper["id"], paper.get("title") or paper["id"]

    try:
        content = await _download_pdf(client, arxiv_id, max_bytes)
    except PdfTooLarge as e:
        logger.warning("%s — skipping (raise --max-mb to include it)", e)
        content = None
        oversize = True
    else:
        oversize = False
    # Space out arXiv requests whether or not this one succeeded.
    if delay:
        await asyncio.sleep(delay)
    if not content:
        return "skipped" if oversize else "failed"

    try:
        head = await asyncio.to_thread(_first_page_text, content)
    except Exception as e:
        logger.warning("%r: could not read downloaded PDF: %s", title, e)
        return "failed"
    if not _title_matches(title, head):
        logger.warning("%r: first page doesn't match the title (arxiv_id=%s) — wrong PDF, skipping",
                       title, arxiv_id)
        return "skipped"

    object_path = f"landmark/{paper_id}.pdf"
    if not await _upload_pdf(client, object_path, content):
        return "failed"

    # Match the pdf_path convention used elsewhere: bucket name + object path.
    db = get_db()
    result = await db.from_("papers").update(
        {"pdf_path": f"papers/{object_path}"}
    ).eq("id", paper_id).execute()
    if result.error:
        logger.warning("%r: pdf_path update failed: %s", title, result.error)
        return "failed"

    logger.info("OK %s (%.1f MB) %r", arxiv_id, len(content) / 1e6, title[:60])
    return "done"


async def backfill(args: argparse.Namespace) -> int:
    landmark_user = get_settings().landmark_user_id
    if not landmark_user:
        logger.error("LANDMARK_USER_ID is not set — nothing to back fill")
        return 1

    db = get_db()
    result = await db.from_("papers").select("id, title, core_id, pdf_path") \
        .eq("uploaded_by", landmark_user).is_("pdf_path", "null") \
        .order("created_at", desc=False).execute()
    if result.error:
        logger.error("failed to list landmark papers: %s", result.error)
        return 1

    papers = result.data or []
    if not papers:
        logger.info("every landmark paper already has a PDF — nothing to do")
        return 0

    title_index = _load_title_index()
    resolvable: list[tuple[dict, str]] = []
    unresolved: list[dict] = []
    for p in papers:
        arxiv_id = _resolve_arxiv_id(p, title_index)
        (resolvable.append((p, arxiv_id)) if arxiv_id else unresolved.append(p))

    logger.info("%d landmark paper(s) without a PDF: %d resolvable to an arXiv id, %d not",
                len(papers), len(resolvable), len(unresolved))
    for p in unresolved:
        logger.info("  no arXiv id: %s %r", p["id"], (p.get("title") or "")[:60])

    if args.limit:
        resolvable = resolvable[:args.limit]
        logger.info("--limit %d: processing the first %d", args.limit, len(resolvable))

    if args.dry_run:
        for p, arxiv_id in resolvable:
            logger.info("  would fetch arxiv:%s -> papers/landmark/%s.pdf  %r",
                        arxiv_id, p["id"], (p.get("title") or "")[:60])
        logger.info("dry-run: no downloads, uploads or DB writes")
        return 0

    max_bytes = int(args.max_mb * 1_000_000)
    counts = {"done": 0, "skipped": 0, "failed": 0}
    sem = asyncio.Semaphore(args.concurrency)

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        async def bounded(paper: dict, arxiv_id: str) -> None:
            async with sem:
                outcome = await _backfill_one(paper, arxiv_id, client, max_bytes, args.delay)
                counts[outcome] += 1

        await asyncio.gather(*[bounded(p, a) for p, a in resolvable])

    logger.info("done: %d backfilled, %d skipped, %d failed, %d without an arXiv id",
                counts["done"], counts["skipped"], counts["failed"], len(unresolved))
    # Re-runnable: failures leave pdf_path NULL, so just run it again.
    return 0 if counts["failed"] == 0 else 2


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill missing landmark-library PDFs from arXiv.")
    parser.add_argument("--dry-run", action="store_true",
                        help="List what would be fetched, change nothing.")
    parser.add_argument("--limit", type=int, default=0,
                        help="Process at most N papers (0 = all).")
    parser.add_argument("--concurrency", type=int, default=2,
                        help="Parallel downloads (default: 2 — be gentle with arXiv).")
    parser.add_argument("--delay", type=float, default=3.0,
                        help="Seconds to wait after each download (default: 3).")
    parser.add_argument("--max-mb", type=float, default=50.0,
                        help="Skip PDFs larger than this many MB (default: 50 — the "
                             "`papers` bucket sets no limit of its own).")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    async def run() -> int:
        try:
            return await backfill(args)
        finally:
            await aclose_shared_client()

    try:
        return asyncio.run(run())
    except KeyboardInterrupt:
        logger.warning("interrupted — re-run to resume")
        return 130


if __name__ == "__main__":
    sys.exit(main())
