from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
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
