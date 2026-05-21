# ReadLabs — Complete Feature & Verification Guide

> **Purpose:** This document catalogs every feature, every user workflow, and provides step-by-step manual verification procedures for final pre-launch testing.
> **Last Updated:** 2026-04-06
> **Status:** Final pre-launch verification

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Environment Setup](#2-environment-setup)
3. [Feature Inventory](#3-feature-inventory)
4. [Teacher Workflows](#4-teacher-workflows)
5. [Student Workflows](#5-student-workflows)
6. [Superpowers Features](#6-superpowers-features)
7. [Self-Study Mode](#7-self-study-mode)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Database Schema](#9-database-schema)
10. [API Endpoint Reference](#10-api-endpoint-reference)
11. [Manual Verification Checklist](#11-manual-verification-checklist)
12. [Known Limitations & Future Roadmap](#12-known-limitations--future-roadmap)

---

## 1. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        ReadLabs System                          │
├──────────────┬──────────────────────┬───────────────────────────┤
│   Frontend   │      Backend         │      External Services    │
│  React 19    │   FastAPI (Python)   │   Supabase (DB + Auth)    │
│  Tailwind    │   Pydantic           │   Google Gemini 2.5 Flash │
│  React Router│   httpx              │   Supabase Storage (PDFs) │
│  Axios       │   PyMuPDF            │   CORE API (Academic)     │
│  Supabase JS │   tenacity (retry)   │                           │
└──────────────┴──────────────────────┴───────────────────────────┘
```

### Key Architectural Decisions
- **Pre-compute Once, Serve Many:** AI reading guides are generated once per assignment (not per student), reducing API costs
- **Socratic AI:** The AI never gives answers — it guides students to build understanding through questions
- **Section-Locked Progression:** Students must read sections in order
- **Role-Based Routing:** Teachers and students see completely different interfaces
- **Background Tasks:** Expensive AI operations run as FastAPI BackgroundTasks

### Tech Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + React Router 6 | SPA with role-based routing |
| Styling | Tailwind CSS 3 | Utility-first CSS with CSS variables for theming |
| State | React Context | Auth state, theme state |
| HTTP | Axios | API calls with JWT interceptors |
| Backend | FastAPI 0.115 | Async Python REST API |
| AI | Google Gemini 2.5 Flash | All AI features (guides, feedback, quizzes) |
| Database | Supabase (PostgreSQL) | Data storage with Row Level Security |
| Auth | Supabase Auth | JWT authentication with teacher/student roles |
| Storage | Supabase Storage | PDF file storage |
| PDF | PyMuPDF | Text and figure extraction from PDFs |
| External | CORE API | Academic paper search and full-text fetch |

---

## 2. Environment Setup

### Required Environment Variables

**Backend (.env):**
```env
SUPABASE_URL=<your_supabase_project_url>
SUPABASE_ANON_KEY=<your_anon_public_key>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
SUPABASE_JWT_SECRET=<your_jwt_secret>
GEMINI_API_KEY=<your_gemini_api_key>
```

**Frontend (.env):**
```env
REACT_APP_SUPABASE_URL=<your_supabase_project_url>
REACT_APP_SUPABASE_ANON_KEY=<your_anon_public_key>
REACT_APP_API_URL=http://localhost:8000/api/v1
```

### Startup Commands
```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm start    # runs on port 3000
```

### Database Setup
Run `supabase_schema.sql` in the Supabase SQL Editor. This creates:
- 14 tables (6 core + 8 superpowers)
- Row Level Security policies on every table
- Storage bucket for PDF uploads
- Indexes for annotations

---

## 3. Feature Inventory

### Core Features (MVP)

| # | Feature | Status | Backend | Frontend |
|---|---------|--------|---------|----------|
| 1 | User Authentication (signup/signin) | COMPLETE | auth.py | AuthPage.jsx |
| 2 | Role Selection (teacher/student) | COMPLETE | auth.py | AuthPage.jsx |
| 3 | PDF Upload with Text Extraction | COMPLETE | papers.py | PapersPage.jsx |
| 4 | Class Creation with Enrollment Codes | COMPLETE | classes.py | ClassesPage.jsx |
| 5 | Class Enrollment via Codes | COMPLETE | enrollment.py | StudentDashboardPage.jsx |
| 6 | Paper Assignment to Classes | COMPLETE | assignments.py | AssignPaperPage.jsx |
| 7 | AI Reading Guide Generation | COMPLETE | ai_provider.py | AssignmentReviewPage.jsx |
| 8 | Reading Guide Editing & Publishing | COMPLETE | assignments.py | AssignmentReviewPage.jsx |
| 9 | Student Reading Sessions | COMPLETE | sessions.py | ReadingPage.jsx |
| 10 | Section-Locked Progression | COMPLETE | sessions.py | ReadingPage.jsx |
| 11 | AI Checkpoint Feedback (Socratic) | COMPLETE | ai_provider.py | ReadingPage.jsx |
| 12 | "So What?" Synthesis Section | COMPLETE | ai_provider.py | ReadingPage.jsx |
| 13 | Jargon/Term Lookup | COMPLETE | ai_provider.py | ReadingPage.jsx |
| 14 | Teacher Dashboard (Class Progress) | COMPLETE | dashboard.py | DashboardPage.jsx |
| 15 | Student Response Drilldown | COMPLETE | dashboard.py | AssignmentDrilldownPage.jsx |
| 16 | AI Class Insights Generation | COMPLETE | ai_provider.py | AssignmentDrilldownPage.jsx |
| 17 | Landing Page | COMPLETE | N/A | LandingPage.jsx |
| 18 | Dark/Light Theme | COMPLETE | N/A | ThemeContext.jsx |
| 19 | Responsive Design | COMPLETE | N/A | All pages |

### Superpowers Features

| # | Feature | Status | Backend | Frontend |
|---|---------|--------|---------|----------|
| 20 | ELI5 Text Simplification | COMPLETE | ai_provider.py | ReadingPage.jsx |
| 21 | Structure Coach (Section Types) | COMPLETE | ai_provider.py | ReadingPage.jsx |
| 22 | Methodology Decoder | COMPLETE | superpowers.py | ReadingPage.jsx |
| 23 | Critical Thinking Prompts | COMPLETE | superpowers.py | ReadingPage.jsx |
| 24 | Annotation System (Highlight + Notes) | COMPLETE | superpowers.py | ReadingPage.jsx |
| 25 | AI Prompts for Annotations | COMPLETE | superpowers.py | ReadingPage.jsx |
| 26 | Comprehension Quiz (5 Questions) | COMPLETE | superpowers.py | ReadingPage.jsx |
| 27 | Quiz Auto-Generation (3 MCQ + 2 Short) | COMPLETE | superpowers.py | ReadingPage.jsx |
| 28 | Short Answer AI Grading (0-2 Scale) | COMPLETE | ai_provider.py | ReadingPage.jsx |
| 29 | XP System (5 Actions) | COMPLETE | superpowers.py | ReadingPage.jsx |
| 30 | Level System (5 Levels) | COMPLETE | superpowers.py | Layout.jsx |
| 31 | Reading Streaks | COMPLETE | superpowers.py | Layout.jsx |
| 32 | Streak Widget in Sidebar | COMPLETE | superpowers.py | Layout.jsx |
| 33 | Paper Recommendations | COMPLETE | superpowers.py | SelfStudyPage.jsx |
| 34 | Self-Study Paper Upload | COMPLETE | library.py | SelfStudyPage.jsx |
| 35 | CORE API Paper Search | COMPLETE | library.py | SelfStudyPage.jsx |
| 36 | CORE API Paper Fetch | COMPLETE | library.py | SelfStudyPage.jsx |
| 37 | Community Paper Library | COMPLETE | library.py | SelfStudyPage.jsx |
| 38 | Teacher Assignment Preview | COMPLETE | sessions.py | AssignmentReviewPage.jsx |

---

## 4. Teacher Workflows

### Workflow T1: Account Creation
1. Navigate to `/auth`
2. Enter name, email, password
3. Select **Teacher** role
4. Click "Create Account"
5. Verify: redirected to teacher dashboard
6. Verify: profile created in `user_profiles` table with `role='teacher'`

### Workflow T2: Paper Upload
1. Navigate to `/teacher/papers`
2. Enter paper title
3. Select PDF file (max 20MB)
4. Click "Upload"
5. Verify: paper appears in list with status indicators
6. Verify: `extracted_text` and `figures` populated after processing
7. Verify: PDF stored in Supabase Storage bucket `papers`

### Workflow T3: Class Creation
1. Navigate to `/teacher/classes`
2. Enter class name
3. Click "Create Class"
4. Verify: class appears in list with a unique 6-digit class code
5. Verify: class code is unique across all classes

### Workflow T4: Paper Assignment
1. Navigate to `/teacher/classes`
2. Click on a class → "Assign Paper"
3. Select a paper from the dropdown
4. Click "Create Assignment"
5. Verify: assignment created with `status='processing'`
6. Wait for background AI processing to complete
7. Verify: assignment status changes to `status='draft'`
8. Verify: reading guide JSON stored in `assignments.reading_guide`

### Workflow T5: Reading Guide Review & Edit
1. Navigate to the assignment review page
2. Verify: reading guide shows all detected sections
3. Verify: each section has guiding questions, key terms, teacher notes
4. Edit guiding questions or add teacher notes
5. Select difficulty level (beginner/intermediate/advanced)
6. Click "Save Draft"
7. Verify: changes saved to database

### Workflow T6: Assignment Publishing
1. On the assignment review page, click "Publish"
2. Verify: assignment status changes to `published`
3. Verify: students in the class can now see the assignment
4. Verify: assignment appears on student dashboards

### Workflow T7: Progress Monitoring
1. Navigate to `/teacher/classes/{classId}/dashboard`
2. Verify: student list shows with completion status
3. Verify: progress bars show section completion percentages
4. Click on a student to drill down
5. Verify: individual checkpoint responses visible
6. Verify: "So What?" response visible
7. Verify: AI feedback on each response visible

### Workflow T8: Class Insights Generation
1. On the assignment drilldown page
2. Click "Generate Class Insights"
3. Wait for AI analysis to complete
4. Verify: insights show common misconceptions
5. Verify: insights show commonly grasped concepts
6. Verify: student count matches enrolled students

### Workflow T9: Assignment Preview (as Student)
1. On the assignment review page, click "Preview"
2. Verify: reading page opens in preview mode
3. Verify: checkpoint and So What? work with AI feedback
4. Verify: jargon lookup works
5. Verify: no data is saved to database (preview mode)

### Workflow T10: Student Management
1. Navigate to `/teacher/classes`
2. Click on a class
3. Verify: enrolled students listed with names
4. Click "Remove" on a student
5. Verify: student removed from class
6. Verify: student can no longer see class assignments

---

## 5. Student Workflows

### Workflow S1: Account Creation
1. Navigate to `/auth`
2. Enter name, email, password
3. Select **Student** role
4. Click "Create Account"
5. Verify: redirected to student dashboard
6. Verify: profile created with `role='student'`

### Workflow S2: Class Enrollment
1. Navigate to `/student/dashboard`
2. Enter a class code provided by teacher
3. Click "Join Class"
4. Verify: class appears in enrolled classes list
5. Verify: assignments for the class are visible

### Workflow S3: Start Reading
1. Navigate to `/student/dashboard`
2. Click "Start Reading" on an assignment
3. Verify: reading page loads with paper sections
4. Verify: section sidebar shows all sections
5. Verify: guiding questions appear for current section
6. Verify: key terms are highlighted in the text
7. Verify: progress starts at section 0

### Workflow S4: Checkpoint Response
1. Read the section text and guiding questions
2. Type a response in the checkpoint text area
3. Click "Submit"
4. Verify: response saved to `checkpoint_responses`
5. Wait for AI feedback (polling)
6. Verify: AI feedback appears — acknowledges correct, points to missed
7. Verify: AI does NOT give away answers (Socratic method)

### Workflow S5: Section Progression
1. After receiving AI feedback on a checkpoint
2. Click "Next Section"
3. Verify: progress advances to next section
4. Verify: previous section shows completed in sidebar
5. Verify: session `current_section_index` updated
6. Verify: XP awarded for section completion

### Workflow S6: So What? Synthesis
1. Complete all sections
2. "So What?" section appears in sidebar
3. Write a paragraph about the paper's significance
4. Click "Submit"
5. Verify: AI feedback evaluates the significance claim
6. Verify: XP awarded for So What? completion

### Workflow S7: Jargon Lookup
1. While reading, click on a highlighted key term
2. Verify: floating tooltip appears with term
3. Verify: AI-generated explanation appears (plain English)
4. Verify: explanation saved to `jargon_lookups`
5. Alternative: use manual term search box

### Workflow S8: Complete Reading Session
1. Complete all sections + So What?
2. Verify: session status changes to `completed`
3. Verify: `completed_at` timestamp set
4. Verify: reading stats updated

---

## 6. Superpowers Features

### Workflow SP1: ELI5 Text Simplification
1. Open a reading page with a generated reading guide
2. Locate "Reading level:" toggle above the paper text
3. Verify: four buttons — Original, Undergrad, High School, ELI5
4. Click "ELI5"
5. Verify: text changes to simplified version with analogies
6. Click "High School"
7. Verify: text changes to simpler language (key concepts only)
8. Click "Undergrad"
9. Verify: technical terms kept but simpler sentences
10. Click "Original"
11. Verify: original paper text restored
12. Advance to next section
13. Verify: reading level resets to "Original"

### Workflow SP2: Structure Coach
1. Open a reading page
2. Verify: section sidebar shows letter badges (I/M/R/D/O)
3. Verify: badge colors match section types:
   - Blue = Introduction
   - Purple = Methods
   - Green = Results
   - Amber = Discussion
   - Gray = Other
4. Scroll to bottom of sidebar
5. Verify: "Structure Guide" panel shows section type summary
6. Verify: completion counts per type (e.g., "2/3 Methods")
7. Click a section type in the Structure Guide
8. Verify: tooltip shows reading tips for that section type

### Workflow SP3: Methodology Decoder
1. Navigate to a Methods or Results section
2. Verify: "Decode Methods" link appears below paper text
3. Click "Decode Methods"
4. Verify: methodology elements load (loading indicator)
5. Verify: elements show type badges (study_design, sample_size, etc.)
6. Verify: each element has label and description
7. Click "Expert" toggle
8. Verify: detailed explanations and follow-up questions appear
9. Click "Expert" again
10. Verify: expert details hidden, only labels/descriptions shown
11. Click close (X)
12. Verify: methodology panel closes

### Workflow SP4: Critical Thinking Prompts
1. Complete a checkpoint response and receive AI feedback
2. Verify: "Critical thinking prompt" link appears after feedback
3. Click the link
4. Verify: prompt panel opens with:
   - "Critical Thinking" header
   - A question text
   - Prompt type badge (evaluation, connection, synthesis, application)
5. Click close (X)
6. Verify: panel closes
7. Advance to next section
8. Verify: critical prompt resets

### Workflow SP5: Annotation System
1. Open a reading page (not in preview mode)
2. Select/highlight a passage of text in the paper text area
3. Verify: floating tooltip appears with 4 color circles:
   - Yellow = important
   - Orange = confusion
   - Blue = question
   - Green = idea
4. Verify: "Look up" button for jargon lookup
5. Click a color circle (e.g., yellow for "important")
6. Verify: toast notification "Saved as 'important'"
7. Verify: selection cleared
8. Verify: annotation count in header button updates

### Workflow SP6: Annotation Sidebar
1. Click "Annotations (N)" button in the page header
2. Verify: right sidebar opens showing annotations
3. Verify: each annotation shows:
   - Color dot matching category
   - Highlighted text in quotes
   - Note text (if any)
4. Click "Ask AI" on an annotation
5. Verify: Socratic question appears (italic indigo text)
6. Verify: question is 10-20 words, reflective
7. Click "Delete" on an annotation
8. Verify: annotation removed
9. Click close (X) on sidebar
10. Verify: sidebar closes

### Workflow SP7: Comprehension Quiz
1. Complete all sections and the So What? response
2. Verify: "Quiz" button appears in sidebar after So What?
3. Click "Quiz" in sidebar
4. Verify: quiz panel shows "Test Your Understanding"
5. Click "Generate Quiz"
6. Wait for quiz generation (loading indicator)
7. Verify: 5 questions appear (3 multiple choice + 2 short answer)
8. Answer all questions:
   - MCQ: select a radio button option
   - Short answer: type in text area
9. Verify: "Submit Quiz" button enables when all answered
10. Click "Submit Quiz"
11. Wait for grading
12. Verify: results screen shows:
    - Percentage score
    - Points (score/max_score)
    - Each question with correct/incorrect indicator
    - Correct answer for each question
    - AI explanation for each question

### Workflow SP8: XP & Streaks
1. Log in as a student
2. Verify: streak widget appears in sidebar (below nav)
3. Verify: shows current streak (fire emoji + "N day streak")
4. Verify: shows level badge (Lv.1 through Lv.5)
5. Verify: shows level title (Novice Reader, Apprentice, etc.)
6. Verify: XP progress bar fills proportionally
7. Verify: XP number displayed below bar

**XP Actions:**
| Action | XP Earned | When |
|--------|-----------|------|
| Complete a section | +5 | Click "Next Section" |
| Submit checkpoint | +10 | Click "Submit" on checkpoint |
| Submit So What? | +15 | Click "Submit" on So What? |
| First action of the day | +20 | Automatic (daily bonus) |
| Correct quiz answer | +25 | Each correct answer in quiz |

**Level Thresholds:**
| Level | Title | XP Required |
|-------|-------|-------------|
| 1 | Novice Reader | 0 |
| 2 | Apprentice | 100 |
| 3 | Skilled Reader | 250 |
| 4 | Expert Reader | 500 |
| 5 | Scholar | 1000+ |

**Streak Logic:**
- Reading on consecutive days → streak increments
- Missing a day → streak resets to 1
- `longest_streak` tracks all-time best

---

## 7. Self-Study Mode

### Workflow SS1: Self-Study Paper Upload
1. Navigate to `/student/self-study`
2. Enter paper title and upload a PDF
3. Click "Upload"
4. Verify: paper uploaded with `is_self_study=true`
5. Verify: background task generates reading guide
6. Verify: assignment auto-published (status='published', class_id=NULL)
7. Click "Start Reading" when ready
8. Verify: full reading experience available

### Workflow SS2: CORE API Paper Search
1. Navigate to `/student/self-study`
2. Use the search bar to search for academic papers
3. Verify: results appear from CORE API
4. Verify: each result shows title, authors, year, category
5. Click "Fetch & Read" on a result
6. Verify: paper fetched from CORE API
7. Verify: assignment created with reading guide
8. Verify: navigated to reading page

### Workflow SS3: Community Library Browse
1. Navigate to `/student/self-study`
2. Verify: category filter tabs appear
3. Click a category
4. Verify: papers filtered by category
5. Verify: papers uploaded by other users visible
6. Click "Start Reading" on any paper
7. Verify: reading session starts

### Workflow SS4: Paper Recommendations
1. Navigate to `/student/self-study`
2. Verify: "Recommended for You" section appears at top
3. First-time users: see "Start your reading journey" reason
4. After completing papers: see category-based recommendations
5. Verify: each recommendation shows:
   - Paper title
   - Authors
   - Category badge
   - Recommendation reason
6. Click "Start Reading" on a recommendation
7. Verify: paper assignment created and reading begins

---

## 8. Authentication & Authorization

### Auth Flow
1. **Signup:** Email + password → Supabase Auth → `user_profiles` insert with role
2. **Signin:** Email + password → Supabase Auth → JWT token returned
3. **Token Usage:** JWT attached to all API requests via Axios interceptor
4. **Token Verification:** Backend verifies JWT via Supabase JWKS endpoint

### Role-Based Access
| Role | Can Access |
|------|-----------|
| Teacher | `/teacher/*` routes, paper upload, class management, assignment review, dashboard |
| Student | `/student/*` routes, class enrollment, reading sessions, self-study, superpowers |
| Unauthenticated | `/` (landing), `/auth` (login/signup) |

### Database Security
- Row Level Security (RLS) on every table
- Students can only see their own data
- Teachers can only see data for their own classes
- Service role key used only in background tasks

---

## 9. Database Schema

### Core Tables
```
user_profiles       — user_id (PK), name, role, created_at
classes             — id (PK), teacher_id (FK), name, class_code (unique), created_at
class_enrollments   — class_id + student_id (composite PK), student_name, enrolled_at
papers              — id (PK), title, extracted_text, figures (jsonb), pdf_path, uploaded_by (FK), is_self_study, category, core_id, authors, year_published, source
assignments         — id (PK), class_id (FK, nullable), paper_id (FK), reading_guide (jsonb), status, difficulty, created_at
student_sessions    — id (PK), student_id (FK), assignment_id (FK), status, current_section_index, started_at, completed_at
checkpoint_responses — id (PK), session_id (FK), section_index, student_text, ai_feedback, submitted_at
sowhat_responses    — id (PK), session_id (FK), student_text, ai_feedback, submitted_at
jargon_lookups      — id (PK), session_id (FK), term, explanation, created_at
assignment_insights — id (PK), assignment_id (FK), insights (jsonb), generated_at
```

### Superpowers Tables
```
annotations         — id (PK), session_id (FK), section_index, start_char, end_char, highlight_text, note_text, color, category, ai_prompt_shown
methodology_elements — id (PK), assignment_id (FK), section_index, element_type, label, description, explanation, follow_up_questions (jsonb), difficulty
critical_prompts    — id (PK), assignment_id (FK), section_index, prompt_text, prompt_type, ai_followup
quiz_questions      — id (PK), assignment_id (FK), question_text, question_type, options (jsonb), correct_answer, explanation
quiz_attempts       — id (PK), student_id, assignment_id (FK), answers (jsonb), score, max_score
reading_stats       — student_id (PK), papers_read, quizzes_passed, current_streak, longest_streak, last_read_at, level, xp, total_sections_completed, checkpoints_completed, average_comprehension_score
```

---

## 10. API Endpoint Reference

### Authentication (`/api/v1/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/signup` | None | Register teacher or student |
| POST | `/signin` | None | Login, returns JWT |
| GET | `/me` | JWT | Get current user profile |

### Papers (`/api/v1/papers`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/upload` | Teacher | Upload PDF, extract text |
| GET | `/` | Teacher | List uploaded papers |
| GET | `/{paper_id}` | Teacher | Get paper details |

### Classes (`/api/v1/classes`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Teacher | Create class with auto-generated code |
| GET | `/` | Teacher | List teacher's classes |
| GET | `/{class_id}` | Teacher | Get class with enrolled students |
| DELETE | `/{class_id}/students/{student_id}` | Teacher | Remove student from class |

### Enrollment (`/api/v1/enrollment`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/join` | Student | Join class with code |
| GET | `/classes` | Student | List enrolled classes with assignments |
| DELETE | `/classes/{class_id}` | Student | Leave a class |

### Assignments (`/api/v1/assignments`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Teacher | Create assignment (triggers AI guide generation) |
| GET | `/{assignment_id}` | Teacher | Get assignment with reading guide |
| PATCH | `/{assignment_id}` | Teacher | Update guide/difficulty/publish |

### Sessions (`/api/v1/sessions`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Student | Start reading session |
| GET | `/` | Student | List user's sessions |
| GET | `/{session_id}` | Student | Get session with checkpoints |
| PATCH | `/{session_id}/progress` | Student | Update current section |
| POST | `/{session_id}/checkpoint` | Student | Submit checkpoint response |
| POST | `/{session_id}/sowhat` | Student | Submit "So What?" synthesis |
| POST | `/{session_id}/jargon` | Student | Look up term (AI explanation) |
| POST | `/{session_id}/keyterm` | Student | Look up key term (cached) |
| POST | `/preview/checkpoint` | Teacher | Preview checkpoint AI feedback |
| POST | `/preview/sowhat` | Teacher | Preview So What? AI feedback |
| POST | `/preview/jargon` | Teacher | Preview jargon explanation |
| POST | `/preview/keyterm` | Teacher | Preview key term explanation |

### Dashboard (`/api/v1/dashboard`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/classes/{class_id}/progress` | Teacher | Class progress overview |
| GET | `/assignments/{assignment_id}/students/{student_id}/responses` | Teacher | Student responses |
| GET | `/assignments/{assignment_id}/insights` | Teacher | AI-generated class insights |

### Library (`/api/v1/library`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/upload` | Student | Upload paper for self-study |
| GET | `/status/{assignment_id}` | Student | Check guide generation status |
| GET | `/search` | Student | Search CORE API papers |
| GET | `/browse` | Student | Browse community library |
| POST | `/fetch` | Student | Fetch paper from CORE API |
| GET | `/categories` | Student | List paper categories |

### Superpowers (`/api/v1/superpowers`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/annotations/{session_id}` | Student | List annotations for session |
| POST | `/annotations` | Student | Create annotation |
| PATCH | `/annotations/{annotation_id}` | Student | Update annotation |
| DELETE | `/annotations/{annotation_id}` | Student | Delete annotation |
| POST | `/annotations/{annotation_id}/ai-prompt` | Student | Get AI Socratic prompt |
| GET | `/methodology/{assignment_id}/{section_index}` | Student | Get methodology elements |
| GET | `/critical-prompts/{assignment_id}/{section_index}` | Student | Get critical prompt |
| GET | `/quiz/{assignment_id}` | Student | Get quiz questions |
| POST | `/quiz/{assignment_id}/generate` | Student | Generate quiz (5 questions) |
| POST | `/quiz/attempt` | Student | Submit quiz answers for grading |
| GET | `/stats` | Student | Get reading stats (XP, streaks) |
| POST | `/stats/xp` | Student | Award XP for an action |
| GET | `/recommendations` | Student | Get paper recommendations |

---

## 11. Manual Verification Checklist

### Pre-Test Setup
- [ ] Backend running on `http://localhost:8000`
- [ ] Frontend running on `http://localhost:3000`
- [ ] Supabase instance accessible
- [ ] Database schema applied (all 14 tables created)
- [ ] Storage bucket `papers` exists
- [ ] `.env` files configured with valid API keys
- [ ] Gemini API key valid and has quota
- [ ] CORE API key configured (for self-study search)

---

### AUTHENTICATION TESTS

#### A1: Teacher Signup
- [ ] Navigate to `/auth`
- [ ] Enter name, email, password
- [ ] Select "Teacher"
- [ ] Click "Create Account"
- [ ] **PASS:** Redirected to `/teacher/papers`
- [ ] **PASS:** No error toast

#### A2: Student Signup
- [ ] Navigate to `/auth`
- [ ] Enter name, email, password
- [ ] Select "Student"
- [ ] Click "Create Account"
- [ ] **PASS:** Redirected to `/student/dashboard`
- [ ] **PASS:** No error toast

#### A3: Login/Logout
- [ ] Log out from current session
- [ ] Navigate to `/auth`
- [ ] Enter credentials and sign in
- [ ] **PASS:** Redirected to correct dashboard for role
- [ ] Click "Sign out" in sidebar
- [ ] **PASS:** Redirected to `/auth`

#### A4: Route Protection
- [ ] While logged out, navigate to `/teacher/papers`
- [ ] **PASS:** Redirected to `/auth`
- [ ] While logged in as student, navigate to `/teacher/papers`
- [ ] **PASS:** Access denied or redirected
- [ ] While logged in as teacher, navigate to `/student/dashboard`
- [ ] **PASS:** Access denied or redirected

#### A5: Theme Toggle
- [ ] Click theme toggle in sidebar/header
- [ ] **PASS:** Switches between dark and light mode
- [ ] Refresh page
- [ ] **PASS:** Theme preference persists
- [ ] **PASS:** CSS variables change (colors, shadows update)

---

### TEACHER WORKFLOW TESTS

#### T1: Upload a Paper
- [ ] Log in as teacher
- [ ] Navigate to `/teacher/papers`
- [ ] Enter title: "Test Paper - Effects of Sleep on Memory"
- [ ] Upload a PDF file (any research paper)
- [ ] Click "Upload"
- [ ] **PASS:** Paper appears in list with title
- [ ] **PASS:** Character count and figure count displayed after processing
- [ ] **FAIL CONDITION:** Error if file > 20MB

#### T2: Create a Class
- [ ] Navigate to `/teacher/classes`
- [ ] Enter class name: "Biology 101 - Spring 2026"
- [ ] Click "Create Class"
- [ ] **PASS:** Class appears with a 6-digit code
- [ ] **PASS:** Code is visible and copyable

#### T3: Assign Paper to Class
- [ ] Click on the created class
- [ ] Click "Assign Paper"
- [ ] Select the uploaded paper
- [ ] Click "Create Assignment"
- [ ] **PASS:** Assignment created, navigated to review page
- [ ] **PASS:** Status shows "Processing" initially

#### T4: Review & Edit Reading Guide
- [ ] Wait for AI processing to complete (may take 30-60 seconds)
- [ ] Refresh page if needed
- [ ] **PASS:** Reading guide sections appear with titles
- [ ] **PASS:** Each section has 3 guiding questions
- [ ] **PASS:** Key terms listed per section
- [ ] **PASS:** Teacher notes field is editable
- [ ] **PASS:** Section type badges visible (Introduction, Methods, etc.)
- [ ] Edit a guiding question
- [ ] Add teacher notes
- [ **PASS:** Save succeeds

#### T5: Publish Assignment
- [ ] Select difficulty level
- [ ] Click "Publish"
- [ ] **PASS:** Status changes to "Published"
- [ ] **PASS:** Cannot edit after publishing (error shown)

#### T6: Preview Assignment as Student
- [ ] Click "Preview" button
- [ ] **PASS:** Reading page opens
- [ ] Complete a checkpoint
- [ ] **PASS:** AI feedback appears
- [ ] Look up a jargon term
- [ ] **PASS:** Term explanation appears
- [ ] **PASS:** No data saved (preview mode)

---

### STUDENT WORKFLOW TESTS

#### S1: Join a Class
- [ ] Log in as student
- [ ] Navigate to `/student/dashboard`
- [ ] Enter the 6-digit class code from teacher
- [ ] Click "Join Class"
- [ ] **PASS:** Class appears in enrolled classes
- [ ] **PASS:** Published assignments visible

#### S2: Start Reading
- [ ] Click "Start Reading" on an assignment
- [ ] **PASS:** Reading page loads
- [ ] **PASS:** Paper text visible in sections
- [ ] **PASS:** Guiding questions shown above text
- [ ] **PASS:** Key terms highlighted in blue
- [ ] **PASS:** Section sidebar on left shows all sections
- [ ] **PASS:** Current section highlighted

#### S3: Checkpoint Response
- [ ] Read the section text
- [ ] Type a response about what you understood
- [ ] Click "Submit"
- [ ] **PASS:** Response saved (spinner/loading indicator)
- [ ] Wait up to 30 seconds for AI feedback
- [ ] **PASS:** AI feedback appears
- [ ] **PASS:** Feedback acknowledges something correct
- [ ] **PASS:** Feedback points to something missed
- [ ] **PASS:** Feedback does NOT give away the answer

#### S4: Jargon Lookup
- [ ] Click on a highlighted key term in the text
- [ ] **PASS:** Floating tooltip appears with term
- [ ] Wait for AI explanation
- [ ] **PASS:** Explanation in plain English (2-3 sentences)
- [ ] Try manual lookup: type a term in the search box
- [ ] **PASS:** Manual lookup also works

#### S5: Section Progression
- [ ] Click "Next Section" after checkpoint feedback
- [ ] **PASS:** Moves to next section
- [ ] **PASS:** Previous section shows checkmark/completed in sidebar
- [ ] **PASS:** New guiding questions appear
- [ ] **PASS:** New key terms highlighted

#### S6: Complete All Sections
- [ ] Submit checkpoints for all sections
- [ ] **PASS:** "So What?" section appears at end of sidebar
- [ ] Write significance paragraph
- [ ] Click "Submit"
- [ ] **PASS:** AI feedback evaluates the claim
- [ ] **PASS:** Session marked as completed

---

### SUPERPOWERS TESTS

#### SP1: ELI5 Text Simplification
- [ ] On a reading page, find "Reading level:" above paper text
- [ ] **PASS:** Four buttons visible: Original, Undergrad, High School, ELI5
- [ ] Click "ELI5"
- [ ] **PASS:** Text changes to simplified version
- [ ] **PASS:** Simplified text uses analogies and plain language
- [ ] Click "High School"
- [ ] **PASS:** Different simplification level shown
- [ ] Click "Original"
- [ ] **PASS:** Original text restored
- [ ] Navigate to next section
- [ ] **PASS:** Level resets to "Original"

#### SP2: Structure Coach
- [ ] Verify section sidebar shows letter badges next to section names
- [ ] **PASS:** Badges colored by type (blue=I, purple=M, green=R, amber=D)
- [ ] Scroll sidebar to "Structure Guide" panel
- [ ] **PASS:** Shows type counts (e.g., "2 Methods")
- [ ] **PASS:** Shows completion per type (e.g., "1/2")
- [ ] Click a type in Structure Guide
- [ ] **PASS:** Reading tip appears below

#### SP3: Methodology Decoder
- [ ] Navigate to a Methods or Results section
- [ ] **PASS:** "Decode Methods" link visible below text
- [ ] Click "Decode Methods"
- [ ] **PASS:** Loading indicator appears
- [ ] **PASS:** Methodology elements load with:
  - Type badge (study_design, sample_size, etc.)
  - Label
  - Description
- [ ] Click "Expert" toggle
- [ ] **PASS:** Detailed explanations appear
- [ ] **PASS:** Follow-up questions appear
- [ ] Click "Expert" again
- [ ] **PASS:** Expert details hidden

#### SP4: Critical Thinking Prompts
- [ ] Complete a checkpoint response
- [ ] **PASS:** "Critical thinking prompt" link appears after feedback
- [ ] Click the link
- [ ] **PASS:** Panel opens with question text
- [ ] **PASS:** Type badge shows (evaluation/connection/synthesis/application)
- [ ] Close panel
- [ ] **PASS:** Panel closes cleanly

#### SP5: Annotations — Create
- [ ] Select/highlight text in the paper text area
- [ ] **PASS:** Floating toolbar appears with 4 color circles
- [ ] **PASS:** "Look up" button visible
- [ ] Click yellow circle (important)
- [ ] **PASS:** Toast "Saved as 'important'" appears
- [ ] **PASS:** Text selection cleared
- [ ] Select more text, click blue (question)
- [ ] **PASS:** Second annotation saved

#### SP6: Annotations — Sidebar
- [ ] Click "Annotations (2)" button in header
- [ ] **PASS:** Right sidebar opens
- [ ] **PASS:** Both annotations listed
- [ ] **PASS:** Each shows color dot and highlighted text
- [ ] Click "Ask AI" on first annotation
- [ ] **PASS:** Socratic question appears (italic indigo)
- [ ] **PASS:** Question is reflective, not explanatory
- [ ] Click "Delete" on second annotation
- [ ] **PASS:** Annotation removed
- [ ] Close sidebar
- [ ] **PASS:** Sidebar closes

#### SP7: Comprehension Quiz
- [ ] Complete all sections and So What?
- [ ] **PASS:** "Quiz" appears in sidebar after So What?
- [ ] Click "Quiz"
- [ ] Click "Generate Quiz"
- [ ] **PASS:** Loading indicator shows "Generating quiz..."
- [ ] **PASS:** 5 questions appear
- [ ] **PASS:** Mix of MCQ (radio buttons) and short answer (text areas)
- [ ] Answer all 5 questions
- [ ] Click "Submit Quiz"
- [ ] **PASS:** Grading in progress indicator
- [ ] **PASS:** Results screen shows:
  - Percentage score (large)
  - Points breakdown
  - Each question with green/red indicator
  - Correct answer shown for each
  - Explanation for each

#### SP8: XP & Streaks
- [ ] Look at sidebar streak widget (student only)
- [ ] **PASS:** Fire emoji + streak count visible
- [ ] **PASS:** Level badge shows (Lv.1-5)
- [ ] **PASS:** Level title visible
- [ ] **PASS:** XP progress bar shows
- [ ] **PASS:** XP number visible
- [ ] Complete a section
- [ ] **PASS:** XP increases by 5 (section) + 20 (daily bonus if first today)
- [ ] Complete a checkpoint
- [ ] **PASS:** XP increases by 10
- [ ] Submit So What?
- [ ] **PASS:** XP increases by 15
- [ ] Complete quiz
- [ ] **PASS:** XP increases by 25 per correct answer

---

### TEACHER DASHBOARD TESTS

#### D1: Class Progress View
- [ ] Log in as teacher
- [ ] Navigate to class dashboard
- [ ] **PASS:** Student list shows
- [ ] **PASS:** Each student shows assignment status
- [ ] **PASS:** Progress bars show completion percentage
- [ ] **PASS:** Completed students show 100%

#### D2: Student Response Drilldown
- [ ] Click on a student who has completed work
- [ ] **PASS:** Individual checkpoint responses visible
- [ ] **PASS:** Student text and AI feedback both shown
- [ ] **PASS:** So What? response visible
- [ ] **PASS:** Response cards are expandable

#### D3: Class Insights
- [ ] Click "Generate Class Insights"
- [ ] Wait for AI analysis
- [ ] **PASS:** Insights show common misconception
- [ ] **PASS:** Insights show commonly grasped concept
- [ ] **PASS:** Student count matches class enrollment

---

### SELF-STUDY TESTS

#### SS1: Upload Personal Paper
- [ ] Log in as student
- [ ] Navigate to `/student/self-study`
- [ ] Upload a PDF
- [ ] **PASS:** Paper appears in library
- [ ] Wait for guide generation
- [ ] Click "Start Reading"
- [ ] **PASS:** Full reading experience available
- [ ] **PASS:** All superpowers features work (ELI5, annotations, quiz)

#### SS2: CORE API Search
- [ ] Use the search bar
- [ ] Type "machine learning education"
- [ ] **PASS:** Results appear from CORE API
- [ ] **PASS:** Each result shows title, authors, year
- [ ] Click "Fetch & Read"
- [ ] **PASS:** Paper fetched and guide generated
- [ ] **PASS:** Reading page loads

#### SS3: Recommendations
- [ ] Verify "Recommended for You" section exists
- [ ] First visit: **PASS:** Shows "Start your reading journey"
- [ ] After completing papers: **PASS:** Shows category-matched papers
- [ ] **PASS:** Each recommendation has a reason

---

### LANDING PAGE TESTS

#### L1: Landing Page Display
- [ ] Log out or visit `/` while not authenticated
- [ ] **PASS:** Landing page shows hero section
- [ ] **PASS:** Feature grid visible
- [ ] **PASS:** CTA buttons work ("Get Started" → `/auth`)
- [ ] **PASS:** Responsive on different screen sizes

---

## 12. Known Limitations & Future Roadmap

### Current Limitations
1. **No real-time updates:** Uses polling instead of WebSockets for AI feedback
2. **No mobile-optimized layout:** Responsive but not specifically optimized for mobile
3. **No email notifications:** No email reminders or notification system
4. **No SSO/LMS integration:** No school SSO or LMS (Canvas, Moodle) integration
5. **PDF size limit:** 20MB max for PDF uploads
6. **Text truncation:** Papers longer than 50,000 characters are truncated for AI processing
7. **Quiz format:** Fixed at 5 questions (3 MCQ + 2 short answer)
8. **Single AI provider:** Only Google Gemini is supported
9. **No offline mode:** Requires internet connection
10. **No collaborative features:** No shared annotations or group discussions

### Future Roadmap
1. DOI-based paper import
2. Annotation sharing between students
3. Teacher annotation overlay on student reading
4. Custom quiz length and difficulty
5. Reading time estimates
6. Citation/bibliography export
7. School SSO integration
8. Mobile app or PWA
9. Multi-language support
10. Admin dashboard for school administrators

---

## Quick Smoke Test (5 Minutes)

For a rapid sanity check before deeper testing:

1. **Signup** a teacher account → upload a PDF → create a class
2. **Signup** a student account → join the class with the code
3. **Assign** the paper to the class → wait for AI guide → publish
4. **Read** the paper as student → submit one checkpoint → verify AI feedback
5. **Test ELI5** → switch reading levels → verify text changes
6. **Highlight text** → save an annotation → verify in sidebar
7. **Check XP** → verify streak widget updates after actions
8. **Dashboard** → verify teacher can see student progress

If all 8 steps pass, the core system is functional.
