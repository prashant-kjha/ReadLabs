from pydantic import BaseModel


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
