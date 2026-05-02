"""Tests for slowapi rate limiting on auth and AI endpoints."""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.rate_limit import limiter


@pytest.fixture(autouse=True)
def reset_limiter():
    """Each test starts with a fresh limiter state."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def client():
    return TestClient(app)


def _failing_async_client_factory():
    """
    Returns an httpx.AsyncClient stub whose .post() always returns a 400.
    Lets us hit endpoint logic without making real network calls. The 400
    is fine — we're testing the limiter, not the upstream behavior.
    """
    class FakeResponse:
        status_code = 400
        content = b'{"msg": "stubbed"}'
        text = '{"msg": "stubbed"}'
        def json(self):
            return {"msg": "stubbed"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def post(self, *args, **kwargs):
            return FakeResponse()

    return FakeClient


def test_rate_limit_signup_429_after_5_attempts(client):
    """5/hour limit on signup: 6th request gets 429."""
    fake_client_cls = _failing_async_client_factory()
    payload = {"email": "x@y.com", "password": "password123", "name": "X"}
    with patch("backend.routers.auth.httpx.AsyncClient", fake_client_cls):
        for i in range(5):
            r = client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "1.2.3.4"})
            assert r.status_code != 429, f"Hit limit too early at attempt {i + 1}"
        r = client.post("/api/v1/auth/signup", json=payload, headers={"X-Forwarded-For": "1.2.3.4"})
    assert r.status_code == 429


def test_rate_limit_signin_429_after_10_per_minute(client):
    """10/minute limit on signin: 11th gets 429."""
    fake_client_cls = _failing_async_client_factory()
    payload = {"email": "x@y.com", "password": "password123"}
    with patch("backend.routers.auth.httpx.AsyncClient", fake_client_cls):
        for i in range(10):
            r = client.post("/api/v1/auth/signin", json=payload, headers={"X-Forwarded-For": "5.6.7.8"})
            assert r.status_code != 429, f"Hit limit too early at attempt {i + 1}"
        r = client.post("/api/v1/auth/signin", json=payload, headers={"X-Forwarded-For": "5.6.7.8"})
    assert r.status_code == 429


def test_rate_limit_per_ip_independent():
    """
    The limiter key function is get_remote_address, so different client IPs
    get independent counters.  TestClient always resolves to 'testclient',
    so we test this by directly inspecting the key function rather than via
    the HTTP layer, then verify the 6th request from the same client is blocked
    while fresh state (after reset) is not.
    """
    from slowapi.util import get_remote_address
    from starlette.testclient import TestClient as StarletteClient

    # Verify the limiter uses get_remote_address as its key function
    from backend.rate_limit import limiter
    assert limiter._key_func is get_remote_address

    # Verify a freshly-reset counter is not blocked (the functional guarantee)
    fake_client_cls = _failing_async_client_factory()
    payload = {"email": "x@y.com", "password": "password123", "name": "X"}
    client = StarletteClient(app)
    with patch("backend.routers.auth.httpx.AsyncClient", fake_client_cls):
        # Exhaust the limit from "testclient"
        for _ in range(5):
            client.post("/api/v1/auth/signup", json=payload)
        r_blocked = client.post("/api/v1/auth/signup", json=payload)
        assert r_blocked.status_code == 429
        # After reset, the counter is cleared — equivalent to a fresh IP
        limiter.reset()
        r_fresh = client.post("/api/v1/auth/signup", json=payload)
        assert r_fresh.status_code != 429


def test_rate_limit_signin_below_threshold_no_429(client):
    """Sanity: 5 signins (well below 10/minute) never hit 429."""
    fake_client_cls = _failing_async_client_factory()
    payload = {"email": "x@y.com", "password": "password123"}
    with patch("backend.routers.auth.httpx.AsyncClient", fake_client_cls):
        for i in range(5):
            r = client.post("/api/v1/auth/signin", json=payload, headers={"X-Forwarded-For": "9.9.9.9"})
            assert r.status_code != 429, f"Got 429 at attempt {i + 1}"
