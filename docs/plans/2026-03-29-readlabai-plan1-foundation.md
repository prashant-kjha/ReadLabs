# ReadLabs — Plan 1: Foundation, Auth & Paper Ingestion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new ReadLabs project with working auth (teacher/student roles), PDF upload, and text + figure extraction. At the end of this plan, a teacher can sign up, upload a PDF, and see extracted text and figures. The classroom features (assignments, reading journey, dashboard) come in Plans 2–4.

**Architecture:** New repo. FastAPI backend + React frontend + Supabase. Backend infrastructure modules copied from PaperPulse (`C:\Users\prash\paperpulse\`) where noted. Full Supabase schema written upfront for all ReadLabs tables — easier to migrate once than repeatedly.

**Tech Stack:** FastAPI 0.115, Python 3.11+, React 19, Tailwind CSS 3, Supabase (PostgreSQL + Auth + Storage), PyMuPDF (fitz), httpx, pytest

---

## Plan Series

- **Plan 1 (this plan):** Foundation, Auth & Paper Ingestion
- **Plan 2:** Class Management & AI Assignment Creation
- **Plan 3:** Student Reading Journey
- **Plan 4:** Teacher Dashboard & Class Insights

---

## File Map

```
C:\Users\prash\readlabs\
├── supabase_schema.sql
├── .env
├── .env.example
├── .gitignore
├── backend\
│   ├── main.py                        NEW — FastAPI app entry point
│   ├── config.py                      COPY from PaperPulse (no changes)
│   ├── db.py                          COPY from PaperPulse (no changes)
│   ├── deps.py                        COPY + MODIFY — add require_teacher / require_student
│   ├── requirements.txt               NEW
│   ├── requirements-test.txt          NEW
│   ├── routers\
│   │   ├── __init__.py
│   │   ├── auth.py                    NEW — signup/signin with role field
│   │   └── papers.py                  NEW — PDF upload endpoint
│   ├── services\
│   │   ├── __init__.py
│   │   └── paper_service.py           NEW — text + figure extraction
│   └── tests\
│       ├── conftest.py                NEW
│       ├── test_auth.py               NEW
│       └── test_papers.py             NEW
└── frontend\
    ├── package.json
    └── src\
        ├── App.js                     NEW — role-based routing
        ├── index.css                  MODIFY — Tailwind directives
        ├── lib\
        │   ├── api.js                 COPY from PaperPulse (no changes)
        │   └── supabase.js            COPY from PaperPulse (no changes)
        ├── context\
        │   └── AuthContext.jsx        NEW — stores role alongside user
        ├── components\
        │   ├── Layout.jsx             NEW — role-aware sidebar nav
        │   └── ProtectedRoute.jsx     COPY from PaperPulse (no changes)
        └── pages\
            ├── AuthPage.jsx           NEW — signup with role toggle
            └── teacher\
                └── PapersPage.jsx     NEW — upload PDF, list papers
```

---

### Task 1: Initialize Project

**Files:**
- Create: `C:\Users\prash\readlabs\` (all directories)
- Create: `backend\requirements.txt`
- Create: `backend\requirements-test.txt`
- Create: `.env.example`
- Create: `.gitignore`
- Copy: PaperPulse's `config.py`, `db.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p C:/Users/prash/readlabs/backend/routers
mkdir -p C:/Users/prash/readlabs/backend/services
mkdir -p C:/Users/prash/readlabs/backend/tests
mkdir -p C:/Users/prash/readlabs/frontend
cd C:/Users/prash/readlabs
git init
touch backend/routers/__init__.py
touch backend/services/__init__.py
```

- [ ] **Step 2: Copy unchanged backend modules from PaperPulse**

```bash
cp C:/Users/prash/paperpulse/backend/config.py C:/Users/prash/readlabs/backend/config.py
cp C:/Users/prash/paperpulse/backend/db.py C:/Users/prash/readlabs/backend/db.py
```

- [ ] **Step 3: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn==0.30.6
python-multipart==0.0.12
httpx==0.27.0
pydantic-settings==2.4.0
PyMuPDF==1.24.10
google-generativeai==0.8.3
tenacity==8.5.0
python-jose[cryptography]==3.3.0
supabase==2.9.1
Pillow==10.4.0
```

- [ ] **Step 4: Create `backend/requirements-test.txt`**

```
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.0
Pillow==10.4.0
```

- [ ] **Step 5: Create `.env` (fill in your values before running)**

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
```

- [ ] **Step 6: Create `.env.example`**

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
GEMINI_API_KEY=
```

- [ ] **Step 7: Create `.gitignore`**

```
.env
__pycache__/
*.pyc
.pytest_cache/
node_modules/
build/
.DS_Store
*.log
```

- [ ] **Step 8: Initialize frontend**

```bash
cd C:/Users/prash/readlabs/frontend
npx create-react-app . --template cra-template
npm install axios@1.13.6 @supabase/supabase-js@2.100.1 react-router-dom@6.30.3 react-hot-toast@2.6.0
npx tailwindcss init
```

Expected: `added X packages` with no errors.

- [ ] **Step 9: Configure Tailwind**

Replace `frontend/tailwind.config.js` contents with:

```js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
}
```

Replace `frontend/src/index.css` contents with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 10: Copy unchanged frontend modules from PaperPulse**

```bash
mkdir -p C:/Users/prash/readlabs/frontend/src/lib
mkdir -p C:/Users/prash/readlabs/frontend/src/context
mkdir -p C:/Users/prash/readlabs/frontend/src/components
mkdir -p C:/Users/prash/readlabs/frontend/src/pages/teacher
mkdir -p C:/Users/prash/readlabs/frontend/src/pages/student

cp C:/Users/prash/paperpulse/frontend/src/lib/api.js C:/Users/prash/readlabs/frontend/src/lib/api.js
cp C:/Users/prash/paperpulse/frontend/src/lib/supabase.js C:/Users/prash/readlabs/frontend/src/lib/supabase.js
cp C:/Users/prash/paperpulse/frontend/src/components/ProtectedRoute.jsx C:/Users/prash/readlabs/frontend/src/components/ProtectedRoute.jsx
```

- [ ] **Step 11: Install Python dependencies**

```bash
cd C:/Users/prash/readlabs
pip install -r backend/requirements.txt
```

Expected: All packages install with no errors.

- [ ] **Step 12: Commit**

```bash
cd C:/Users/prash/readlabs
git add .
git commit -m "feat: initialize ReadLabs project structure"
```

---

### Task 2: Supabase Schema

**Files:**
- Create: `supabase_schema.sql`

- [ ] **Step 1: Create `supabase_schema.sql`**

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- User profiles (teacher or student, one per auth user)
create table user_profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  name      text not null,
  role      text not null check (role in ('teacher', 'student')),
  created_at timestamptz default now()
);
alter table user_profiles enable row level security;
create policy "Users read own profile"   on user_profiles for select using (auth.uid() = user_id);
create policy "Users insert own profile" on user_profiles for insert with check (auth.uid() = user_id);
create policy "Users update own profile" on user_profiles for update using (auth.uid() = user_id);

