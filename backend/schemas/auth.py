from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    # Enforced server-side so the policy holds regardless of the Supabase
    # dashboard setting. 72-byte upper bound matches bcrypt's input limit.
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=120)
    # Role is NOT accepted from the client. New accounts are always created as
    # students; teacher accounts are provisioned out-of-band (Supabase dashboard).


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


class SignupResponse(BaseModel):
    user_id: str
    email_confirmation_required: bool = True


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
