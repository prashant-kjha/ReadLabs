import pytest
from fastapi.testclient import TestClient
from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_teacher():
    return {"sub": "teacher-uuid-123", "email": "teacher@test.com"}


@pytest.fixture
def mock_student():
    return {"sub": "student-uuid-456", "email": "student@test.com"}
