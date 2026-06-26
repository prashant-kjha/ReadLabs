import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import backend.ai_provider as ai_provider_module
from backend.ai_provider import (
    generate_reading_guide,
    generate_class_insights,
    generate_quiz_questions,
    grade_short_answer,
    generate_checkpoint_feedback,
    generate_sowhat_feedback,
    generate_jargon_explanation,
)


def _mock_generate(text: str) -> AsyncMock:
    """Patch the single SDK-contact helper. Returns the raw response text."""
    return patch("backend.ai_provider._generate", new=AsyncMock(return_value=text))


@pytest.mark.asyncio
async def test_generate_reading_guide_returns_sections():
    raw = """{
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

    with _mock_generate(raw):
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
    with _mock_generate("not valid json {"):
        with pytest.raises(Exception):
            await generate_reading_guide("Some paper text", figure_count=0)


@pytest.mark.asyncio
async def test_generate_checkpoint_feedback_returns_string():
    raw = "You correctly identified the sample size. However, you missed that the study used a double-blind design."

    with _mock_generate(raw):
        result = await generate_checkpoint_feedback(
            section_title="Methods",
            guiding_questions=["Look for: how many participants?", "Consider: what controls were used?"],
            student_text="They studied some people and measured outcomes.",
        )

    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_generate_sowhat_feedback_returns_string():
    raw = "You noted this advances treatment options. However, the paper shows 30% reduction, not a cure."

    with _mock_generate(raw):
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
    raw = "RCT stands for Randomized Controlled Trial — participants are randomly assigned to groups."

    with _mock_generate(raw):
        result = await generate_jargon_explanation(
            term="RCT",
            context_snippet="This randomized controlled trial enrolled 42 patients...",
        )

    assert isinstance(result, str)
    assert len(result) > 10


@pytest.mark.asyncio
async def test_generate_class_insights_returns_structured_result():
    raw = """{
        "common_misconception": "Most students confused correlation with causation",
        "commonly_grasped": "Most students correctly identified the sample size",
        "student_count": 3
    }"""

    with _mock_generate(raw):
        result = await generate_class_insights(
            section_title="Results",
            responses=["The drug cured patients", "It reduced symptoms", "Patients got better"],
        )

    assert "common_misconception" in result
    assert "commonly_grasped" in result
    assert "student_count" in result
    assert result["student_count"] == 3


@pytest.mark.asyncio
async def test_generate_reading_guide_includes_critical_prompts():
    raw = json.dumps({
        "sections": [{
            "title": "Methods",
            "text": "We studied X.",
            "guiding_questions": ["Look for: study design"],
            "key_terms": ["RCT"],
            "teacher_notes": "",
            "section_type": "Methods",
        }],
        "difficulty": "intermediate",
        "critical_prompts": [{
            "section_index": 0,
            "prompt_text": "What assumptions did the authors make?",
            "prompt_type": "evaluation"
        }]
    })
    with _mock_generate(raw):
        result = await generate_reading_guide("paper text here", 2)

    assert "sections" in result
    assert "critical_prompts" in result
    section = result["sections"][0]
    assert "section_type" in section
    assert result["critical_prompts"][0]["prompt_type"] == "evaluation"


@pytest.mark.asyncio
async def test_generate_quiz_questions():
    raw = json.dumps([
        {
            "question_text": "What was the primary outcome measure?",
            "question_type": "multiple_choice",
            "options": ["A", "B", "C", "D"],
            "correct_answer": "A",
            "explanation": "The primary outcome was X."
        },
        {
            "question_text": "Describe the main limitation.",
            "question_type": "short_answer",
            "options": None,
            "correct_answer": "Small sample size",
            "explanation": "Discussed in Discussion."
        }
    ])
    with _mock_generate(raw):
        result = await generate_quiz_questions(
            paper_title="Effects of X on Y",
            sections=[{"title": "Methods", "text": "We used RCT."}, {"title": "Results", "text": "p=0.03"}],
            difficulty="intermediate"
        )
    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["question_type"] == "multiple_choice"


@pytest.mark.asyncio
async def test_grade_short_answer():
    raw = json.dumps({"score": 1, "explanation": "Partially correct."})
    with _mock_generate(raw):
        result = await grade_short_answer(
            question="What is the main limitation?",
            correct_answer="Small sample size limited generalizability",
            student_answer="The sample was small"
        )
    assert result["score"] == 1
    assert "explanation" in result


@pytest.fixture
def reset_ai_client():
    """_get_client() caches its client in a module global; reset it around each test."""
    ai_provider_module._client = None
    yield
    ai_provider_module._client = None


def test_get_client_uses_vertex_when_configured(reset_ai_client):
    settings = MagicMock()
    settings.ai_provider = "vertex"
    settings.gcp_project_id = "readlabs-prod"
    settings.gcp_region = "us-central1"
    with patch("backend.ai_provider.genai") as mock_genai, patch(
        "backend.ai_provider.get_settings", return_value=settings
    ):
        ai_provider_module._get_client()
    mock_genai.Client.assert_called_once_with(
        vertexai=True, project="readlabs-prod", location="us-central1"
    )


def test_get_client_uses_api_key_in_studio_mode(reset_ai_client):
    settings = MagicMock()
    settings.ai_provider = "studio"
    settings.gemini_api_key = "fake-key"
    with patch("backend.ai_provider.genai") as mock_genai, patch(
        "backend.ai_provider.get_settings", return_value=settings
    ):
        ai_provider_module._get_client()
    mock_genai.Client.assert_called_once_with(api_key="fake-key")
