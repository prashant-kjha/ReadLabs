from pydantic import BaseModel, Field


# Length limits exist to cap the size of inputs we forward to the AI provider
# (which we pay for per-token) and to reject obvious abuse before it consumes
# bandwidth. Values are generous compared to typical UI usage.

_STUDENT_TEXT_MAX = 5000
_CONTEXT_SNIPPET_MAX = 2000
_TERM_MAX = 200
_TITLE_MAX = 500


class StartSessionRequest(BaseModel):
    assignment_id: str


class ProgressRequest(BaseModel):
    current_section_index: int


class CheckpointRequest(BaseModel):
    section_index: int
    student_text: str = Field(max_length=_STUDENT_TEXT_MAX)


class SoWhatRequest(BaseModel):
    student_text: str = Field(max_length=_STUDENT_TEXT_MAX)


class JargonRequest(BaseModel):
    term: str = Field(max_length=_TERM_MAX)
    context_snippet: str = Field(max_length=_CONTEXT_SNIPPET_MAX)


class KeyTermRequest(BaseModel):
    term: str = Field(max_length=_TERM_MAX)
    context_snippet: str = Field(max_length=_CONTEXT_SNIPPET_MAX)


class PreviewCheckpointRequest(BaseModel):
    section_title: str = Field(max_length=_TITLE_MAX)
    guiding_questions: list[str] = Field(max_length=20)
    student_text: str = Field(max_length=_STUDENT_TEXT_MAX)


class PreviewSoWhatRequest(BaseModel):
    paper_title: str = Field(max_length=_TITLE_MAX)
    section_titles: list[str] = Field(max_length=50)
    difficulty: str = Field(max_length=50)
    student_text: str = Field(max_length=_STUDENT_TEXT_MAX)


class PreviewJargonRequest(BaseModel):
    term: str = Field(max_length=_TERM_MAX)
    context_snippet: str = Field(max_length=_CONTEXT_SNIPPET_MAX)


class PreviewKeyTermRequest(BaseModel):
    assignment_id: str
    term: str = Field(max_length=_TERM_MAX)
    context_snippet: str = Field(max_length=_CONTEXT_SNIPPET_MAX)


# ── Response models ──────────────────────────────────────────────────────────


class SessionStartResponse(BaseModel):
    session_id: str
    assignment_id: str
    paper_id: str
    status: str
    current_section_index: int
    reading_guide: dict | None = None
    paper_title: str
    difficulty: str | None = None


class SessionListItem(BaseModel):
    id: str
    assignment_id: str
    status: str
    current_section_index: int


class CheckpointResponseRow(BaseModel):
    id: str
    section_index: int
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class SoWhatResponseRow(BaseModel):
    id: str
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class JargonLookupRow(BaseModel):
    id: str
    term: str
    explanation: str | None = None
    created_at: str | None = None


class SessionDetailResponse(BaseModel):
    id: str
    assignment_id: str
    status: str
    current_section_index: int
    checkpoints: list[CheckpointResponseRow] = []
    sowhat: SoWhatResponseRow | None = None
    jargon_lookups: list[JargonLookupRow] = []


class CheckpointPendingResponse(BaseModel):
    id: str
    feedback_pending: bool


class SoWhatPendingResponse(BaseModel):
    id: str
    feedback_pending: bool


class JargonResponse(BaseModel):
    id: str
    term: str
    explanation: str
    feedback_pending: bool = False


class KeyTermResponse(BaseModel):
    term: str
    explanation: str
    cached: bool


class ProgressUpdateResponse(BaseModel):
    ok: bool
