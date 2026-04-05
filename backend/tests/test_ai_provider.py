import pytest
from unittest.mock import MagicMock, patch
from backend.ai_provider import generate_reading_guide, generate_class_insights


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


from backend.ai_provider import generate_checkpoint_feedback, generate_sowhat_feedback, generate_jargon_explanation


@pytest.mark.asyncio
async def test_generate_checkpoint_feedback_returns_string():
    mock_response = MagicMock()
    mock_response.text = "You correctly identified the sample size. However, you missed that the study used a double-blind design."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_checkpoint_feedback(
            section_title="Methods",
            guiding_questions=["Look for: how many participants?", "Consider: what controls were used?"],
            student_text="They studied some people and measured outcomes.",
        )

    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_generate_sowhat_feedback_returns_string():
    mock_response = MagicMock()
    mock_response.text = "You noted this advances treatment options. However, the paper shows 30% reduction, not a cure."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_sowhat_feedback(
            paper_title="RCT Study of Drug X",
            section_titles=["Abstract", "Methods", "Results"],
            difficulty="intermediate",
            student_text="This study proves the drug cures the disease.",
        )

    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_generate_jargon_explanation_returns_string():
    mock_response = MagicMock()
    mock_response.text = "RCT stands for Randomized Controlled Trial — participants are randomly assigned to groups."

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_jargon_explanation(
            term="RCT",
            context_snippet="This randomized controlled trial enrolled 42 patients...",
        )

    assert isinstance(result, str)
    assert len(result) > 10


from backend.ai_provider import generate_class_insights


@pytest.mark.asyncio
async def test_generate_class_insights_returns_structured_result():
    mock_response = MagicMock()
    mock_response.text = """{
        "common_misconception": "Most students confused correlation with causation",
        "commonly_grasped": "Most students correctly identified the sample size",
        "student_count": 3
    }"""

    with patch("backend.ai_provider._model") as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_class_insights(
            section_title="Results",
            responses=["The drug cured patients", "It reduced symptoms", "Patients got better"],
        )

    assert "common_misconception" in result
    assert "commonly_grasped" in result
    assert "student_count" in result
    assert result["student_count"] == 3
