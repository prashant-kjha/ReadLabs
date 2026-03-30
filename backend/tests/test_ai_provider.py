import pytest
from unittest.mock import MagicMock, patch
from backend.ai_provider import generate_reading_guide


@pytest.mark.asyncio
async def test_generate_reading_guide_returns_sections():
    mock_response = MagicMock()
    mock_response.text = """{
        "sections": [
            {
                "title": "Abstract",
                "text": "This study examines...",
                "guiding_questions": ["Look for: the main goal of the study"],
                "key_terms": ["RCT"],
                "teacher_notes": ""
            }
        ],
        "difficulty": "intermediate"
    }"""

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_reading_guide("Some paper text", figure_count=2)

    assert "sections" in result
    assert len(result["sections"]) >= 1
    assert "title" in result["sections"][0]
    assert "guiding_questions" in result["sections"][0]
    assert "key_terms" in result["sections"][0]
    assert "teacher_notes" in result["sections"][0]
    assert result["difficulty"] in ("beginner", "intermediate", "advanced")


@pytest.mark.asyncio
async def test_generate_reading_guide_handles_malformed_json():
    mock_response = MagicMock()
    mock_response.text = "not valid json {"

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        with pytest.raises(Exception):
            await generate_reading_guide("Some paper text", figure_count=0)
