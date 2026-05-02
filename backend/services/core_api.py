import logging
import httpx
from backend.config import get_settings

logger = logging.getLogger(__name__)

CORE_SEARCH_URL = "https://api.core.ac.uk/v3/search/works"
CORE_RECORD_URL = "https://api.core.ac.uk/v3/data-records"

SEARCH_MINIMUM_SIMILARITY = 0.3
FETCH_MINIMUM_SIMILARITY = 0.7


def title_similarity(title_a: str, title_b: str) -> float:
    """
    Compute Jaccard similarity between two titles on word tokens.
    Returns 0.0-1.0 where 1.0 is identical.
    """
    if not title_a or not title_b:
        return 0.0
    tokens_a = set(title_a.lower().split())
    tokens_b = set(title_b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


async def search_core(query: str, limit: int = 20) -> list[dict]:
    """
    Search CORE API for open-access papers matching query.
    Filters results by title relevance before returning.
    """
    headers = {"Authorization": f"Bearer {get_settings().core_api_key}"}
    params = {"q": query, "limit": limit, "offset": 0}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(CORE_SEARCH_URL, headers=headers, params=params)

    if resp.status_code != 200:
        logger.error("CORE search failed: %s %s", resp.status_code, resp.text[:300])
        return []

    raw_results = resp.json().get("results", [])

    # Filter by title relevance
    verified = []
    for r in raw_results:
        title = r.get("title", "")
        sim = title_similarity(query, title)
        if sim >= SEARCH_MINIMUM_SIMILARITY:
            verified.append({
                "core_id": r.get("id"),
                "title": title,
                "authors": ", ".join(
                    a.get("name", "") for a in r.get("authors", []) if a.get("name")
                ) or None,
                "year_published": r.get("yearPublished"),
                "download_url": r.get("downloadUrl"),
                "similarity": round(sim, 3),
            })

    verified.sort(key=lambda x: x["similarity"], reverse=True)
    return verified


async def fetch_core_full_text(core_id: str, expected_title: str) -> dict | None:
    """
    Fetch full text from CORE API by record ID.
    Verifies fetched title matches expected_title before returning.
    Returns dict with title, authors, year, full_text or None if verification fails.
    """
    headers = {"Authorization": f"Bearer {get_settings().core_api_key}"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{CORE_RECORD_URL}/{core_id}", headers=headers)

    if resp.status_code != 200:
        logger.error("CORE fetch failed for %s: %s", core_id, resp.status_code)
        return None

    data = resp.json()
    fetched_title = data.get("title", "")

    # Title verification — reject if similarity too low
    sim = title_similarity(expected_title, fetched_title)
    if sim < FETCH_MINIMUM_SIMILARITY:
        logger.warning(
            "CORE title mismatch for %s: expected='%s' got='%s' sim=%.2f",
            core_id, expected_title, fetched_title, sim,
        )
        return None

    return {
        "core_id": core_id,
        "title": fetched_title,
        "authors": ", ".join(
            a.get("name", "") for a in data.get("authors", []) if a.get("name")
        ) or None,
        "year_published": data.get("yearPublished"),
        "full_text": data.get("fullText") or data.get("abstract") or "",
    }
