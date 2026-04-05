from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Literal
import httpx
from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user

router = APIRouter()
settings = get_settings()

AUTH_URL = f"{settings.supabase_url}/auth/v1"
ADMIN_HEADERS = {
    "apikey": settings.supabase_service_role_key,
    "Authorization": f"Bearer {settings.supabase_service_role_key}",
    "Content-Type": "application/json",
}
ANON_HEADERS = {
    "apikey": settings.supabase_anon_key,
    "Authorization": f"Bearer {settings.supabase_anon_key}",
    "Content-Type": "application/json",
}


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
    async with httpx.AsyncClient(timeout=15) as client:
        # Create user with email already confirmed (admin API)
        r = await client.post(
            f"{AUTH_URL}/admin/users",
            headers=ADMIN_HEADERS,
            json={"email": body.email, "password": body.password, "email_confirm": True},
        )
    if r.status_code >= 400:
        detail = r.json().get("msg") or r.json().get("message") or r.text
        raise HTTPException(status_code=400, detail=detail)

    user_id = r.json()["id"]

    await db.from_("user_profiles").insert({
        "user_id": user_id,
        "name": body.name,
        "role": body.role,
    }).execute()

    # Sign in to get tokens
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{AUTH_URL}/token?grant_type=password",
            headers=ANON_HEADERS,
            json={"email": body.email, "password": body.password},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=400, detail="Account created but sign-in failed")

    tokens = r.json()
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "user_id": user_id,
        "name": body.name,
        "role": body.role,
    }


@router.post("/signin")
async def signin(body: SigninRequest, db=Depends(get_db)):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{AUTH_URL}/token?grant_type=password",
            headers=ANON_HEADERS,
            json={"email": body.email, "password": body.password},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    tokens = r.json()
    user_id = tokens["user"]["id"]

    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user_id).single().execute()

    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="User profile not found")

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
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
