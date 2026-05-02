from pydantic import BaseModel, Field, ConfigDict


class ClassDescriptor(BaseModel):
    id: str
    name: str


class StudentSession(BaseModel):
    student_id: str
    assignment_id: str
    status: str
    current_section_index: int
    completed_at: str | None = None


class StudentProgressEntry(BaseModel):
    student_id: str
    student_name: str
    sessions: list[StudentSession]


class AssignmentSummary(BaseModel):
    id: str
    status: str
    difficulty: str | None = None
    created_at: str | None = None
    reading_guide: dict | None = None


class ClassProgressResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    class_: ClassDescriptor = Field(..., alias="class")
    assignments: list[AssignmentSummary]
    students: list[StudentProgressEntry]


class CheckpointEntry(BaseModel):
    section_index: int
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class SoWhatEntry(BaseModel):
    student_text: str
    ai_feedback: str | None = None
    submitted_at: str | None = None


class StudentSessionEntry(BaseModel):
    id: str
    status: str
    current_section_index: int
    started_at: str | None = None
    completed_at: str | None = None


class StudentResponsesResponse(BaseModel):
    session: StudentSessionEntry | None = None
    checkpoints: list[CheckpointEntry] = []
    sowhat: SoWhatEntry | None = None


class SectionInsight(BaseModel):
    title: str
    common_misconception: str
    commonly_grasped: str
    student_count: int | None = None


class InsightsPayload(BaseModel):
    sections: list[SectionInsight]


class AssignmentInsightsResponse(BaseModel):
    insights: InsightsPayload
    generated_at: str | None = None
