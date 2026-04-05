import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from backend.services.core_api import title_similarity, search_core, fetch_core_full_text, SEARCH_MINIMUM_SIMILARITY


def test_title_similarity_identical():
    assert title_similarity("Attention Is All You Need", "Attention Is All You Need") == 1.0


def test_title_similarity_partial():
    sim = title_similarity("Attention Is All You Need", "Attention mechanism in neural networks")
    assert 0.0 < sim < 1.0


def test_title_similarity_no_overlap():
    assert title_similarity("Quantum Computing Basics", "Photosynthesis in Plants") == 0.0


def test_title_similarity_empty():
    assert title_similarity("", "Something") == 0.0
    assert title_similarity("Something", "") == 0.0


def test_title_similarity_case_insensitive():
    assert title_similarity("machine learning", "Machine Learning") == 1.0


@pytest.mark.asyncio
async def test_search_filters_by_relevance():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "results": [
            {"id": "core-1", "title": "Transformer Attention Mechanism", "authors": [{"name": "A. Vaswani"}], "yearPublished": 2017, "downloadUrl": "https://example.com/1.pdf"},
            {"id": "core-2", "title": "Cooking Recipes for Beginners", "authors": [{"name": "B. Chef"}], "yearPublished": 2020, "downloadUrl": None},
            {"id": "core-3", "title": "Attention in Deep Learning Models", "authors": [{"name": "C. Researcher"}], "yearPublished": 2019, "downloadUrl": "https://example.com/3.pdf"},
        ]
    }

    mock_ctx = AsyncMock()
    mock_ctx.get = AsyncMock(return_value=mock_response)
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("backend.services.core_api.httpx.AsyncClient", return_value=mock_ctx):
        results = await search_core("transformer attention mechanism")

    titles = [r["title"] for r in results]
    assert "Cooking Recipes for Beginners" not in titles
    assert len(results) <= 2


@pytest.mark.asyncio
async def test_fetch_core_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "title": "Transformer Attention Mechanism",
        "authors": [{"name": "A. Vaswani"}, {"name": "B. Shazeer"}],
        "yearPublished": 2017,
        "fullText": "Full paper text...",
    }

    mock_ctx = AsyncMock()
    mock_ctx.get = AsyncMock(return_value=mock_response)
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("backend.services.core_api.httpx.AsyncClient", return_value=mock_ctx):
        result = await fetch_core_full_text("core-1", "Transformer Attention Mechanism")

    assert result is not None
    assert result["title"] == "Transformer Attention Mechanism"
    assert result["authors"] == "A. Vaswani, B. Shazeer"
    assert result["year_published"] == 2017
    assert result["full_text"] == "Full paper text..."


@pytest.mark.asyncio
async def test_fetch_core_rejects_title_mismatch():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "title": "Totally Different Paper",
        "authors": [{"name": "Unknown"}],
        "yearPublished": 2020,
        "fullText": "...",
    }

    mock_ctx = AsyncMock()
    mock_ctx.get = AsyncMock(return_value=mock_response)
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("backend.services.core_api.httpx.AsyncClient", return_value=mock_ctx):
        result = await fetch_core_full_text("core-1", "Expected Title")

    assert result is None
