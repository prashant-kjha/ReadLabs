from pydantic import BaseModel


class CreateClassRequest(BaseModel):
    name: str
