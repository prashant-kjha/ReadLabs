from pydantic import BaseModel, EmailStr
from typing import Literal


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["teacher", "student"]


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    name: str
    role: str


class MeResponse(BaseModel):
    user_id: str
    name: str
    role: str
