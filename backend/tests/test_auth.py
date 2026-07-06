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


def test_signup_rejects_short_password(unauth_client):
    """Server-side password policy: < 8 chars must be rejected regardless of
    the Supabase project's dashboard setting."""
    response = unauth_client.post("/api/v1/auth/signup", json={
        "email": "weak@test.com",
        "password": "short1",
        "name": "Weak",
    })
    assert response.status_code == 422


# ── /auth/oauth/profile (Google sign-in support, added 2026-07-06) ──────────


def _override_user(user):
    from backend.deps import get_current_user
    app.dependency_overrides[get_current_user] = lambda: user


def test_oauth_profile_requires_auth():
    app.dependency_overrides.clear()
    with TestClient(app) as c:
        r = c.post("/api/v1/auth/oauth/profile")
    assert r.status_code == 401


def test_oauth_profile_returns_existing_profile(mock_db):
    _override_user({"sub": "uuid-oauth", "email": "g@test.com"})
    mock_db.execute = AsyncMock(return_value=MagicMock(data={"name": "Existing", "role": "teacher"}))
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with TestClient(app) as c:
            r = c.post("/api/v1/auth/oauth/profile")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body == {"user_id": "uuid-oauth", "name": "Existing", "role": "teacher"}


def test_oauth_profile_creates_student_profile_with_google_name(mock_db):
    """First Google sign-in: no profile row yet — one must be created with
    role='student' (the privilege-escalation gate) and the Google full name."""
    _override_user({
        "sub": "uuid-new",
        "email": "new@gmail.com",
        "user_metadata": {"full_name": "New Reader"},
    })

    insert_capture = {}

    def capture_insert(payload):
        insert_capture["payload"] = payload
        return mock_db
    mock_db.insert = MagicMock(side_effect=capture_insert)
    # 1st execute: profile select → None; 2nd: insert → row
    mock_db.execute = AsyncMock(side_effect=[
        MagicMock(data=None),
        MagicMock(data=[{"name": "New Reader", "role": "student"}]),
    ])
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with TestClient(app) as c:
            r = c.post("/api/v1/auth/oauth/profile")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "student"
    assert body["name"] == "New Reader"
    assert insert_capture["payload"]["role"] == "student"
    assert insert_capture["payload"]["user_id"] == "uuid-new"


def test_oauth_profile_insert_race_falls_back_to_select(mock_db):
    """Two concurrent callbacks: the losing insert must re-select and return
    the existing row instead of erroring."""
    _override_user({"sub": "uuid-race", "email": "race@gmail.com", "user_metadata": {}})
    mock_db.execute = AsyncMock(side_effect=[
        MagicMock(data=None),                       # initial select: no row yet
        MagicMock(data=None, error="duplicate key"),  # insert loses the race
        MagicMock(data={"name": "Race", "role": "student"}),  # re-select wins
    ])
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with TestClient(app) as c:
            r = c.post("/api/v1/auth/oauth/profile")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json() == {"user_id": "uuid-race", "name": "Race", "role": "student"}


def test_oauth_profile_falls_back_to_email_prefix_for_name(mock_db):
    _override_user({"sub": "uuid-noname", "email": "plain.reader@gmail.com"})
    insert_capture = {}

    def capture_insert(payload):
        insert_capture["payload"] = payload
        return mock_db
    mock_db.insert = MagicMock(side_effect=capture_insert)
    mock_db.execute = AsyncMock(side_effect=[
        MagicMock(data=None),
        MagicMock(data=[{"name": "plain.reader", "role": "student"}]),
    ])
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        with TestClient(app) as c:
            r = c.post("/api/v1/auth/oauth/profile")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    assert insert_capture["payload"]["name"] == "plain.reader"