-- Classes (one teacher owns many classes)
create table classes (
  id         uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  class_code text not null unique,
  created_at timestamptz default now()
);
alter table classes enable row level security;
create policy "Teachers manage own classes" on classes for all using (auth.uid() = teacher_id);
create policy "Anyone can read classes"     on classes for select using (true);

-- Enrollments (student joins class via class_code)
create table class_enrollments (
  class_id     uuid not null references classes(id) on delete cascade,
  student_id   uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  enrolled_at  timestamptz default now(),
  primary key (class_id, student_id)
);
alter table class_enrollments enable row level security;
create policy "Students manage own enrollment" on class_enrollments
  for all using (auth.uid() = student_id);
create policy "Teachers read enrollments for own classes" on class_enrollments
  for select using (
    exists (select 1 from classes where classes.id = class_enrollments.class_id and classes.teacher_id = auth.uid())
  );
create policy "Teachers delete enrollments for own classes" on class_enrollments
  for delete using (
    exists (select 1 from classes where classes.id = class_enrollments.class_id and classes.teacher_id = auth.uid())
  );

-- Papers (teacher uploads a PDF; extraction stored here)
create table papers (
  id             uuid primary key default uuid_generate_v4(),
  title          text not null,
  extracted_text text,
  figures        jsonb default '[]',
  pdf_path       text,
  uploaded_by    uuid not null references auth.users(id),
  created_at     timestamptz default now()
);
alter table papers enable row level security;
create policy "Teachers manage own papers" on papers for all using (auth.uid() = uploaded_by);

