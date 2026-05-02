"""Tests for backend.deps — JWKS cache TTL, role factory."""
import time
import pytest
from unittest.mock import patch
from fastapi import HTTPException
from backend.deps import _get_jwks, require_role
import backend.deps as deps_module


@pytest.fixture(autouse=True)
def reset_jwks_cache():
    """Each test starts with cleared cache."""
    deps_module._jwks_cache = None
    yield
    deps_module._jwks_cache = None


def _patched_async_httpx(fake_jwks):
    """Returns a context manager that patches httpx.AsyncClient to return fake_jwks."""
    class FakeResponse:
        def json(self):
            return fake_jwks
        def raise_for_status(self):
            pass

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.get_calls = 0
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def get(self, *args, **kwargs):
            return FakeResponse()

    return FakeClient


@pytest.mark.asyncio
async def test_jwks_cache_uses_cached_value_within_ttl():
    """Within TTL window, second call must not re-fetch."""
    fake_jwks = {"keys": [{"kid": "k1"}]}
    fake_client_cls = _patched_async_httpx(fake_jwks)
    instances = []

    class TrackingClient(fake_client_cls):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            instances.append(self)

    with patch("backend.deps.httpx.AsyncClient", TrackingClient):
        result1 = await _get_jwks()
        result2 = await _get_jwks()

    assert result1 == fake_jwks
    assert result2 == fake_jwks
    assert len(instances) == 1, f"Expected 1 fetch, got {len(instances)}"


@pytest.mark.asyncio
async def test_jwks_cache_refreshes_after_ttl():
    """After TTL expires, next call refetches."""
    fake_jwks = {"keys": [{"kid": "k1"}]}
    fake_client_cls = _patched_async_httpx(fake_jwks)
    instances = []

    class TrackingClient(fake_client_cls):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            instances.append(self)

    with patch("backend.deps.httpx.AsyncClient", TrackingClient):
        await _get_jwks()
        # Simulate TTL expiry by manually rewinding the cache timestamp
        cached_jwks, _old_ts = deps_module._jwks_cache
        deps_module._jwks_cache = (cached_jwks, time.monotonic() - deps_module._JWKS_TTL_SECONDS - 1)
        await _get_jwks()

    assert len(instances) == 2


@pytest.mark.asyncio
async def test_jwks_cache_force_refresh_bypasses_cache():
    """force_refresh=True bypasses cache check."""
    fake_jwks = {"keys": [{"kid": "k1"}]}
    fake_client_cls = _patched_async_httpx(fake_jwks)
    instances = []

    class TrackingClient(fake_client_cls):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            instances.append(self)

    with patch("backend.deps.httpx.AsyncClient", TrackingClient):
        await _get_jwks()
        await _get_jwks(force_refresh=True)

    assert len(instances) == 2


@pytest.mark.asyncio
async def test_role_factory_accepts_matching_role():
    """A user whose profile.role == 'student' passes require_role('student')."""
    check = require_role("student")

    fake_user = {"sub": "abc"}

    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        async def execute(self):
            class R:
                data = {"role": "student"}
                error = None
            return R()

    result = await check(user=fake_user, db=FakeDb())
    assert result == fake_user


@pytest.mark.asyncio
async def test_role_factory_rejects_wrong_role():
    """A teacher token used on a student-only endpoint gets 403."""
    check = require_role("student")
    fake_user = {"sub": "abc"}

    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        async def execute(self):
            class R:
                data = {"role": "teacher"}
                error = None
            return R()

    with pytest.raises(HTTPException) as exc:
        await check(user=fake_user, db=FakeDb())
    assert exc.value.status_code == 403
    assert "Student" in exc.value.detail


@pytest.mark.asyncio
async def test_role_factory_missing_profile_returns_403():
    """If no user_profiles row, return 403 not 500."""
    check = require_role("student")

    class FakeDb:
        def from_(self, _t):
            return self
        def select(self, _c):
            return self
        def eq(self, _k, _v):
            return self
        def single(self):
            return self
        async def execute(self):
            class R:
                data = None
                error = None
            return R()

    with pytest.raises(HTTPException) as exc:
        await check(user={"sub": "abc"}, db=FakeDb())
    assert exc.value.status_code == 403
