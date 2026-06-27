from pydantic import BaseModel, Field, ConfigDict
from typing import Any


class FetchCoreRequest(BaseModel):
    core_id: str
    title: str


# ── Response models ──────────────────────────────────────────────────────────


class LibraryUploadResponse(BaseModel):
    paper_id: str
    assignment_id: str
    status: str
    title: str | None = None


class LibraryStatusResponse(BaseModel):
    id: str
    status: str
    reading_guide: dict | None = None
    difficulty: str | None = None


class BrowseAssignmentInfo(BaseModel):
    """Nested assignment info returned by the browse endpoint."""
    id: str
    paper_id: str | None = None
    status: str | None = None
    difficulty: str | None = None


class LibraryPaperResponse(BaseModel):
    id: str
    title: str
    uploaded_by: str | None = None
    created_at: str | None = None
    assignment: BrowseAssignmentInfo | None = None


class CoreSearchResult(BaseModel):
    core_id: str
    title: str
    abstract: str | None = None
    authors: str | None = None
    year_published: int | None = None
    download_url: str | None = None
    similarity: float | None = None


class LandmarkLevel(BaseModel):
    difficulty: str
    assignment_id: str


class LandmarkPaper(BaseModel):
    paper_id: str
    title: str
    created_at: str | None = None
    levels: list[LandmarkLevel] = []


class LandmarkLibraryResponse(BaseModel):
    items: list[LandmarkPaper]
    has_more: bool


class AssignLandmarkRequest(BaseModel):
    class_id: str
    paper_id: str
    difficulty: str


class AssignLandmarkResponse(BaseModel):
    assignment_id: str
    class_id: str
    paper_id: str
    difficulty: str
    status: str