-- Assignments (teacher assigns paper to class; AI reading guide stored here)
create table assignments (
  id           uuid primary key default uuid_generate_v4(),
  class_id     uuid not null references classes(id) on delete cascade,
  paper_id     uuid not null references papers(id) on delete cascade,
  reading_guide jsonb,
  status       text not null default 'processing'
                 check (status in ('processing', 'draft', 'published')),
  difficulty   text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  created_at   timestamptz default now()
);
alter table assignments enable row level security;
create policy "Teachers manage assignments for own classes" on assignments
  for all using (
    exists (select 1 from classes where classes.id = assignments.class_id and classes.teacher_id = auth.uid())
  );
create policy "Students read published assignments for enrolled classes" on assignments
  for select using (
    status = 'published' and
    exists (
      select 1 from class_enrollments
      where class_enrollments.class_id = assignments.class_id
        and class_enrollments.student_id = auth.uid()
    )
  );

-- Student reading sessions (one per student per assignment)
create table student_sessions (
  id                   uuid primary key default uuid_generate_v4(),
  student_id           uuid not null references auth.users(id) on delete cascade,
  assignment_id        uuid not null references assignments(id) on delete cascade,
  status               text not null default 'not_started'
                         check (status in ('not_started', 'in_progress', 'completed')),
  current_section_index int not null default 0,
  started_at           timestamptz,
  completed_at         timestamptz,
  unique (student_id, assignment_id)
);
alter table student_sessions enable row level security;
create policy "Students manage own sessions" on student_sessions
  for all using (auth.uid() = student_id);
create policy "Teachers read sessions for own class assignments" on student_sessions
  for select using (
    exists (
      select 1 from assignments
      join classes on classes.id = assignments.class_id
      where assignments.id = student_sessions.assignment_id
        and classes.teacher_id = auth.uid()
    )
  );

-- Checkpoint responses (student writes after each section)
create table checkpoint_responses (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references student_sessions(id) on delete cascade,
  section_index int not null,
  student_text  text not null,
  ai_feedback   text,
  submitted_at  timestamptz default now(),
  unique (session_id, section_index)
);
alter table checkpoint_responses enable row level security;
create policy "Students manage own checkpoint responses" on checkpoint_responses
  for all using (
    exists (select 1 from student_sessions where student_sessions.id = checkpoint_responses.session_id and student_sessions.student_id = auth.uid())
  );
create policy "Teachers read checkpoint responses for own classes" on checkpoint_responses
  for select using (
    exists (
      select 1 from student_sessions
      join assignments on assignments.id = student_sessions.assignment_id
      join classes on classes.id = assignments.class_id
      where student_sessions.id = checkpoint_responses.session_id
        and classes.teacher_id = auth.uid()
    )
  );

-- So What responses (final synthesis paragraph per session)
create table sowhat_responses (
  id           uuid primary key default uuid_generate_v4(),
  session_id   uuid not null references student_sessions(id) on delete cascade unique,
  student_text text not null,
  ai_feedback  text,
  submitted_at timestamptz default now()
);
alter table sowhat_responses enable row level security;
create policy "Students manage own sowhat responses" on sowhat_responses
  for all using (
    exists (select 1 from student_sessions where student_sessions.id = sowhat_responses.session_id and student_sessions.student_id = auth.uid())
  );
