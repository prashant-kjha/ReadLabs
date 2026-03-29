from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Literal
from supabase import create_client
from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user

router = APIRouter()
settings = get_settings()

try:
    supabase_admin = create_client(settings.supabase_url, settings.supabase_service_role_key)
except Exception:
    supabase_admin = None  # Will be patched in tests; real usage requires valid credentials


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["teacher", "student"]


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/signup")
async def signup(body: SignupRequest, db=Depends(get_db)):
    try:
        auth_resp = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    user_id = auth_resp.user.id
    await db.from_("user_profiles").insert({
        "user_id": user_id,
        "name": body.name,
        "role": body.role,
    }).execute()

    sign_in = supabase_admin.auth.sign_in_with_password({
        "email": body.email,
        "password": body.password,
    })

    return {
        "access_token": sign_in.session.access_token,
        "refresh_token": sign_in.session.refresh_token,
        "user_id": user_id,
        "name": body.name,
        "role": body.role,
    }


@router.post("/signin")
async def signin(body: SigninRequest, db=Depends(get_db)):
    try:
        sign_in = supabase_admin.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = sign_in.user.id
    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user_id).single().execute()

    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="User profile not found")

    return {
        "access_token": sign_in.session.access_token,
        "refresh_token": sign_in.session.refresh_token,
        "user_id": user_id,
        "name": profile_resp.data["name"],
        "role": profile_resp.data["role"],
    }


@router.get("/me")
async def me(user=Depends(get_current_user), db=Depends(get_db)):
    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user["sub"]).single().execute()
    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"user_id": user["sub"], **profile_resp.data}
