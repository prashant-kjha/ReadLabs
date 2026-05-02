"""
Shared FastAPI dependencies.
JWT verification uses Supabase's JWKS endpoint — no shared secret needed.
Database access via db.py (direct HTTP, bypasses Supabase Python client key validation).
"""
import logging
import time
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, ExpiredSignatureError
from jose.exceptions import JWKError
import httpx
from backend.config import get_settings
from backend.db import get_db

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)

_JWKS_TTL_SECONDS = 600  # 10 min
_jwks_cache: tuple[dict, float] | None = None  # (jwks, fetched_at_monotonic)


async def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache
    now = time.monotonic()
    if not force_refresh and _jwks_cache and (now - _jwks_cache[1]) < _JWKS_TTL_SECONDS:
        return _jwks_cache[0]
    url = f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()
        _jwks_cache = (data, now)
        logger.info("JWKS fetched (%d keys)", len(data.get("keys", [])))
    return data


async def _verify_token(token: str, _retried: bool = False) -> dict:
    jwks = await _get_jwks()
    last_error: Exception | None = None
    for key_data in jwks.get("keys", []):
        try:
            return jwt.decode(
                token, key_data,
                algorithms=["RS256", "ES256"],
                options={"verify_aud": False},
            )
        except ExpiredSignatureError:
            raise
        except (JWTError, JWKError) as e:
            last_error = e
    # No key worked. If we haven't already retried, force a JWKS refresh
    # (in case Supabase rotated keys) and try once more.
    if not _retried:
        await _get_jwks(force_refresh=True)
        return await _verify_token(token, _retried=True)
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


def require_role(role: str):
    """Dependency factory: returns a dependency that asserts the caller has the given role."""
    async def _check(
        user: dict = Depends(get_current_user),
        db = Depends(get_db),
    ) -> dict:
        user_id = user.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        result = await db.from_("user_profiles").select("role").eq("user_id", user_id).single().execute()
        if hasattr(result, "error") and result.error:
            raise HTTPException(status_code=500, detail="Database error checking role")
        if not result.data:
            raise HTTPException(status_code=403, detail="User profile not found")
        if result.data.get("role") != role:
            raise HTTPException(status_code=403, detail=f"{role.capitalize()} access required")
        return user
    return _check


require_teacher = require_role("teacher")
require_student = require_role("student")
