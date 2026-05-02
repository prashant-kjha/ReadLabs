from pydantic import BaseModel, Field, ConfigDict


class CreateAnnotationRequest(BaseModel):
    session_id: str
    section_index: int
    start_char: int
    end_char: int
    highlight_text: str
    color: str = "#3B82F9"
    category: str = "important"


class UpdateAnnotationRequest(BaseModel):
    note_text: str | None = None
    color: str | None = None
    category: str | None = None


class XpRequest(BaseModel):
    action: str


class QuizAttemptRequest(BaseModel):
    assignment_id: str
    answers: dict


# ── Response models ──────────────────────────────────────────────────────────


class ReadingStatsResponse(BaseModel):
    student_id: str
    papers_read: int = 0
    quizzes_passed: int = 0
    current_streak: int = 0
    longest_streak: int = 0
    last_read_at: str | None = None
    level: int = 1
    xp: int = 0
    total_sections_completed: int = 0
    checkpoints_completed: int = 0
    average_comprehension_score: float = 0


class XpResultResponse(BaseModel):
    xp: int
    level: int
    streak: int
    xp_earned: int


class QuizQuestionResponse(BaseModel):
    id: str
    assignment_id: str
    question_type: str  # "multiple_choice" or "short_answer"
    question_text: str
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class QuizQuestionResult(BaseModel):
    question_id: str
    score: int
    max: int
    correct_answer: str | None = None
    explanation: str | None = None


class QuizAttemptResponse(BaseModel):
    score: int
    max_score: int
    results: list[QuizQuestionResult]


class RecommendedPaper(BaseModel):
    id: str
    title: str


class RecommendationResponse(BaseModel):
    paper: RecommendedPaper
    assignment_id: str
    reason: str
