from pydantic import BaseModel
from typing import Optional


class CreateAnnotationRequest(BaseModel):
    session_id: str
    section_index: int
    start_char: int
    end_char: int
    highlight_text: str
    color: str = "#3B82F9"
    category: str = "important"


class UpdateAnnotationRequest(BaseModel):
    note_text: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = None


class XpRequest(BaseModel):
    action: str


class QuizAttemptRequest(BaseModel):
    assignment_id: str
    answers: dict
