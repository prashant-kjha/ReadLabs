import json
import pytest
from unittest.mock import MagicMock, patch
from backend.ai_provider import generate_reading_guide, generate_class_insights, generate_annotation_socratic_prompt, generate_quiz_questions, grade_short_answer


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


@pytest.mark.asyncio
async def test_generate_reading_guide_includes_superpowers_fields():
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "sections": [{
            "title": "Methods",
            "text": "We studied X.",
            "guiding_questions": ["Look for: study design"],
            "key_terms": ["RCT"],
            "teacher_notes": "",
            "section_type": "Methods",
            "simplifications": {
                "undergrad": "Researchers used RCT.",
                "high_school": "Scientists tested two groups.",
                "eli5": "They compared two groups to see which worked better."
            }
        }],
        "difficulty": "intermediate",
        "methodology_elements": [{
            "section_index": 0,
            "element_type": "study_design",
            "label": "RCT",
            "description": "Randomized controlled trial",
            "explanation": "Participants were randomly assigned to groups.",
            "follow_up_questions": ["Why randomize?"],
            "difficulty": "intermediate"
        }],
        "critical_prompts": [{
            "section_index": 0,
            "prompt_text": "What assumptions did the authors make?",
            "prompt_type": "evaluation"
        }]
    })
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_reading_guide("paper text here", 2)

    assert "sections" in result
    assert "methodology_elements" in result
    assert "critical_prompts" in result
    section = result["sections"][0]
    assert "section_type" in section
    assert "simplifications" in section
    assert set(section["simplifications"].keys()) == {"undergrad", "high_school", "eli5"}
    assert result["methodology_elements"][0]["element_type"] == "study_design"
    assert result["critical_prompts"][0]["prompt_type"] == "evaluation"


@pytest.mark.asyncio
async def test_generate_annotation_socratic_prompt():
    mock_response = MagicMock()
    mock_response.text = "What about this passage caught your attention?"
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_annotation_socratic_prompt(
            highlighted_text="The p-value was 0.03",
            section_title="Results"
        )
    assert isinstance(result, str)
    assert len(result) > 10


@pytest.mark.asyncio
async def test_generate_quiz_questions():
    mock_response = MagicMock()
    mock_response.text = json.dumps([
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
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
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
    mock_response = MagicMock()
    mock_response.text = json.dumps({"score": 1, "explanation": "Partially correct."})
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await grade_short_answer(
            question="What is the main limitation?",
            correct_answer="Small sample size limited generalizability",
            student_answer="The sample was small"
        )
    assert result["score"] == 1
    assert "explanation" in result
