from pydantic import BaseModel


class PaperUploadResponse(BaseModel):
    id: str
    title: str
    text_length: int
    figure_count: int
    pdf_path: str
