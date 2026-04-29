from pydantic import BaseModel


class FetchCoreRequest(BaseModel):
    core_id: str
    title: str