create policy "Teachers read sowhat responses for own classes" on sowhat_responses
  for select using (
    exists (
      select 1 from student_sessions
      join assignments on assignments.id = student_sessions.assignment_id
      join classes on classes.id = assignments.class_id
      where student_sessions.id = sowhat_responses.session_id
        and classes.teacher_id = auth.uid()
    )
  );

-- Jargon lookups (student highlights a term, requests explanation)
create table jargon_lookups (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid not null references student_sessions(id) on delete cascade,
  term        text not null,
  explanation text not null,
  created_at  timestamptz default now()
);
alter table jargon_lookups enable row level security;
create policy "Students manage own jargon lookups" on jargon_lookups
  for all using (
    exists (select 1 from student_sessions where student_sessions.id = jargon_lookups.session_id and student_sessions.student_id = auth.uid())
  );

-- Assignment insights (class-wide patterns, generated once on-demand)
create table assignment_insights (
  id            uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references assignments(id) on delete cascade unique,
  insights      jsonb not null,
  generated_at  timestamptz default now()
);
alter table assignment_insights enable row level security;
create policy "Teachers manage insights for own class assignments" on assignment_insights
  for all using (
    exists (
      select 1 from assignments
      join classes on classes.id = assignments.class_id
      where assignments.id = assignment_insights.assignment_id
        and classes.teacher_id = auth.uid()
    )
  );

-- Storage bucket for PDFs
insert into storage.buckets (id, name, public) values ('papers', 'papers', false)
  on conflict do nothing;
create policy "Authenticated users upload papers" on storage.objects
  for insert with check (bucket_id = 'papers' and auth.role() = 'authenticated');
