from pydantic import BaseModel
from typing import Optional


class CreateAssignmentRequest(BaseModel):
    class_id: str
    paper_id: str


class UpdateAssignmentRequest(BaseModel):
    reading_guide: Optional[dict] = None
    difficulty: Optional[str] = None
    status: Optional[str] = None
