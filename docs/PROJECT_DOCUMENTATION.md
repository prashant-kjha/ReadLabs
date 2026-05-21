# ReadLabs — Complete Project Documentation

> Last updated: April 11, 2026

---

## Table of Contents

1. [What Is ReadLabs?](#1-what-is-readlabs)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Backend — API Reference](#6-backend--api-reference)
7. [Backend — AI Provider (Gemini)](#7-backend--ai-provider-gemini)
8. [Backend — Core Services](#8-backend--core-services)
9. [Frontend — Routing & Pages](#9-frontend--routing--pages)
10. [Frontend — State Management](#10-frontend--state-management)
11. [Frontend — Design System](#11-frontend--design-system)
12. [Superpowers Feature Suite](#12-superpowers-feature-suite)
13. [Self-Study Mode](#13-self-study-mode)
14. [Gamification System](#14-gamification-system)
15. [Testing](#15-testing)
16. [Configuration & Deployment](#16-configuration--deployment)
17. [Design Decisions & Rationale](#17-design-decisions--rationale)

---

## 1. What Is ReadLabs?

ReadLabs is an **AI-guided research paper reading platform** designed to help high school and undergraduate students develop critical reading skills for academic literature. It serves two distinct user roles:

- **Teachers** upload research papers (PDFs or via CORE API), organize students into classes, create assignments with AI-generated reading guides, and monitor student progress through a dashboard with analytics.
- **Students** read assigned papers section by section with AI-powered assistance — guiding questions, text simplification (ELI5/high school/undergrad), jargon explanations, annotations, methodology breakdowns, quizzes, and a gamified XP/streak system.

The core idea: instead of giving students a PDF and hoping they understand it, ReadLabs breaks papers into digestible sections, sets expectations with guiding questions *before* reading, provides AI feedback *after* each checkpoint, and tracks comprehension through quizzes and synthesis paragraphs.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                    │
│  React 19 + React Router + Tailwind CSS + Axios      │
│  Port 3000                                           │
└──────────────┬──────────────────────────────────────┘
               │ REST API calls (JWT Bearer tokens)
               ▼
┌─────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                   │
│  9 Router Modules + AI Provider + 2 Services         │
│  Port 8000                                           │
└──────┬──────────────┬───────────────────────────────┘
       │              │
       ▼              ▼
┌─────────────┐  ┌──────────────────┐
│  Supabase    │  │  Google Gemini   │
│  (PostgreSQL │  │  2.5 Flash       │
│   + Auth +   │  │  (AI Generation) │
│   Storage)   │  └──────────────────┘
└─────────────┘
               ┌──────────────────┐
               │  CORE API        │
               │  (Open-access    │
               │   paper search)  │
               └──────────────────┘
```

**Key architectural pattern:** The backend is a **stateless REST API** that authenticates requests via Supabase JWT tokens, reads/writes data through Supabase's PostgREST API (not direct PostgreSQL), and delegates heavy AI work to Google Gemini via background tasks.

---

## 3. Technology Stack

### Backend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| Web framework | FastAPI 0.115 | Async REST API |
| Database | Supabase (PostgreSQL) | Data persistence, auth, storage |
| AI | Google Gemini 2.5 Flash | Reading guides, feedback, quizzes |
| PDF processing | PyMuPDF (fitz) | Text and figure extraction |
| HTTP client | httpx | Async PostgREST calls, CORE API |
| Auth | python-jose | JWT verification via JWKS |
| Config | pydantic-settings | Environment variable management |
| Retry logic | tenacity | AI call retry with exponential backoff |

### Frontend
| Component | Technology | Purpose |
|-----------|-----------|---------|
| UI framework | React 19.2 | Component-based UI |
| Routing | React Router DOM 6.30 | Client-side routing |
| Styling | Tailwind CSS + CSS variables | Utility-first with theming |
| Icons | Lucide React | Consistent icon set |
| Notifications | React Hot Toast | User feedback |
| HTTP | Axios | API communication |
| Auth client | Supabase JS SDK | Client-side auth state |
| E2E testing | Playwright | User flow testing |

---

## 4. Project Structure

```
ReadLabs/
├── .env.example                        # Template for environment variables
├── .gitignore
├── supabase_schema.sql                 # Full database schema with RLS policies
│
├── backend/
│   ├── main.py                        # FastAPI app + CORS + router registration
│   ├── config.py                      # Pydantic Settings (env vars)
│   ├── db.py                          # Async PostgREST client (QueryBuilder pattern)
│   ├── deps.py                        # FastAPI dependencies (auth, role checks)
│   ├── ai_provider.py                 # All Gemini AI functions (8 functions)
│   ├── requirements.txt               # Python dependencies
│   ├── routers/
│   │   ├── auth.py                   # Signup/signin/me
│   │   ├── papers.py                 # Teacher PDF upload, library listing
│   │   ├── classes.py                # Class CRUD, enrollment management
│   │   ├── assignments.py            # Assignment creation, reading guide generation
│   │   ├── enrollment.py             # Student join/leave classes
│   │   ├── sessions.py               # Reading sessions, checkpoints, jargon
│   │   ├── dashboard.py              # Teacher dashboard, insights, student responses
│   │   ├── library.py                # Self-study: upload, browse, search CORE, fetch
│   │   └── superpowers.py            # Annotations, methodology, quizzes, XP, stats
│   ├── services/
│   │   ├── core_api.py               # CORE API integration (search + fetch)
│   │   └── paper_service.py          # PDF text + figure extraction
│   └── tests/                         # 12 pytest test files
│       ├── conftest.py               # Shared fixtures (mock DB, mock AI)
│       ├── test_auth.py
│       ├── test_papers.py
│       ├── test_classes.py
│       ├── test_assignments.py
│       ├── test_enrollment.py
│       ├── test_sessions.py
│       ├── test_dashboard.py
│       ├── test_library.py
│       ├── test_core_api.py
│       ├── test_ai_provider.py
│       ├── test_superpowers.py
│       └── test_db.py
│
├── frontend/
│   ├── package.json                   # Dependencies and scripts
│   ├── tailwind.config.js             # Tailwind with CSS variable integration
│   ├── playwright.config.js           # E2E test configuration
│   ├── public/
│   │   └── index.html                # HTML shell with Plus Jakarta Sans font
│   ├── src/
│   │   ├── App.js                    # Root: providers, routes, toast config
│   │   ├── index.js                  # React DOM entry point
│   │   ├── index.css                 # CSS variables (light/dark), component classes
│   │   ├── App.css
│   │   ├── context/
│   │   │   ├── AuthContext.jsx       # Auth state (user, role, login/logout)
│   │   │   └── ThemeContext.jsx      # Dark/light mode toggle
│   │   ├── components/
│   │   │   ├── Layout.jsx            # App shell: navbar, mobile menu, streak widget
│   │   │   ├── ProtectedRoute.jsx    # Auth guard for routes
│   │   │   └── ThemeToggle.jsx       # Dark/light mode button
│   │   ├── lib/
│   │   │   ├── api.js                # Axios instance + all API endpoint functions
│   │   │   ├── supabase.js           # Supabase client initialization
│   │   │   └── superpowersApi.js     # Superpowers-specific API calls
│   │   └── pages/
│   │       ├── LandingPage.jsx       # Marketing landing page
│   │       ├── AuthPage.jsx          # Login/signup with role selection
│   │       ├── teacher/
│   │       │   ├── PapersPage.jsx           # Upload & manage papers
│   │       │   ├── ClassesPage.jsx          # Create classes, manage enrollments
│   │       │   ├── AssignPaperPage.jsx      # Assign paper to class
│   │       │   ├── AssignmentReviewPage.jsx # Review/edit AI reading guide
│   │       │   ├── DashboardPage.jsx        # Class progress overview
│   │       │   └── AssignmentDrilldownPage.jsx # Individual student responses
│   │       └── student/
│   │           ├── StudentDashboardPage.jsx  # Joined classes & assignments
│   │           ├── SelfStudyPage.jsx         # Self-study paper library
│   │           └── ReadingPage.jsx           # Main interactive reading experience
│   └── tests/                         # 13 Playwright test files
│       ├── helpers.js                # Shared test utilities
│       ├── landing.spec.js
│       ├── auth.spec.js
│       ├── routing.spec.js
│       ├── theme.spec.js
│       ├── teacher.spec.js
│       ├── student.spec.js
│       ├── landing-extended.spec.js
│       ├── auth-extended.spec.js
│       ├── routing-extended.spec.js
│       ├── teacher-extended.spec.js
│       ├── student-extended.spec.js
│       └── gap-audit.spec.js
│
└── docs/
    ├── PROJECT_DOCUMENTATION.md       # This file
    ├── FEATURE_VERIFICATION.md
    └── superpowers/
        └── plans/
```

---

## 5. Database Schema

The database is defined in `supabase_schema.sql` and uses **Row Level Security (RLS)** on every table to enforce access control at the database level. All tables use UUID primary keys.

### Core Tables

#### `user_profiles`
Stores user metadata alongside Supabase Auth users.
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID (PK) | References `auth.users(id)` |
| name | TEXT | Display name |
| role | TEXT | `'teacher'` or `'student'` (CHECK constraint) |
| created_at | TIMESTAMPTZ | Auto-set |

**RLS:** Users can only read/update their own profile.

#### `classes`
Teacher-created classes with unique enrollment codes.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| teacher_id | UUID | References `auth.users(id)` |
| name | TEXT | Class name |
| class_code | TEXT | Unique 6-character alphanumeric code |

**RLS:** Teachers manage own classes; anyone can read (needed for enrollment lookups).

#### `class_enrollments`
Many-to-many relationship between students and classes.
| Column | Type | Notes |
|--------|------|-------|
| class_id + student_id | PK | Composite primary key |
| student_name | TEXT | Denormalized for convenience |
| enrolled_at | TIMESTAMPTZ | Auto-set |

#### `papers`
Uploaded research papers with extracted content.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| title | TEXT | Paper title |
| extracted_text | TEXT | Full text from PDF |
| figures | JSONB | Array of base64-encoded images |
| pdf_path | TEXT | Supabase Storage path |
| uploaded_by | UUID | Owner |
| is_self_study | BOOLEAN | Whether it's in the self-study library |
| category | TEXT | Subject category |
| core_id | TEXT | CORE API identifier (if sourced from CORE) |
| authors | TEXT | Author names |
| year_published | INT | Publication year |
| source | TEXT | `'upload'` or `'core_api'` |

#### `assignments`
Links a paper to a class (or null for self-study) with an AI-generated reading guide.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| class_id | UUID (nullable) | Null = self-study |
| paper_id | UUID | References `papers(id)` |
| reading_guide | JSONB | Full AI-generated guide structure |
| status | TEXT | `'processing'`, `'draft'`, `'published'` |
| difficulty | TEXT | `'beginner'`, `'intermediate'`, `'advanced'` |

#### `student_sessions`
One per student per assignment. Tracks reading progress.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Auto-generated |
| student_id + assignment_id | UNIQUE | One session per student per assignment |
| status | TEXT | `'not_started'`, `'in_progress'`, `'completed'` |
| current_section_index | INT | Which section the student is on |

#### `checkpoint_responses`
Student responses to section-by-section questions.
| Column | Type | Notes |
|--------|------|-------|
| session_id + section_index | UNIQUE | One response per section per session |
| student_text | TEXT | Student's answer |
| ai_feedback | TEXT | AI-generated Socratic feedback |

#### `sowhat_responses`
Final "So What?" synthesis paragraph.
| Column | Type | Notes |
|--------|------|-------|
| session_id | UNIQUE (FK) | One per session |
| student_text | TEXT | Student's significance claim |
| ai_feedback | TEXT | AI evaluation |

#### `jargon_lookups`
Terms students highlight for explanation.
| Column | Type | Notes |
|--------|------|-------|
| session_id | UUID (FK) | Session context |
| term | TEXT | The looked-up term |
| explanation | TEXT | AI-generated plain-English explanation |

#### `assignment_insights`
Class-wide pattern analysis (generated once, cached).
| Column | Type | Notes |
|--------|------|-------|
| assignment_id | UNIQUE (FK) | One insight set per assignment |
| insights | JSONB | Array of per-section misconceptions/grasped concepts |

### Superpowers Tables

#### `annotations`
Student highlights and notes on paper text.
| Column | Type | Notes |
|--------|------|-------|
| session_id | UUID (FK) | Session context |
| section_index | INT | Which section |
| start_char / end_char | INT | Character-level position |
| highlight_text | TEXT | The highlighted passage |
| note_text | TEXT | Student's note |
| color | TEXT | Highlight color (default blue) |
| category | TEXT | `'important'`, `'confusion'`, `'question'`, `'idea'` |
| ai_prompt_shown | BOOLEAN | Whether Socratic prompt was viewed |

#### `methodology_elements`
AI-identified research methodology components.
| Column | Type | Notes |
|--------|------|-------|
| assignment_id | UUID (FK) | Assignment context |
| section_index | INT | Which section |
| element_type | TEXT | `study_design`, `sample_size`, `statistical_test`, `control`, `effect_size`, `limitation`, `assumption`, `variable`, `finding`, `key_result` |
| label | TEXT | Human-readable name |
| description | TEXT | What was found |
| explanation | TEXT | Why it matters to students |
| follow_up_questions | JSONB | Array of follow-up questions |
| difficulty | TEXT | Reading level |

#### `critical_prompts`
AI-generated thinking prompts per section.
| Column | Type | Notes |
|--------|------|-------|
| assignment_id | UUID (FK) | Assignment context |
| section_index | INT | Which section (nullable = whole paper) |
| prompt_text | TEXT | The evaluative question |
| prompt_type | TEXT | `'evaluation'`, `'connection'`, `'synthesis'`, `'application'` |
| ai_followup | TEXT | Follow-up after student responds |

#### `quiz_questions`
AI-generated comprehension questions.
| Column | Type | Notes |
|--------|------|-------|
| assignment_id | UUID (FK) | Assignment context |
| question_text | TEXT | The question |
| question_type | TEXT | `'multiple_choice'` or `'short_answer'` |
| options | JSONB | Array of 4 options (MC only) |
| correct_answer | TEXT | Expected answer |
| explanation | TEXT | Why the answer is correct |

#### `quiz_attempts`
Records of student quiz submissions with scores.
| Column | Type | Notes |
|--------|------|-------|
| student_id + assignment_id | — | Multiple attempts allowed |
| answers | JSONB | Student's answers keyed by question ID |
| score / max_score | INT | Numeric score |

#### `reading_stats`
Gamification stats per student.
| Column | Type | Notes |
|--------|------|-------|
| student_id | UUID (PK) | One row per student |
| papers_read | INT | Total completed papers |
| quizzes_passed | INT | Quizzes with passing scores |
| current_streak / longest_streak | INT | Daily reading streak |
| level | INT | Computed from XP |
| xp | INT | Total experience points |
| total_sections_completed | INT | Sections read |
| checkpoints_completed | INT | Checkpoints answered |
| average_comprehension_score | REAL | Running average |

---

## 6. Backend — API Reference

All routes are prefixed with `/api/v1`. Authentication uses JWT Bearer tokens issued by Supabase.

### Auth (`/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/signup` | None | Create account (email, password, name, role). Returns JWT + profile. |
| POST | `/signin` | None | Sign in. Returns JWT + profile. |
| GET | `/me` | Any | Get current user profile. |

**How auth works:** Signup uses Supabase Admin API to create the user with `email_confirm: true`, then inserts a `user_profiles` row, then signs in to get JWT tokens. All subsequent requests carry the JWT in the Authorization header. The backend verifies tokens by fetching Supabase's JWKS (JSON Web Key Set) and decoding with RS256 — no shared secret needed.

### Papers (`/papers`) — Teacher only
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload PDF, extract text/figures, store in Supabase Storage |
| GET | `/` | List teacher's paper library |
| GET | `/{paper_id}` | Get paper details |

### Classes (`/classes`) — Teacher only
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create class (auto-generates 6-char code) |
| GET | `/` | List teacher's classes |
| GET | `/{class_id}` | Get class + enrolled students |
| DELETE | `/{class_id}/students/{student_id}` | Remove student from class |

### Assignments (`/assignments`) — Teacher only
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create assignment (triggers background AI guide generation) |
| GET | `/{assignment_id}` | Get assignment details |
| PATCH | `/{assignment_id}` | Update guide/difficulty/status (draft only) |

**Assignment lifecycle:**
1. Teacher creates assignment → status: `processing`
2. Background task calls Gemini → generates reading guide, methodology elements, critical prompts
3. Status becomes `draft` — teacher reviews/edits in AssignmentReviewPage
4. Teacher publishes → status: `published` — visible to students

### Enrollment (`/enrollment`) — Student only
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/join` | Join class by code |
| GET | `/classes` | List enrolled classes with assignments |
| DELETE | `/classes/{class_id}` | Leave a class |

### Sessions (`/sessions`) — Student only
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Start/resume reading session |
| GET | `/` | List all sessions |
| GET | `/{session_id}` | Get session with checkpoints, sowhat, jargon |
| PATCH | `/{session_id}/progress` | Update current section index |
| POST | `/{session_id}/checkpoint` | Submit checkpoint response (triggers background AI feedback) |
| POST | `/{session_id}/sowhat` | Submit "So What?" synthesis (triggers background AI feedback) |
| POST | `/{session_id}/jargon` | Look up a term (deduplicated within session) |
| POST | `/{session_id}/keyterm` | Look up key term (cached across students) |

**Preview endpoints** (teacher, stateless):
| POST | `/preview/checkpoint` | Preview AI feedback without saving |
| POST | `/preview/sowhat` | Preview So What? feedback |
| POST | `/preview/jargon` | Preview jargon explanation |
| POST | `/preview/keyterm` | Preview key term explanation |

### Dashboard (`/dashboard`) — Teacher only
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/classes/{class_id}/progress` | All students' progress on all assignments |
| GET | `/assignments/{assignment_id}/students/{student_id}/responses` | Individual student's checkpoint + So What responses |
| GET | `/assignments/{assignment_id}/insights` | AI-generated class-wide insight analysis |

### Library (`/library`) — Student only (Self-Study)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload PDF for self-study (auto-generates reading guide, auto-publishes) |
| GET | `/status/{assignment_id}` | Poll reading guide generation status |
| GET | `/search` | Search CORE API for open-access papers |
| GET | `/browse` | Browse community library (with category filter) |
| POST | `/fetch` | Fetch paper from CORE API (title-verified) |
| GET | `/categories` | List categories with papers |

### Superpowers (`/superpowers`) — Student only
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/annotations/{session_id}` | List annotations for session |
| POST | `/annotations` | Create annotation (highlight + note) |
| PATCH | `/annotations/{id}` | Update annotation |
| DELETE | `/annotations/{id}` | Delete annotation |
| POST | `/annotations/{id}/ai-prompt` | Get AI Socratic question about highlight |
| GET | `/methodology/{assignment_id}/{section_index}` | Get methodology elements for section |
| GET | `/critical-prompts/{assignment_id}/{section_index}` | Get critical thinking prompt for section |
| GET | `/quiz/{assignment_id}` | Get quiz questions |
| POST | `/quiz/{assignment_id}/generate` | Generate quiz (cached after first generation) |
| POST | `/quiz/attempt` | Submit quiz answers, get AI-graded scores |
| GET | `/stats` | Get reading stats (XP, level, streak) |
| POST | `/stats/xp` | Add XP for an action |
| GET | `/recommendations` | Get paper recommendations based on reading history |

---

## 7. Backend — AI Provider (Gemini)

File: `backend/ai_provider.py`

All AI calls go through Google Gemini 2.5 Flash with tenacity retry (3 attempts, exponential backoff 2-10s). Since the Gemini SDK is synchronous, all calls are wrapped in `asyncio.get_event_loop().run_in_executor()` to avoid blocking the FastAPI event loop.

### Functions

| Function | Input | Output | Called By |
|----------|-------|--------|-----------|
| `generate_reading_guide` | Paper text, figure count | Full guide JSON (sections, methodology, critical prompts) | Assignment creation, self-study upload |
| `generate_checkpoint_feedback` | Section title, guiding questions, student text | Socratic feedback (2-3 sentences) | Checkpoint submission |
| `generate_sowhat_feedback` | Paper title, section titles, difficulty, student text | Significance evaluation (3-4 sentences) | So What? submission |
| `generate_jargon_explanation` | Term, context snippet | Plain-English explanation (2-3 sentences) | Jargon lookup |
| `generate_class_insights` | Section title, list of student responses | JSON: common misconception + commonly grasped | Dashboard insights |
| `generate_annotation_socratic_prompt` | Highlighted text, section title | One Socratic question (10-20 words) | Annotation AI prompt |
| `generate_quiz_questions` | Paper title, sections, difficulty | Array of 5 questions (3 MC + 2 short answer) | Quiz generation |
| `grade_short_answer` | Question, correct answer, student answer | JSON: score (0-2) + explanation | Quiz attempt grading |

### Reading Guide Structure

The reading guide is the most complex AI output. It contains:

```json
{
  "sections": [
    {
      "title": "Section name from paper",
      "text": "First 400 chars verbatim",
      "guiding_questions": ["Look for: ...", "As you read, notice: ...", "Consider: ..."],
      "key_terms": ["term1", "term2"],
      "teacher_notes": "",
      "section_type": "Introduction|Methods|Results|Discussion|Other",
      "simplifications": {
        "undergrad": "...",
        "high_school": "...",
        "eli5": "..."
      }
    }
  ],
  "difficulty": "beginner|intermediate|advanced",
  "methodology_elements": [...],
  "critical_prompts": [...]
}
```

The prompt engineering ensures:
- Sections are detected from the actual paper (not generic)
- Guiding questions are framed as what to *look for* before reading (pre-reading strategy)
- Simplifications exist at 3 levels for every section
- Methodology elements only appear for Methods/Results sections
- Critical prompts use appropriate types per section type (e.g., `connection` for Introduction, `synthesis` for Discussion)

---

## 8. Backend — Core Services

### Paper Service (`services/paper_service.py`)
- **`extract_text_and_figures(pdf_bytes)`** — Uses PyMuPDF to extract all text and embedded images from a PDF. Images are base64-encoded with metadata (page number, dimensions, format). Used by both teacher upload and self-study upload.

### CORE API Service (`services/core_api.py`)
Integrates with [core.ac.uk](https://core.ac.uk) to search and fetch open-access academic papers.

- **`title_similarity(a, b)`** — Jaccard similarity on word tokens. Used to filter irrelevant search results.
- **`search_core(query, limit)`** — Searches CORE API, filters results by title similarity (minimum 0.3), returns verified results sorted by relevance.
- **`fetch_core_full_text(core_id, expected_title)`** — Fetches a single paper's full text by ID, verifies the title matches with similarity >= 0.7 before returning.

**Why title verification?** CORE search can return papers with only tangential relevance. The two-tier verification (0.3 for search results, 0.7 for full-text fetch) prevents students from getting the wrong paper's content.

### Database Client (`db.py`)
A custom async PostgREST client rather than using the `supabase-py` library directly. This was a deliberate choice:
- The Supabase Python client's key validation was causing issues
- Direct HTTP calls to PostgREST give full control over query parameters
- The `QueryBuilder` class mirrors the supabase-py interface (`.select().eq().single().execute()`) for familiarity
- Uses a shared `httpx.AsyncClient` with HTTP/2 for connection pooling
- Supports both admin (service role) and anon contexts

### Dependency Injection (`deps.py`)
- **`get_current_user`** — Verifies JWT via Supabase's JWKS endpoint (fetched once, cached in memory)
- **`require_teacher`** — Extends `get_current_user`, checks role = 'teacher'
- **`require_student`** — Extends `get_current_user`, checks role = 'student'
- **`get_optional_user`** — Returns user if authenticated, None otherwise

---

## 9. Frontend — Routing & Pages

### Route Map

```
/                                          → LandingPage (public)
/auth                                      → AuthPage (public, redirects if logged in)

/* Protected routes (require auth) */

/teacher/papers                            → PapersPage
/teacher/classes                           → ClassesPage
/teacher/classes/:classId/assign           → AssignPaperPage
/teacher/assignments/:assignmentId/review  → AssignmentReviewPage
/teacher/assignments/:assignmentId/preview → ReadingPage (previewMode=true)
/teacher/classes/:classId/dashboard        → DashboardPage
/teacher/assignments/:assignmentId/drilldown → AssignmentDrilldownPage
/teacher/assignments/:assignmentId/students/:studentId/responses → AssignmentDrilldownPage

/student/dashboard                         → StudentDashboardPage
/student/read/:assignmentId                → ReadingPage (previewMode=false)
/student/self-study                        → SelfStudyPage
```

All routes are guarded by `ProtectedRoute` which checks for an authenticated user. Individual routes additionally check `role === "teacher"` or `role === "student"` and redirect to `/auth` if the role doesn't match.

### Page Descriptions

#### LandingPage
A marketing-style landing page with hero section, "How It Works" steps, features grid, teacher/student comparison, testimonials, and CTA. No auth required.

#### AuthPage
Split-panel design with decorative left side (hidden on mobile) and form right side. Supports signup (with teacher/student role selection) and signin. Uses tab toggle between modes.

#### PapersPage (Teacher)
Upload PDFs, view paper library with text length and figure counts. Each paper can be assigned to a class.

#### ClassesPage (Teacher)
Create classes (generates unique enrollment codes), view enrolled students, remove students, navigate to assign papers or view dashboard.

#### AssignPaperPage (Teacher)
Select a paper from the library and assign it to a specific class. Triggers AI reading guide generation in the background.

#### AssignmentReviewPage (Teacher)
Review the AI-generated reading guide before publishing. Can edit guiding questions, key terms, simplifications, and difficulty. The reading guide is displayed as a JSON tree editor.

#### DashboardPage (Teacher)
View all students' progress across all assignments for a class. Shows completion status, current section, and links to individual drilldown views.

#### AssignmentDrilldownPage (Teacher)
Deep-dive into one assignment's results. Shows per-student checkpoint responses, So What responses, and AI-generated class-wide insights (common misconceptions, commonly grasped concepts).

#### StudentDashboardPage (Student)
Shows enrolled classes with their assignments. Students can join new classes with enrollment codes, start reading sessions, and see completion status.

#### SelfStudyPage (Student)
Browse the community paper library, search CORE API for papers, upload PDFs directly. Papers auto-generate reading guides and auto-publish (no teacher review step).

#### ReadingPage (Student + Teacher Preview)
The core interactive reading experience. The most complex page in the application:

- **Section navigation** — Students read one section at a time with progress tracking
- **Guiding questions** — Shown before reading (pre-reading strategy)
- **Text simplification** — Toggle between Original, Undergrad, High School, ELI5
- **Checkpoint responses** — After reading each section, students write a response; AI provides Socratic feedback
- **Jargon lookups** — Click any term to get a plain-English explanation
- **Annotations** — Highlight text, categorize, add notes, get AI Socratic prompts
- **Methodology decoder** — View identified methodology elements with explanations
- **Critical prompts** — Higher-order thinking questions per section
- **Quiz** — 5-question comprehension quiz after reading all sections
- **So What?** — Final synthesis paragraph about the paper's significance

---

## 10. Frontend — State Management

The app uses React Context for two concerns:

### AuthContext
- Stores `user` (object with access_token, role, name, user_id), `role`, and `loading` state
- Persists auth state to `localStorage` under key `readlab_user`
- On login, sets the default Axios `Authorization` header
- On logout, clears localStorage and removes the header
- Custom hook: `useAuth()` returns `{ user, role, loading, login, logout }`

### ThemeContext
- Stores `theme` ('dark' or 'light')
- Persists to `localStorage` under key `readlab_theme`
- Falls back to `prefers-color-scheme` media query on first visit
- Toggling adds/removes `dark` class on `document.documentElement`
- Custom hook: `useTheme()` returns `{ theme, setTheme, toggleTheme }`

### Data Fetching
No global state management library (no Redux, Zustand, etc.). Each page component manages its own data fetching with `useEffect` + `useState`. The `api.js` and `superpowersApi.js` modules provide thin Axios-based wrappers for all backend endpoints.

---

## 11. Frontend — Design System

### Theming Architecture
The theming system uses **CSS custom properties** (variables) for all colors and shadows, with Tailwind configured to reference these variables. This means:
- Switching themes only requires toggling the `.dark` class on the root element
- All components automatically pick up theme changes
- No Tailwind `dark:` variant needed — the CSS variables themselves change

### CSS Variables (Light → Dark)
| Variable | Light | Dark |
|----------|-------|------|
| `--color-primary` | `#4F46E5` | `#818CF8` |
| `--color-bg` | `#F8FAFC` | `#0F172A` |
| `--color-surface` | `#FFFFFF` | `#1E293B` |
| `--color-text` | `#0F172A` | `#F1F5F9` |
| `--color-border` | `#E2E8F0` | `#334155` |

### Reusable Component Classes
Defined in `@layer components` in `index.css`:
- **`.btn-primary`** — Indigo button with white text
- **`.btn-secondary`** — Muted background button
- **`.btn-outline`** — Border-only button
- **`.card`** — White surface with border and shadow
- **`.card-hover`** — Card with hover elevation
- **`.input-field`** — Form input with focus ring
- **`.badge`** — Small pill-shaped label
- **`.section-heading`** / **`.section-subheading`** — Typography utilities

### Typography
- **Font:** Plus Jakarta Sans (loaded via Google Fonts in index.html)
- **Border radius:** Custom scale — `sm: 8px`, `default: 12px`, `lg: 16px`
- **Animations:** `fade-in` and `slide-up` keyframes, `prefers-reduced-motion` respected

---

## 12. Superpowers Feature Suite

The "Superpowers" are a set of AI-enhanced features built on top of the core reading experience. They are implemented across three backend files (`ai_provider.py`, `routers/superpowers.py`) and integrated into the ReadingPage frontend.

### Annotations
Students can highlight any passage and:
- Choose a category: **important**, **confusion**, **question**, **idea**
- Add a personal note
- Request an **AI Socratic prompt** — Gemini asks a thought-provoking question about why the passage caught their attention

Annotations are stored with character-level positions (`start_char`, `end_char`) so they can be re-rendered precisely when a student returns to a section.

### Methodology Decoder
For Methods and Results sections, the AI identifies specific methodology elements:
- **Types:** study design, sample size, statistical test, control, effect size, limitation, assumption, variable, finding, key result
- Each element includes a plain-English explanation of *why it matters to students*
- Follow-up questions encourage deeper engagement

### Critical Prompts
One AI-generated thinking prompt per section:
- **Introduction** → `connection` or `evaluation`
- **Methods** → `evaluation` or `application`
- **Results** → `synthesis` or `evaluation`
- **Discussion** → `synthesis` or `application`

These prompt types are designed to scaffold higher-order thinking aligned with Bloom's taxonomy.

### Quiz System
- 5 questions per paper: 3 multiple choice (1 point each) + 2 short answer (0-2 points each)
- Questions are generated once and cached in `quiz_questions`
- Short answers are graded by Gemini on a 0-2 rubric:
  - 2: Fully correct
  - 1: Partially correct, missing one key element
  - 0: Incorrect or irrelevant
- Quiz attempts are stored in `quiz_attempts` for historical tracking

---

## 13. Self-Study Mode

Self-study allows students to read papers independently, without a teacher or class. The key differences from classroom mode:

### Library Router (`/api/v1/library`)
Replaces the teacher-only papers router for students. Students can:
1. **Upload PDFs** — Text is extracted, reading guide is generated, assignment is **auto-published** (no draft/review step)
2. **Search CORE API** — Find open-access papers by keyword with title-relevance verification
3. **Fetch from CORE** — Pull full-text papers directly into their library
4. **Browse** — Filter the community library by category

### Self-Study Assignments
- `class_id` is `NULL` (not linked to any class)
- Status goes directly from `processing` to `published` (skips `draft`)
- Only the student who created the self-study assignment can see it
- The reading experience is identical to classroom assignments

### Paper Recommendations
The `/superpowers/recommendations` endpoint suggests papers based on:
- Categories the student has previously read
- Papers not yet completed
- Falls back to "Start your reading journey" for new students

---

## 14. Gamification System

The gamification system motivates students to read consistently.

### XP Actions
| Action | XP Earned |
|--------|-----------|
| Complete a section | 5 |
| Submit a checkpoint | 10 |
| Submit So What? | 15 |
| Daily bonus (first action of the day) | 20 |
| Correct quiz answer | 25 |

### Level System
| Level | Title | XP Threshold |
|-------|-------|-------------|
| 1 | Novice Reader | 0 |
| 2 | Apprentice | 100 |
| 3 | Skilled Reader | 250 |
| 4 | Expert Reader | 500 |
| 5 | Scholar | 1000 |

### Streaks
- **Current streak** — Increments when the student reads on consecutive days
- **Longest streak** — Historical best
- Streak resets to 1 if a day is missed
- Daily bonus XP (20) is awarded automatically on the first action of a new day

### Streak Widget (Layout.jsx)
Displayed in the navbar for students, showing:
- Fire icon + current streak count
- Lightning icon + total XP
- Award icon + current level

---

## 15. Testing

### Backend Tests (pytest)
12 test files in `backend/tests/`, each corresponding to a router or service:
- `conftest.py` — Shared fixtures including mock database (`get_db` override) and mock AI provider
- `test_auth.py` — Signup/signin flows
- `test_papers.py` — PDF upload, library listing
- `test_classes.py` — Class CRUD, code generation
- `test_assignments.py` — Assignment creation, guide generation
- `test_enrollment.py` — Join/leave classes
- `test_sessions.py` — Session lifecycle, checkpoints, jargon
- `test_dashboard.py` — Progress tracking, insights
- `test_library.py` — Self-study upload, CORE search
- `test_core_api.py` — Title similarity, search, fetch verification
- `test_ai_provider.py` — AI function output validation
- `test_superpowers.py` — Annotations, quiz, XP, stats
- `test_db.py` — QueryBuilder, SupabaseDB unit tests

### Frontend Tests (Playwright)
13 test files in `frontend/tests/`:
- **Core flows:** `landing.spec.js`, `auth.spec.js`, `routing.spec.js`, `theme.spec.js`, `teacher.spec.js`, `student.spec.js`
- **Extended tests:** `*-extended.spec.js` variants with deeper scenario coverage
- **Accessibility:** `gap-audit.spec.js` for testing gaps and edge cases
- **Helpers:** `helpers.js` with shared utilities (mock auth, navigation helpers)

---

## 16. Configuration & Deployment

### Environment Variables (`.env`)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...
GEMINI_API_KEY=AIza...
CORE_API_KEY=...
ALLOWED_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
ENVIRONMENT=development
```

### Running Locally

**Backend:**
```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

### Build
```bash
cd frontend && npm run build
```

---

## 17. Design Decisions & Rationale

### Why Supabase over custom backend auth?
Supabase provides battle-tested authentication (email/password, JWT, row-level security) out of the box. The RLS policies in `supabase_schema.sql` enforce data access rules at the database level, meaning even if the API has a bug, students can't read other students' data or teachers can't modify other teachers' classes.

### Why async PostgREST instead of supabase-py?
The Python Supabase client's key validation caused issues with the project's Supabase configuration. The custom `db.py` QueryBuilder makes direct HTTP calls to PostgREST, giving full control while maintaining the familiar `.select().eq().execute()` interface.

### Why background tasks for AI calls?
AI generation (reading guides, checkpoint feedback) takes 5-30 seconds. Using FastAPI's `BackgroundTasks`, the API returns immediately with a `feedback_pending: true` flag, and the frontend polls for results. This keeps the API responsive.

### Why Gemini 2.5 Flash?
Chosen for its balance of speed, cost, and quality. The structured JSON output mode (`response_mime_type="application/json"`) eliminates parsing issues. Temperature is kept low (0.2-0.5) for consistent, factual outputs.

### Why CSS variables for theming instead of Tailwind dark: variants?
CSS variables allow a single Tailwind class (e.g., `text-primary`) to automatically change colors when the theme switches, rather than needing `text-indigo-600 dark:text-indigo-400` everywhere. This reduces code duplication and makes theme changes instant without re-rendering.

### Why section-by-section reading?
Research in reading comprehension shows that pre-reading questions (what to look for) dramatically improve comprehension. By breaking papers into sections and presenting guiding questions *before* each section, students read with purpose rather than passively.

### Why Socratic feedback instead of direct answers?
The checkpoint feedback is explicitly designed to never give away answers. Instead, it acknowledges what the student got right and points to what they missed. This is based on the Socratic method — guiding students to discover understanding rather than being told.

### Why Jaccard similarity for CORE API filtering?
CORE search returns results by keyword match, which can be noisy. Jaccard similarity on word tokens is fast, requires no ML model, and effectively filters out papers where only one or two words matched. The two-tier system (0.3 for search, 0.7 for fetch) balances recall and precision.

### Why gamification?
Reading research papers is inherently difficult and not immediately rewarding for high school students. The XP/streak/level system provides short-term motivational hooks while students build the long-term skill of research literacy. The daily bonus (20 XP) specifically encourages consistent engagement.
