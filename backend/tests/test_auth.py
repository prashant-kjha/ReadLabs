import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
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
    with patch("backend.routers.auth.supabase_admin") as mock_sb:
        mock_sb.auth.sign_in_with_password.side_effect = Exception("Invalid credentials")
        response = client.post("/api/v1/auth/signin", json={
            "email": "nobody@test.com",
            "password": "wrongpass",
        })
    assert response.status_code == 401


def test_signup_accepts_teacher_role():
    mock_user = MagicMock()
    mock_user.id = "new-uuid-123"

    mock_session = MagicMock()
    mock_session.access_token = "tok_access"
    mock_session.refresh_token = "tok_refresh"

    mock_auth_response = MagicMock()
    mock_auth_response.user = mock_user
    mock_auth_response.session = mock_session

    mock_db = MagicMock()
    mock_db.from_ = MagicMock(return_value=mock_db)
    mock_db.insert = MagicMock(return_value=mock_db)
    mock_db.execute = AsyncMock(return_value=MagicMock(data=[{}]))

    with patch("backend.routers.auth.supabase_admin") as mock_sb, \
         patch("backend.routers.auth.get_db", return_value=mock_db):
        mock_sb.auth.admin.create_user.return_value = mock_auth_response
        mock_sb.auth.sign_in_with_password.return_value = mock_auth_response

        response = client.post("/api/v1/auth/signup", json={
            "email": "teacher@test.com",
            "password": "password123",
            "name": "Ms. Smith",
            "role": "teacher",
        })

    assert response.status_code == 200
    assert response.json()["role"] == "teacher"
    assert "access_token" in response.json()
