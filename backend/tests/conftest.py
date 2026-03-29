import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock
from backend.main import app
from backend.deps import get_current_user
from backend.db import get_db


@pytest.fixture
def mock_teacher():
    return {"sub": "teacher-uuid-123", "email": "teacher@test.com"}


@pytest.fixture
def mock_student():
    return {"sub": "student-uuid-456", "email": "student@test.com"}


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.from_ = MagicMock(return_value=db)
    db.select = MagicMock(return_value=db)
    db.eq = MagicMock(return_value=db)
    db.single = MagicMock(return_value=db)
    db.insert = MagicMock(return_value=db)
    db.execute = AsyncMock(return_value=MagicMock(data=None, error=None))
    return db


@pytest.fixture
def client(mock_teacher, mock_db):
    app.dependency_overrides[get_current_user] = lambda: mock_teacher
    app.dependency_overrides[get_db] = lambda: mock_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def student_client(mock_student, mock_db):
    app.dependency_overrides[get_current_user] = lambda: mock_student
    app.dependency_overrides[get_db] = lambda: mock_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def unauthed_client():
    app.dependency_overrides.clear()
    with TestClient(app) as c:
        yield c