create policy "Authenticated users read papers" on storage.objects
  for select using (bucket_id = 'papers' and auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply schema in Supabase**

In the Supabase dashboard → SQL Editor, paste the full contents of `supabase_schema.sql` and click Run.

Expected: All statements succeed with no errors. If a table already exists error appears, the database is not clean — create a fresh Supabase project.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/prash/readlabs
git add supabase_schema.sql
git commit -m "feat: add full ReadLabs Supabase schema"
```

---

### Task 3: Backend Foundation

**Files:**
- Create: `backend/main.py`
- Modify: `backend/deps.py` (copy from PaperPulse, append role helpers)
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Copy `deps.py` from PaperPulse**

```bash
cp C:/Users/prash/paperpulse/backend/deps.py C:/Users/prash/readlabs/backend/deps.py
```

- [ ] **Step 2: Append role-checking helpers to `backend/deps.py`**

Open `backend/deps.py` and add at the bottom of the file:

```python
async def require_teacher(user: dict = Depends(get_current_user), db=Depends(get_db)):
    result = await db.from_("user_profiles").select("role").eq("user_id", user["sub"]).single().execute()
    if not result.data or result.data.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


async def require_student(user: dict = Depends(get_current_user), db=Depends(get_db)):
    result = await db.from_("user_profiles").select("role").eq("user_id", user["sub"]).single().execute()
    if not result.data or result.data.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return user
```

- [ ] **Step 3: Create `backend/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import auth, papers

app = FastAPI(title="ReadLabs API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(papers.router, prefix="/api/v1/papers", tags=["papers"])


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Create `backend/tests/conftest.py`**

```python
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
```

- [ ] **Step 5: Verify health endpoint starts**

```bash
cd C:/Users/prash/readlabs
uvicorn backend.main:app --reload
```

In a separate terminal:

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

Stop the server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/deps.py backend/tests/conftest.py
git commit -m "feat: add backend foundation with role-checking dependencies"
```

---

### Task 4: Auth Router with Role Support

**Files:**
- Create: `backend/routers/auth.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_auth.py`:

```python
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/Users/prash/readlabs
pytest backend/tests/test_auth.py -v
```

Expected: FAIL — `404 Not Found` (route doesn't exist yet).

- [ ] **Step 3: Create `backend/routers/auth.py`**

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Literal
from supabase import create_client
from backend.config import settings
from backend.db import get_db
from backend.deps import get_current_user

router = APIRouter()

supabase_admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["teacher", "student"]


class SigninRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/signup")
async def signup(body: SignupRequest, db=Depends(get_db)):
    try:
        auth_resp = supabase_admin.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    user_id = auth_resp.user.id
    await db.from_("user_profiles").insert({
        "user_id": user_id,
        "name": body.name,
        "role": body.role,
    }).execute()

    sign_in = supabase_admin.auth.sign_in_with_password({
        "email": body.email,
        "password": body.password,
    })

    return {
        "access_token": sign_in.session.access_token,
        "refresh_token": sign_in.session.refresh_token,
        "user_id": user_id,
        "name": body.name,
        "role": body.role,
    }


@router.post("/signin")
async def signin(body: SigninRequest, db=Depends(get_db)):
    try:
        sign_in = supabase_admin.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = sign_in.user.id
    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user_id).single().execute()

    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="User profile not found")

    return {
        "access_token": sign_in.session.access_token,
        "refresh_token": sign_in.session.refresh_token,
        "user_id": user_id,
        "name": profile_resp.data["name"],
        "role": profile_resp.data["role"],
    }


@router.get("/me")
async def me(user=Depends(get_current_user), db=Depends(get_db)):
    profile_resp = await db.from_("user_profiles").select("name, role") \
        .eq("user_id", user["sub"]).single().execute()
    if not profile_resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"user_id": user["sub"], **profile_resp.data}
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_auth.py -v
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/auth.py backend/tests/test_auth.py
git commit -m "feat: add auth router with teacher/student role support"
```

---

### Task 5: PDF Extraction Service

**Files:**
- Create: `backend/services/paper_service.py`
- Create: `backend/tests/test_papers.py` (partial — extraction tests only)

- [ ] **Step 1: Write failing tests for extraction**

Create `backend/tests/test_papers.py`:

```python
import pytest
import fitz  # PyMuPDF
import io
from backend.services.paper_service import extract_text_and_figures


def make_pdf_with_text(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def make_pdf_with_image() -> bytes:
    from PIL import Image
    doc = fitz.open()
    page = doc.new_page()
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)
    page.insert_image(fitz.Rect(50, 50, 150, 150), stream=img_buf.read())
    page.insert_text((50, 200), "Figure 1. A red square.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def test_extracts_text():
    pdf = make_pdf_with_text("Abstract\nThis is the abstract.")
    result = extract_text_and_figures(pdf)
    assert "text" in result
    assert "Abstract" in result["text"]


def test_returns_figures_list():
    pdf = make_pdf_with_text("No images here.")
    result = extract_text_and_figures(pdf)
    assert "figures" in result
    assert isinstance(result["figures"], list)


def test_extracts_images():
    pdf = make_pdf_with_image()
    result = extract_text_and_figures(pdf)
    assert len(result["figures"]) >= 1
    fig = result["figures"][0]
    assert "data" in fig       # base64-encoded image
    assert "page" in fig
    assert "width" in fig
    assert "height" in fig


def test_empty_pdf_returns_empty_text():
    doc = fitz.open()
    doc.new_page()
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    result = extract_text_and_figures(buf.getvalue())
    assert result["text"].strip() == ""
    assert result["figures"] == []
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_papers.py -v
```

Expected: FAIL — `ImportError: cannot import name 'extract_text_and_figures'`

- [ ] **Step 3: Create `backend/services/paper_service.py`**

```python
import fitz  # PyMuPDF
import base64
from typing import Any


def extract_text_and_figures(pdf_bytes: bytes) -> dict[str, Any]:
    """
    Extract all text and embedded images from a PDF.

    Returns:
        {
            "text": str,      # full text of all pages concatenated
            "figures": [
                {
                    "page":   int,   # 1-indexed page number
                    "index":  int,   # image index on that page
                    "data":   str,   # base64-encoded image bytes
                    "ext":    str,   # image format, e.g. "png", "jpeg"
                    "width":  int,
                    "height": int,
                }
            ]
        }
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text_parts: list[str] = []
    figures: list[dict] = []

    for page_num, page in enumerate(doc):
        text_parts.append(page.get_text())

        for img_index, img in enumerate(page.get_images(full=True)):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                figures.append({
                    "page":   page_num + 1,
                    "index":  img_index,
                    "data":   base64.b64encode(base_image["image"]).decode("utf-8"),
                    "ext":    base_image["ext"],
                    "width":  base_image["width"],
                    "height": base_image["height"],
                })
            except Exception:
                continue  # skip unreadable images

    doc.close()
    return {
        "text":    "\n".join(text_parts),
        "figures": figures,
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_papers.py -v
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/paper_service.py backend/tests/test_papers.py
git commit -m "feat: add PDF text and figure extraction service"
```

---

### Task 6: Papers Upload Endpoint

**Files:**
- Create: `backend/routers/papers.py`
- Modify: `backend/tests/test_papers.py` (append endpoint tests)

- [ ] **Step 1: Write failing endpoint tests**

Append to `backend/tests/test_papers.py`:

```python
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from backend.main import app

api_client = TestClient(app)


def test_upload_requires_auth():
    response = api_client.post(
        "/api/v1/papers/upload",
        files={"file": ("test.pdf", b"%PDF-fake", "application/pdf")},
    )
    assert response.status_code == 401


def test_upload_rejects_non_pdf():
    mock_teacher = {"sub": "teacher-uuid-123"}
    with patch("backend.routers.papers.require_teacher", return_value=mock_teacher):
        response = api_client.post(
            "/api/v1/papers/upload",
            files={"file": ("notes.txt", b"just text", "text/plain")},
        )
    assert response.status_code == 400
    assert "PDF" in response.json()["detail"]


def test_upload_returns_paper_metadata():
    import fitz, io
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Abstract\nTest content.")
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    pdf_bytes = buf.getvalue()

    mock_teacher = {"sub": "teacher-uuid-123"}
    mock_db = MagicMock()
    mock_db.from_ = MagicMock(return_value=mock_db)
    mock_db.insert = MagicMock(return_value=mock_db)
    mock_db.execute = AsyncMock(return_value=MagicMock(
        data=[{"id": "paper-uuid-1", "title": "test", "created_at": "2026-01-01"}]
    ))

    with patch("backend.routers.papers.require_teacher", return_value=mock_teacher), \
         patch("backend.routers.papers.get_db", return_value=mock_db), \
         patch("backend.routers.papers._upload_to_storage", new_callable=AsyncMock, return_value="papers/teacher-uuid-123/test.pdf"):
        response = api_client.post(
            "/api/v1/papers/upload",
            files={"file": ("paper.pdf", pdf_bytes, "application/pdf")},
            data={"title": "Test Paper"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Test Paper"
    assert "figure_count" in body
    assert "text_length" in body
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest backend/tests/test_papers.py::test_upload_requires_auth -v
pytest backend/tests/test_papers.py::test_upload_rejects_non_pdf -v
```

Expected: FAIL — `404 Not Found`.

- [ ] **Step 3: Create `backend/routers/papers.py`**

```python
import uuid
import httpx
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from backend.db import get_db
from backend.deps import require_teacher
from backend.services.paper_service import extract_text_and_figures
from backend.config import settings

router = APIRouter()

MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB


async def _upload_to_storage(pdf_bytes: bytes, path: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{path}",
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/pdf",
            },
            content=pdf_bytes,
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail="Failed to store PDF in storage")
    return path


@router.post("/upload")
async def upload_paper(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    user=Depends(require_teacher),
    db=Depends(get_db),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF must be under 20 MB")

    extracted = extract_text_and_figures(pdf_bytes)

    paper_title = title.strip() or (
        file.filename.replace(".pdf", "").replace("_", " ") if file.filename else "Untitled"
    )

    pdf_path = f"papers/{user['sub']}/{uuid.uuid4()}.pdf"
    await _upload_to_storage(pdf_bytes, pdf_path)

    result = await db.from_("papers").insert({
        "title":          paper_title,
        "extracted_text": extracted["text"],
        "figures":        extracted["figures"],
        "pdf_path":       pdf_path,
        "uploaded_by":    user["sub"],
    }).execute()

    paper = result.data[0]
    return {
        "id":           paper["id"],
        "title":        paper["title"],
        "text_length":  len(extracted["text"]),
        "figure_count": len(extracted["figures"]),
        "pdf_path":     pdf_path,
    }


@router.get("/")
async def list_papers(user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("papers") \
        .select("id, title, created_at") \
        .eq("uploaded_by", user["sub"]) \
        .order("created_at", desc=True) \
        .execute()
    return result.data or []


@router.get("/{paper_id}")
async def get_paper(paper_id: str, user=Depends(require_teacher), db=Depends(get_db)):
    result = await db.from_("papers") \
        .select("id, title, extracted_text, figures, pdf_path, created_at") \
        .eq("id", paper_id) \
        .eq("uploaded_by", user["sub"]) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")
    return result.data
```

- [ ] **Step 4: Run all tests**

```bash
pytest backend/tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/papers.py backend/tests/test_papers.py
git commit -m "feat: add paper upload endpoint with Supabase Storage"
```

---

### Task 7: Frontend Auth with Role Routing

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Create: `frontend/src/pages/AuthPage.jsx`
- Create: `frontend/src/components/Layout.jsx`
- Create: `frontend/src/App.js`

- [ ] **Step 1: Create `frontend/src/context/AuthContext.jsx`**

```jsx
import { createContext, useContext, useState, useEffect } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [role, setRole]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("readlab_user");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setRole(parsed.role);
      api.defaults.headers.common["Authorization"] = `Bearer ${parsed.access_token}`;
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    localStorage.setItem("readlab_user", JSON.stringify(userData));
    api.defaults.headers.common["Authorization"] = `Bearer ${userData.access_token}`;
    setUser(userData);
    setRole(userData.role);
  };

  const logout = () => {
    localStorage.removeItem("readlab_user");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 2: Create `frontend/src/pages/AuthPage.jsx`**

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function AuthPage() {
  const [mode, setMode]   = useState("signin");
  const [role, setRole]   = useState("teacher");
  const [form, setForm]   = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "/auth/signup" : "/auth/signin";
      const payload  = mode === "signup"
        ? { ...form, role }
        : { email: form.email, password: form.password };

      const { data } = await api.post(endpoint, payload);
      login(data);
      navigate(data.role === "teacher" ? "/teacher/papers" : "/student/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">ReadLabs</h1>
        <p className="text-gray-400 text-sm mb-6">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>

        {mode === "signup" && (
          <div className="flex gap-2 mb-5">
            {["teacher", "student"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  role === r
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-4">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-indigo-400 hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/components/Layout.jsx`**

```jsx
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TEACHER_LINKS = [
  { to: "/teacher/papers",  label: "Papers" },
  { to: "/teacher/classes", label: "Classes" },
];

const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "My Assignments" },
];

export default function Layout() {
  const { role, logout } = useAuth();
  const navigate         = useNavigate();
  const links            = role === "teacher" ? TEACHER_LINKS : STUDENT_LINKS;

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="w-52 bg-gray-900 flex flex-col p-4 shrink-0">
        <div className="text-white font-bold text-base mb-8 px-2">ReadLabs</div>
        <nav className="flex-1 space-y-0.5">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-white text-sm px-3 py-2 text-left transition-colors"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/App.js`**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import Layout from "./components/Layout";

// Stubs — replaced in Plans 2 and 3
const TeacherPapersPage    = () => <div className="text-white p-8">Papers — coming in Plan 2</div>;
const TeacherClassesPage   = () => <div className="text-white p-8">Classes — coming in Plan 2</div>;
const StudentDashboardPage = () => <div className="text-white p-8">Assignments — coming in Plan 3</div>;

function AppRoutes() {
  const { role } = useAuth();
  const defaultPath = role === "teacher" ? "/teacher/papers" : "/student/dashboard";

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/teacher/papers"      element={role === "teacher" ? <TeacherPapersPage />    : <Navigate to="/auth" />} />
          <Route path="/teacher/classes"     element={role === "teacher" ? <TeacherClassesPage />   : <Navigate to="/auth" />} />
          <Route path="/student/dashboard"   element={role === "student" ? <StudentDashboardPage /> : <Navigate to="/auth" />} />
          <Route path="/" element={<Navigate to={defaultPath} />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Start the frontend and verify auth flow manually**

```bash
cd C:/Users/prash/readlabs/frontend
npm start
```

Open `http://localhost:3000`. Check:
1. Redirects to `/auth`
2. Sign up shows role toggle (Teacher / Student)
3. Signing up as teacher redirects to `/teacher/papers`
4. Signing up as student redirects to `/student/dashboard`
5. Refreshing the page keeps the user logged in
6. Sign out clears the session and returns to `/auth`

- [ ] **Step 6: Commit**

```bash
cd C:/Users/prash/readlabs
git add frontend/src/
git commit -m "feat: add frontend auth with role-based routing"
```

---

### Task 8: Teacher Papers Page

**Files:**
- Create: `frontend/src/pages/teacher/PapersPage.jsx`
- Modify: `frontend/src/App.js` (replace TeacherPapersPage stub)

- [ ] **Step 1: Create `frontend/src/pages/teacher/PapersPage.jsx`**

```jsx
import { useState, useEffect } from "react";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function PapersPage() {
  const [papers, setPapers]     = useState([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle]       = useState("");

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => {});
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title || file.name.replace(".pdf", ""));
    try {
      const { data } = await api.post("/papers/upload", form);
      setPapers((prev) => [data, ...prev]);
      setTitle("");
      toast.success(`Uploaded: ${data.title}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Papers</h1>

      <div className="bg-gray-900 rounded-xl p-6 mb-8">
        <h2 className="text-white font-medium mb-4">Upload a Paper</h2>
        <input
          type="text"
          placeholder="Paper title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
        <label className={`block w-full text-center py-2.5 rounded-lg cursor-pointer font-medium transition-colors ${
          uploading
            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 text-white"
        }`}>
          {uploading ? "Processing…" : "Choose PDF"}
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        <p className="text-gray-500 text-xs mt-2">Max 20 MB. Text and figures are extracted automatically.</p>
      </div>

      <div className="space-y-3">
        {papers.length === 0 && (
          <p className="text-gray-500 text-sm">No papers yet. Upload one above.</p>
        )}
        {papers.map((paper) => (
          <div key={paper.id} className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{paper.title}</p>
              {paper.text_length != null && (
                <p className="text-gray-500 text-xs mt-0.5">
                  {paper.text_length.toLocaleString()} chars · {paper.figure_count ?? 0} figures
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the stub in `frontend/src/App.js`**

In `App.js`, replace:
```jsx
const TeacherPapersPage    = () => <div className="text-white p-8">Papers — coming in Plan 2</div>;
```
With:
```jsx
import TeacherPapersPage from "./pages/teacher/PapersPage";
```

Move the import to the top of the file with the other imports.

- [ ] **Step 3: Verify the full upload flow**

Start both servers:

```bash
# Terminal 1
cd C:/Users/prash/readlabs
uvicorn backend.main:app --reload

# Terminal 2
cd C:/Users/prash/readlabs/frontend
npm start
```

Sign in as a teacher. Upload a PDF. Expected:
- Progress shows "Processing…" while uploading
- Paper appears in the list with character count and figure count
- Toast notification confirms upload

- [ ] **Step 4: Run all backend tests one final time**

```bash
cd C:/Users/prash/readlabs
pytest backend/tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/teacher/PapersPage.jsx frontend/src/App.js
git commit -m "feat: add teacher papers page with PDF upload UI"
```

---

## Plan 1 Complete

At this point:
- A teacher can sign up, log in, and upload a PDF
- Text and figures are extracted and stored in Supabase
- Auth enforces teacher/student roles on all routes
- All backend tests pass

**Next:** Plan 2 covers class management and AI assignment creation — teachers create classes, assign uploaded papers, and Gemini generates the reading guide for review.
