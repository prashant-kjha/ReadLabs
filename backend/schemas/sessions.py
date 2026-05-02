from pydantic import BaseModel, Field, ConfigDict


class StartSessionRequest(BaseModel):
    assignment_id: str


class ProgressRequest(BaseModel):
    current_section_index: int


class CheckpointRequest(BaseModel):
    section_index: int
    student_text: str


class SoWhatRequest(BaseModel):
    student_text: str


class JargonRequest(BaseModel):
    term: str
    context_snippet: str


class KeyTermRequest(BaseModel):
    term: str
    context_snippet: str


class PreviewCheckpointRequest(BaseModel):
    section_title: str
    guiding_questions: list[str]
    student_text: str


class PreviewSoWhatRequest(BaseModel):
    paper_title: str
    section_titles: list[str]
    difficulty: str
    student_text: str


class PreviewJargonRequest(BaseModel):
    term: str
    context_snippet: str


class PreviewKeyTermRequest(BaseModel):
    assignment_id: str
    term: str
    context_snippet: str


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
