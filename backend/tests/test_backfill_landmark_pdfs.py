"""Tests for the landmark-library PDF backfill script.

The landmark papers were seeded as extracted text only, so every one of them has
pdf_path NULL and the reading page has no document to show. These cover the
logic that decides which arXiv PDF belongs to which paper row, and the guards
that keep a wrong or non-PDF download from being written to storage.
"""
import io
from unittest.mock import AsyncMock, MagicMock, patch

import fitz  # PyMuPDF
import pytest

from backend.scripts.backfill_landmark_pdfs import (
    PdfTooLarge,
    _backfill_one,
    _download_pdf,
    _resolve_arxiv_id,
    _title_matches,
)

TITLE_INDEX = {"attention is all you need": "1706.03762"}


def make_pdf(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


# ── arXiv id resolution ─────────────────────────────────────────────────────

def test_resolves_arxiv_id_from_core_id():
    paper = {"id": "p1", "title": "Attention Is All You Need", "core_id": "arxiv:1706.03762"}
    assert _resolve_arxiv_id(paper, {}) == "1706.03762"


def test_falls_back_to_title_lookup_when_core_id_is_not_arxiv():
    """CORE-sourced rows have a numeric core_id, so match on title instead."""
    paper = {"id": "p1", "title": "  Attention Is All You Need ", "core_id": "12345678"}
    assert _resolve_arxiv_id(paper, TITLE_INDEX) == "1706.03762"


def test_returns_none_when_paper_cannot_be_resolved():
    paper = {"id": "p1", "title": "Some Paper Not In The List", "core_id": None}
    assert _resolve_arxiv_id(paper, TITLE_INDEX) is None


# ── title verification ──────────────────────────────────────────────────────

def test_title_matches_accepts_the_right_paper():
    assert _title_matches("Attention Is All You Need",
                          "Attention Is All You Need\nAshish Vaswani et al.")


def test_title_matches_rejects_a_different_paper():
    assert not _title_matches("Attention Is All You Need",
                              "Deep Residual Learning for Image Recognition\nKaiming He")


# ── download guards ─────────────────────────────────────────────────────────

def _client_returning(status: int, content: bytes) -> MagicMock:
    resp = MagicMock(status_code=status, content=content)
    client = MagicMock()
    client.get = AsyncMock(return_value=resp)
    return client


@pytest.mark.asyncio
async def test_download_rejects_a_response_that_is_not_a_pdf():
    """arXiv serves an HTML error page for a bad id — never store that as a PDF."""
    client = _client_returning(200, b"<!DOCTYPE html><html>Not found</html>")
    assert await _download_pdf(client, "0000.00000", max_bytes=25_000_000) is None


@pytest.mark.asyncio
async def test_download_raises_for_a_pdf_over_the_size_cap():
    """Distinct from a failure: the caller counts this as a skip, not a retry."""
    client = _client_returning(200, b"%PDF-1.7" + b"0" * 5000)
    with pytest.raises(PdfTooLarge):
        await _download_pdf(client, "1706.03762", max_bytes=1000)


@pytest.mark.asyncio
async def test_backfill_counts_an_oversize_pdf_as_skipped():
    paper = {"id": "paper-1", "title": "Attention Is All You Need", "core_id": "arxiv:1706.03762"}
    client = _client_returning(200, b"%PDF-1.7" + b"0" * 5000)

    upload = AsyncMock(return_value=True)
    mock_db = MagicMock()
    with patch("backend.scripts.backfill_landmark_pdfs._upload_pdf", upload), \
         patch("backend.scripts.backfill_landmark_pdfs.get_db", return_value=mock_db):
        outcome = await _backfill_one(paper, "1706.03762", client, 1000, delay=0)

    assert outcome == "skipped"
    upload.assert_not_awaited()


@pytest.mark.asyncio
async def test_download_returns_pdf_bytes_on_success():
    pdf = make_pdf("Attention Is All You Need")
    client = _client_returning(200, pdf)
    assert await _download_pdf(client, "1706.03762", max_bytes=25_000_000) == pdf


# ── end-to-end backfill of a single paper ───────────────────────────────────

@pytest.mark.asyncio
async def test_backfill_uploads_and_sets_pdf_path():
    paper = {"id": "paper-1", "title": "Attention Is All You Need", "core_id": "arxiv:1706.03762"}
    client = _client_returning(200, make_pdf("Attention Is All You Need\nAshish Vaswani"))

    mock_db = MagicMock()
    for attr in ["from_", "update", "eq"]:
        setattr(mock_db, attr, MagicMock(return_value=mock_db))
    mock_db.execute = AsyncMock(return_value=MagicMock(error=None))

    upload = AsyncMock(return_value=True)
    with patch("backend.scripts.backfill_landmark_pdfs._upload_pdf", upload), \
         patch("backend.scripts.backfill_landmark_pdfs.get_db", return_value=mock_db):
        outcome = await _backfill_one(paper, "1706.03762", client, 25_000_000, delay=0)

    assert outcome == "done"
    # Stored under a landmark-scoped object path, keyed by paper id.
    assert upload.await_args.args[1] == "landmark/paper-1.pdf"
    # pdf_path keeps the bucket prefix the pdf-url route strips back off.
    mock_db.update.assert_called_once_with({"pdf_path": "papers/landmark/paper-1.pdf"})


@pytest.mark.asyncio
async def test_backfill_skips_when_the_pdf_is_a_different_paper():
    """A wrong arXiv id must not silently attach the wrong paper to a guide."""
    paper = {"id": "paper-1", "title": "Attention Is All You Need", "core_id": "arxiv:9999.99999"}
    client = _client_returning(200, make_pdf("Deep Residual Learning for Image Recognition"))

    upload = AsyncMock(return_value=True)
    mock_db = MagicMock()
    with patch("backend.scripts.backfill_landmark_pdfs._upload_pdf", upload), \
         patch("backend.scripts.backfill_landmark_pdfs.get_db", return_value=mock_db):
        outcome = await _backfill_one(paper, "9999.99999", client, 25_000_000, delay=0)

    assert outcome == "skipped"
    upload.assert_not_awaited()
    mock_db.from_.assert_not_called()


@pytest.mark.asyncio
async def test_backfill_reports_failure_without_touching_pdf_path():
    """A failed upload must leave pdf_path NULL so a re-run retries the paper."""
    paper = {"id": "paper-1", "title": "Attention Is All You Need", "core_id": "arxiv:1706.03762"}
    client = _client_returning(200, make_pdf("Attention Is All You Need\nAshish Vaswani"))

    mock_db = MagicMock()
    with patch("backend.scripts.backfill_landmark_pdfs._upload_pdf", AsyncMock(return_value=False)), \
         patch("backend.scripts.backfill_landmark_pdfs.get_db", return_value=mock_db):
        outcome = await _backfill_one(paper, "1706.03762", client, 25_000_000, delay=0)

    assert outcome == "failed"
    mock_db.from_.assert_not_called()
