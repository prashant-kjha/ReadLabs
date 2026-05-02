"""Contract tests: assert real endpoint responses validate against new schemas."""
from backend.schemas.sessions import (
    SessionStartResponse, JargonResponse, KeyTermResponse,
    CheckpointPendingResponse,
)
from backend.schemas.dashboard import ClassProgressResponse
from backend.schemas.superpowers import (
    ReadingStatsResponse, XpResultResponse, RecommendationResponse,
)


def test_session_start_response_validates():
    payload = {
        "session_id": "abc-123",
        "assignment_id": "asn-1",
        "paper_id": "pap-1",
        "status": "in_progress",
        "current_section_index": 0,
        "reading_guide": {"sections": []},
        "paper_title": "Test Paper",
        "difficulty": "intermediate",
    }
    obj = SessionStartResponse(**payload)
    assert obj.session_id == "abc-123"


def test_session_start_response_accepts_null_reading_guide():
    """Self-study path: reading_guide is None while AI generation is in-progress."""
    payload = {
        "session_id": "abc-123",
        "assignment_id": "asn-1",
        "paper_id": "pap-1",
        "status": "in_progress",
        "current_section_index": 0,
        "reading_guide": None,
        "paper_title": "Test Paper",
    }
    obj = SessionStartResponse(**payload)
    assert obj.reading_guide is None


def test_jargon_response_validates():
    obj = JargonResponse(
        id="jl-1",
        term="regression",
        explanation="A statistical method...",
        feedback_pending=False,
    )
    assert obj.term == "regression"


def test_keyterm_response_validates_cached_flag():
    obj = KeyTermResponse(term="t", explanation="e", cached=True)
    assert obj.cached is True


def test_checkpoint_pending_response_validates():
    obj = CheckpointPendingResponse(id="cp-1", feedback_pending=True)
    assert obj.feedback_pending is True


def test_class_progress_response_validates_with_class_alias():
    payload = {
        "class": {"id": "c1", "name": "Bio 101"},
        "assignments": [],
        "students": [],
    }
    obj = ClassProgressResponse.model_validate(payload)
    assert obj.class_.name == "Bio 101"


def test_reading_stats_response_validates_with_defaults():
    obj = ReadingStatsResponse(student_id="s1")
    assert obj.xp == 0
    assert obj.level == 1


def test_xp_result_response_validates():
    obj = XpResultResponse(xp=100, level=2, streak=3, xp_earned=10)
    assert obj.level == 2


def test_recommendation_response_validates():
    payload = {
        "paper": {"id": "p1", "title": "T"},
        "assignment_id": "a1",
        "reason": "Fresh upload",
    }
    obj = RecommendationResponse(**payload)
    assert obj.assignment_id == "a1"
