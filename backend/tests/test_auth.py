import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch, _patch
from backend.main import app

client = TestClient(app)


def test_signup_rejects_invalid_role():
    response = client.post("/api/v1/auth/signup", json={
        "email": "test@test.com",
        "password": "password123",
        "name": "Test User",
        "role": "admin",
    })
    assert response.status_code == 422


def test_signin_returns_401_on_bad_credentials():
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.json.return_value = {"msg": "Invalid credentials"}

    mock_ctx = AsyncMock()
    mock_ctx.post = AsyncMock(return_value=mock_response)
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=mock_ctx):
        response = client.post("/api/v1/auth/signin", json={
            "email": "nobody@test.com",
            "password": "wrongpass",
        })
    assert response.status_code == 401


def test_signup_accepts_teacher_role():
    # Mock the admin create user response
    create_response = MagicMock()
    create_response.status_code = 200
    create_response.json.return_value = {"id": "new-uuid-123"}

    # Mock the sign-in token response
    token_response = MagicMock()
    token_response.status_code = 200
    token_response.json.return_value = {
        "access_token": "tok_access",
        "refresh_token": "tok_refresh",
        "user": {"id": "new-uuid-123"},
    }

    mock_db = MagicMock()
    mock_db.from_ = MagicMock(return_value=mock_db)
    mock_db.insert = MagicMock(return_value=mock_db)
    mock_db.execute = AsyncMock(return_value=MagicMock(data=[{}]))

    call_count = [0]

    async def mock_post(url, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        if "admin/users" in url:
            return create_response
        return token_response

    mock_ctx = AsyncMock()
    mock_ctx.post = mock_post
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("backend.routers.auth.httpx.AsyncClient", return_value=mock_ctx), \
         patch("backend.routers.auth.get_db", return_value=mock_db):
        response = client.post("/api/v1/auth/signup", json={
            "email": "teacher@test.com",
            "password": "password123",
            "name": "Ms. Smith",
            "role": "teacher",
        })

    assert response.status_code == 200
    assert response.json()["role"] == "teacher"
    assert "access_token" in response.json()
