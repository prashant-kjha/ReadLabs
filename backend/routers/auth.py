from fastapi import APIRouter, HTTPException, Depends, Request
import httpx
from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user
from backend.rate_limit import limiter
from backend.schemas.auth import (
    SignupRequest, SigninRequest, AuthResponse, MeResponse, SignupResponse,
)

router = APIRouter()


def _auth_url() -> str:
    return f"{get_settings().supabase_url}/auth/v1"


def _anon_headers() -> dict:
    s = get_settings()
    return {
        "apikey": s.supabase_anon_key,
        "Authorization": f"Bearer {s.supabase_anon_key}",
        "Content-Type": "application/json",
    }


@router.post("/signup", response_model=SignupResponse)
@limiter.limit("5/hour")
async def signup(request: Request, body: SignupRequest, db=Depends(get_db)):
    """
    Create a new student account. Email confirmation is required before sign-in.
    Role is hardcoded to "student" — teacher accounts must be provisioned manually.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        # Use the public signup endpoint so Supabase sends a confirmation email.
        r = await client.post(
            f"{_auth_url()}/signup",
            headers=_anon_headers(),
            json={
                "email": body.email,
                "password": body.password,
                "data": {"full_name": body.name},
            },
        )
    if r.status_code >= 400:
        body_json = r.json() if r.content else {}
        detail = body_json.get("msg") or body_json.get("message") or r.text
        raise HTTPException(status_code=400, detail=detail)

    payload = r.json()
    # Supabase /signup returns either {"user": {...}, "session": null} (confirmation
    # required) or top-level user fields. Handle both.
    user = payload.get("user") or payload
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=500, detail="Signup succeeded but no user id returned")

    # Always create the profile as a student. The DB still uses the service-role
    # key (RLS bypass), so this is the *only* gate preventing privilege escalation.
    await db.from_("user_profiles").insert({
        "user_id": user_id,
        "name": body.name,
        "role": "student",
    }).execute()

    return {"user_id": user_id, "email_confirmation_required": True}


@router.post("/signin", response_model=AuthResponse)
@limiter.limit("10/minute")
async def signin(request: Request, body: SigninRequest, db=Depends(get_db)):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{_auth_url()}/token?grant_type=password",
            headers=_anon_headers(),
            json={"email": body.email, "password": body.password},
        )
    if r.status_code >= 400:
        # Surface the email-not-confirmed case so the UI can prompt the user.
        body_json = r.json() if r.content else {}
        err_code = body_json.get("error_code") or body_json.get("error") or ""
        if err_code == "email_not_confirmed":
            raise HTTPException(status_code=401, detail="Email not confirmed. Check your inbox for a confirmation link.")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    tokens = r.json()
    user_id = tokens["user"]["id"]

    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user_id).single().execute()

    if getattr(profile_resp, "error", None) and not profile_resp.data:
        raise HTTPException(status_code=500, detail="Profile lookup failed")
    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="User profile not found")

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "user_id": user_id,
        "name": profile_resp.data["name"],
        "role": profile_resp.data["role"],
    }


@router.get("/me", response_model=MeResponse)
@limiter.limit("60/minute")
async def me(request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user["sub"]).single().execute()
    if getattr(profile_resp, "error", None) and not profile_resp.data:
        raise HTTPException(status_code=500, detail="Profile lookup failed")
    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"user_id": user["sub"], **profile_resp.data}
