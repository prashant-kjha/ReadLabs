"""
Tests for /api/v1/auth/* endpoints.

As of the 2026-05-01 security review:
  - signup is student-only (no `role` field accepted from the client),
  - signup uses Supabase's public /auth/v1/signup (email confirmation required),
  - signup returns {user_id, email_confirmation_required}, not access tokens,
  - signin surfaces the email-not-confirmed case as a 401 with a specific message.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.db import get_db


def _async_ctx(post_handler):
    """Build an httpx.AsyncClient context-manager mock with the given .post handler."""
    ctx = AsyncMock()
    ctx.post = post_handler
    ctx.__aenter__ = AsyncMock(return_value=ctx)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


@pytest.fixture
def unauth_client(mock_db):
    """TestClient with the db dependency overridden but no auth override
    (auth endpoints don't require an authenticated user)."""
    app.dependency_overrides[get_db] = lambda: mock_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_signup_succeeds_and_returns_email_confirmation_required(unauth_client, mock_db):
    """Happy path: signup completes, returns user_id, no tokens leak."""
    signup_response = MagicMock()
    signup_response.status_code = 200
    signup_response.content = b'{"user": {"id": "new-uuid-123"}, "session": null}'
    signup_response.json.return_value = {"user": {"id": "new-uuid-123"}, "session": None}

    mock_db.execute = AsyncMock(return_value=MagicMock(data=[{}]))

    async def mock_post(url, **kwargs):
        return signup_response

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=_async_ctx(mock_post)):
        response = unauth_client.post("/api/v1/auth/signup", json={
            "email": "student@test.com",
            "password": "password123",
            "name": "New Student",
        })

    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "new-uuid-123"
    assert body["email_confirmation_required"] is True
    # Critical: signup must not leak tokens.
    assert "access_token" not in body
    assert "refresh_token" not in body


def test_signup_ignores_role_field_in_request(unauth_client, mock_db):
    """Even if a malicious client sends role=teacher, the user_profiles row
    must be created as a student. The role field is not in the schema, so
    Pydantic drops it (`extra = "ignore"`)."""
    signup_response = MagicMock()
    signup_response.status_code = 200
    signup_response.content = b'{"user": {"id": "uuid-2"}}'
    signup_response.json.return_value = {"user": {"id": "uuid-2"}}

    insert_capture = {}

    def capture_insert(payload):
        insert_capture["payload"] = payload
        return mock_db
    mock_db.insert = MagicMock(side_effect=capture_insert)
    mock_db.execute = AsyncMock(return_value=MagicMock(data=[{}]))

    async def mock_post(url, **kwargs):
        return signup_response

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=_async_ctx(mock_post)):
        response = unauth_client.post("/api/v1/auth/signup", json={
            "email": "sneaky@test.com",
            "password": "password123",
            "name": "Sneaky",
            "role": "teacher",  # attacker-controlled — must be ignored
        })

    assert response.status_code == 200
    # The profile row must have been written with role='student'.
    assert "payload" in insert_capture, "db.insert() was never called"
    assert insert_capture["payload"]["role"] == "student"


def test_signup_propagates_supabase_error(unauth_client):
    """If Supabase rejects (e.g., email already in use), surface a 400."""
    signup_response = MagicMock()
    signup_response.status_code = 400
    signup_response.content = b'{"msg": "User already registered"}'
    signup_response.json.return_value = {"msg": "User already registered"}
    signup_response.text = '{"msg": "User already registered"}'

    async def mock_post(url, **kwargs):
        return signup_response

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=_async_ctx(mock_post)):
        response = unauth_client.post("/api/v1/auth/signup", json={
            "email": "taken@test.com",
            "password": "password123",
            "name": "Test",
        })

    assert response.status_code == 400
    assert "already registered" in response.json()["detail"].lower()


def test_signin_returns_401_on_bad_credentials(unauth_client):
    bad = MagicMock()
    bad.status_code = 401
    bad.content = b'{"msg": "Invalid credentials"}'
    bad.json.return_value = {"msg": "Invalid credentials"}
    bad.text = '{"msg": "Invalid credentials"}'

    async def mock_post(url, **kwargs):
        return bad

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=_async_ctx(mock_post)):
        response = unauth_client.post("/api/v1/auth/signin", json={
            "email": "nobody@test.com",
            "password": "wrongpass",
        })
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_signin_surfaces_email_not_confirmed(unauth_client):
    """When Supabase returns error_code=email_not_confirmed, the API must
    return a 401 with the specific message so the UI can prompt the user."""
    not_confirmed = MagicMock()
    not_confirmed.status_code = 400
    not_confirmed.content = b'{"error_code": "email_not_confirmed", "msg": "Email not confirmed"}'
    not_confirmed.json.return_value = {"error_code": "email_not_confirmed", "msg": "Email not confirmed"}
    not_confirmed.text = '{"error_code": "email_not_confirmed"}'

    async def mock_post(url, **kwargs):
        return not_confirmed

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=_async_ctx(mock_post)):
        response = unauth_client.post("/api/v1/auth/signin", json={
            "email": "unconfirmed@test.com",
            "password": "password123",
        })

    assert response.status_code == 401
    assert "not confirmed" in response.json()["detail"].lower()


def test_signin_happy_path_returns_tokens(unauth_client, mock_db):
    """Confirmed user signs in successfully — gets tokens + role from profile."""
    token_resp = MagicMock()
    token_resp.status_code = 200
    token_resp.content = b'{}'
    token_resp.json.return_value = {
        "access_token": "tok_access",
        "refresh_token": "tok_refresh",
        "user": {"id": "uuid-good"},
    }

    mock_db.execute = AsyncMock(return_value=MagicMock(data={"name": "Alice", "role": "student"}))

    async def mock_post(url, **kwargs):
        return token_resp

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=_async_ctx(mock_post)):
        response = unauth_client.post("/api/v1/auth/signin", json={
            "email": "alice@test.com",
            "password": "password123",
        })

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == "tok_access"
    assert body["refresh_token"] == "tok_refresh"
    assert body["role"] == "student"
    assert body["user_id"] == "uuid-good"
