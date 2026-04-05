"""
Supabase database client using async HTTP (PostgREST + Auth API).
Fully async — never blocks the event loop.
"""
import asyncio
import logging
from typing import Any
import httpx
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

POSTGREST = f"{settings.supabase_url}/rest/v1"
AUTH_URL  = f"{settings.supabase_url}/auth/v1"


def _admin_headers() -> dict:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _anon_headers() -> dict:
    return {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {settings.supabase_anon_key}",
        "Content-Type": "application/json",
    }


class Result:
    def __init__(self, data, error):
        self.data = data
        self.error = error


class QueryBuilder:
    """Async PostgREST query builder — mirrors the supabase-py interface."""

    def __init__(self, table: str, admin: bool = True):
        self._table = table
        self._headers = _admin_headers() if admin else _anon_headers()
        self._params: dict = {}
        self._body: Any = None
        self._method = "GET"
        self._single = False

    def select(self, columns: str = "*") -> "QueryBuilder":
        self._params["select"] = columns
        self._method = "GET"
        return self

    def eq(self, column: str, value: Any) -> "QueryBuilder":
        self._params[column] = f"eq.{value}"
        return self

    def is_(self, column: str, value: str) -> "QueryBuilder":
        """PostgREST null check. Use value='null' for IS NULL."""
        self._params[column] = f"is.{value}"
        return self

    def in_(self, column: str, values: list) -> "QueryBuilder":
        self._params[column] = f"in.({','.join(str(v) for v in values)})"
        return self

    def order(self, column: str, desc: bool = False) -> "QueryBuilder":
        self._params["order"] = f"{column}.{'desc' if desc else 'asc'}"
        return self

    def limit(self, n: int) -> "QueryBuilder":
        self._params["limit"] = str(n)
        return self

    def maybe_single(self) -> "QueryBuilder":
        self._single = True
        self._params["limit"] = "1"
        return self

    def single(self) -> "QueryBuilder":
        self._single = True
        self._params["limit"] = "1"
        return self

    def insert(self, data: dict) -> "QueryBuilder":
        self._method = "POST"
        self._body = data
        return self

    def update(self, data: dict) -> "QueryBuilder":
        self._method = "PATCH"
        self._body = data
        return self

    def upsert(self, data: dict, on_conflict: str = "") -> "QueryBuilder":
        self._method = "POST"
        self._body = data
        h = dict(self._headers)
        h["Prefer"] = "resolution=merge-duplicates,return=representation"
        self._headers = h
        if on_conflict:
            self._params["on_conflict"] = on_conflict
        return self

    def delete(self) -> "QueryBuilder":
        self._method = "DELETE"
        return self

    async def execute(self) -> Result:
        url = f"{POSTGREST}/{self._table}"
        try:
            client = get_shared_client()
            resp = await client.request(
                method=self._method,
                url=url,
                headers=self._headers,
                params=self._params,
                json=self._body,
            )
            if resp.status_code >= 400:
                logger.error("PostgREST %s %s → %s: %s",
                             self._method, self._table, resp.status_code, resp.text[:300])
                return Result(data=None, error=resp.text)

            data = resp.json()
            if self._single:
                data = data[0] if data else None
            return Result(data=data, error=None)

        except Exception as e:
            logger.error("DB request failed on %s: %s", self._table, e)
            return Result(data=None, error=str(e))


class SupabaseDB:
    def __init__(self, admin: bool = True):
        self._admin = admin

    def table(self, name: str) -> QueryBuilder:
        return QueryBuilder(name, admin=self._admin)

    def from_(self, name: str) -> QueryBuilder:
        return QueryBuilder(name, admin=self._admin)

    async def sign_up(self, email: str, password: str, full_name: str = "") -> dict:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{AUTH_URL}/signup",
                headers=_anon_headers(),
                json={"email": email, "password": password,
                      "data": {"full_name": full_name}},
            )
        return r.json()

    async def sign_in(self, email: str, password: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{AUTH_URL}/token?grant_type=password",
                headers=_anon_headers(),
                json={"email": email, "password": password},
            )
        return r.json()

    async def upload_file(self, bucket: str, path: str, content: bytes,
                          content_type: str = "application/pdf") -> str | None:
        url = f"{settings.supabase_url}/storage/v1/object/{bucket}/{path}"
        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": content_type,
        }
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(url, headers=headers, content=content)
            if r.status_code in (200, 201):
                return f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"
        except Exception as e:
            logger.warning("Storage upload failed: %s", e)
        return None


_admin_db: SupabaseDB | None = None
_anon_db: SupabaseDB | None = None
_shared_client: httpx.AsyncClient | None = None


def get_shared_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(timeout=15, http2=True)
    return _shared_client


def get_db() -> SupabaseDB:
    global _admin_db
    if _admin_db is None:
        _admin_db = SupabaseDB(admin=True)
    return _admin_db


def get_anon_db() -> SupabaseDB:
    global _anon_db
    if _anon_db is None:
        _anon_db = SupabaseDB(admin=False)
    return _anon_db
