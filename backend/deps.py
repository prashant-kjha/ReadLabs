"""
Shared FastAPI dependencies.
JWT verification uses Supabase's JWKS endpoint — no shared secret needed.
Database access via db.py (direct HTTP, bypasses Supabase Python client key validation).
"""
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, ExpiredSignatureError
from jose.exceptions import JWKError
import httpx
from backend.config import get_settings
from backend.db import get_db

logger = logging.getLogger(__name__)
settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)

_jwks_cache: dict | None = None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        _jwks_cache = r.json()
        logger.info("JWKS fetched (%d keys)", len(_jwks_cache.get("keys", [])))
    return _jwks_cache


async def _verify_token(token: str) -> dict:
    jwks = await _get_jwks()
    last_error: Exception | None = None
    for key_data in jwks.get("keys", []):
        try:
            return jwt.decode(
                token, key_data,
                algorithms=["RS256", "ES256", "HS256"],
                options={"verify_aud": False},
            )
        except ExpiredSignatureError:
            raise
        except (JWTError, JWKError, Exception) as e:
            last_error = e
    global _jwks_cache
    _jwks_cache = None
    raise JWTError(f"No key verified the token: {last_error}")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return await _verify_token(credentials.credentials)
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict | None:
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_teacher(user: dict = Depends(get_current_user), db=Depends(get_db)):
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.from_("user_profiles").select("role").eq("user_id", user_id).single().execute()
    if hasattr(result, "error") and result.error:
        raise HTTPException(status_code=500, detail="Database error checking role")
    if not result.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    if result.data.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


async def require_student(user: dict = Depends(get_current_user), db=Depends(get_db)):
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.from_("user_profiles").select("role").eq("user_id", user_id).single().execute()
    if hasattr(result, "error") and result.error:
        raise HTTPException(status_code=500, detail="Database error checking role")
    if not result.data:
        raise HTTPException(status_code=403, detail="User profile not found")
    if result.data.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return user
