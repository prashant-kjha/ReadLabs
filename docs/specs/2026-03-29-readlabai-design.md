# ReadLabAI — Design Spec
**Date:** 2026-03-29
**Status:** Approved

---

## Overview

ReadLabAI is a classroom tool that teaches students *how* to read research papers through guided, Socratic interaction — not summarization. Where PaperPulse gives people the fish, ReadLabAI teaches them to fish.

**Core distinction from PaperPulse:** The AI never hands over answers. It coaches students to build understanding themselves through section-by-section guided reading and checkpoint responses.

---

## Approach

New repo, same stack as PaperPulse (FastAPI + React + Tailwind + Supabase + Gemini). Selectively copy: `ai_provider.py`, `db.py`, `deps.py`, paper ingestion from `paper_service.py`, frontend auth context, API client, and Layout shell. All prompts are rewritten from scratch — the prompt engineering is the core IP.

---

## Users & Roles

Two roles, one app. Role is set at signup. Frontend routing and navigation differ entirely per role.

- **Teacher** — creates classes, uploads papers, creates and publishes assignments, monitors student progress
- **Student** — joins a class via code, completes reading assignments, interacts with AI checkpoints

---

## Class Enrollment

- Teacher creates a class → system generates a short class code (e.g. `BIO-4X2K`)
- Teacher shares code out-of-band (email, LMS, verbally)
- Student signs up with email + password + their display name → enters class code → enrolled instantly, no teacher approval needed
- Teacher can remove any student from the roster at any time; their session data is retained but they lose assignment access

---

## Core Architectural Principle: Pre-compute Once, Serve Many

The most expensive AI call — analyzing the paper and generating the reading guide — happens **once per assignment**, not once per student. All students in the class pull the same pre-computed guide at zero marginal AI cost. Per-student AI calls are limited to short, focused interactions (checkpoint evaluation, jargon lookup, "So What?" evaluation, class insights).

```
Teacher uploads PDF
      ↓
Backend extracts text + figures/tables/diagrams (PyMuPDF)
      ↓
Gemini generates reading_guide → stored in Supabase (ONE call)
      ↓
30 students pull the same guide instantly (zero AI cost)
      ↓
AI fires only per student: checkpoint submit / jargon request / So What? submit
```

---

## Data Model

| Table | Key Fields | Purpose |
|---|---|---|
| `user_profiles` | `user_id`, `name`, `role (teacher\|student)` | Roles + display names |
| `classes` | `id`, `teacher_id`, `name`, `class_code` | A teacher's class |
| `class_enrollments` | `class_id`, `student_id`, `student_name`, `enrolled_at` | Students in a class |
| `papers` | `id`, `title`, `extracted_text`, `figures (jsonb)`, `pdf_path`, `uploaded_by` | Paper content — no DOI/metadata needed for MVP |
| `assignments` | `id`, `class_id`, `paper_id`, `reading_guide (jsonb)`, `status (processing\|draft\|published)`, `difficulty` | Pre-computed AI guide tied to a class; `processing` while Gemini is generating |
| `student_sessions` | `id`, `student_id`, `assignment_id`, `status`, `started_at`, `completed_at` | Per-student progress |
| `checkpoint_responses` | `id`, `session_id`, `section_index`, `student_text`, `ai_feedback`, `submitted_at` | Student writes, AI responds per section |
| `sowhat_responses` | `id`, `session_id`, `student_text`, `ai_feedback`, `submitted_at` | Final synthesis exercise |
| `jargon_lookups` | `id`, `session_id`, `term`, `explanation`, `created_at` | On-demand term explanations |
| `assignment_insights` | `id`, `assignment_id`, `insights (jsonb)`, `generated_at` | Aggregated class-wide patterns, generated once lazily |

### `reading_guide` JSONB structure

```json
{
  "sections": [
    {
      "title": "Methods",
      "text": "...",
      "figures": [{ "caption": "Figure 1", "image_path": "..." }],
      "guiding_questions": ["Who was studied?", "What was measured?", "How many participants?"],
      "key_terms": ["RCT", "control group", "p-value"],
      "teacher_notes": ""
    }
  ],
  "difficulty": "intermediate"
}
```

---

## AI Processing

### Phase 1 — Assignment Creation (pre-computed, one Gemini call per paper)

Teacher uploads PDF → text + figures/tables/diagrams extracted → single Gemini call produces the `reading_guide`:
- Detects and titles each section
- Writes 3–4 guiding questions per section (framed as "look for" prompts, not quiz questions)
- Identifies key jargon terms per section
- Assigns difficulty (beginner / intermediate / advanced)

Teacher reviews in a UI, can edit any question, term, or difficulty level, then publishes. Unpublished assignments are in `draft` status and not visible to students.

### Phase 2 — Per-Student Interactions (dynamic, short calls)

| Trigger | What Gemini does |
|---|---|
| Checkpoint submission | Compares student text against the section — names one thing correct, one thing missed. Never rewrites the student's answer. Encouraging tone. |
| Jargon request | Explains a highlighted term in plain English, in context of this specific paper |
| "So What?" submission | Checks student claims against the paper's actual findings — flags overstatements and mischaracterizations specifically |
| Teacher requests class insights | Reads all checkpoint responses for a section, surfaces the most common misconception and the most commonly grasped concept. Stored once, not regenerated. |

### Checkpoint Feedback Prompt (core IP)

```
The student wrote the following about the [section name] section:
[student_text]

The actual section says:
[section_text]

In 2–3 sentences: acknowledge one specific thing they captured correctly,
then point to one specific thing they missed or mischaracterized.
Do not rewrite their response. Do not summarize the section for them.
Use an encouraging tone.
```

This prompt is the most iterated piece of the product — pedagogical value lives here.

---

## Student Reading Journey

### Enrollment
Sign up → enter name → enter class code → land on student dashboard showing assigned papers.

### Section-Locked Progression

```
Dashboard → Assignment card → Reading Roadmap
                                    ↓
                         Section 1 (unlocked)
                         ├── Guiding questions shown first (before text)
                         ├── Extracted text + inline figures/tables/diagrams
                         └── Write checkpoint response → AI feedback → unlock next section
                                    ↓
                         Sections 2, 3, 4... (same pattern, sequential unlock)
                                    ↓
                         "So What?" exercise
                         ├── Student writes one-paragraph significance summary
                         └── AI evaluates against paper's actual claims
                                    ↓
                                Assignment complete ✓
```

Key UX decisions:
- **Sections lock sequentially** — enforces the reading skill, not just the reading
- **Guiding questions appear before the text** — students know what to look for before they read
- **Figures, tables, diagrams rendered inline** — essential for understanding results sections; extracted as images via PyMuPDF alongside prose
- **Jargon on-demand** — student highlights any term, requests explanation. Not auto-decoded.
- **Checkpoint box is read-only after submission** — student sees their original answer alongside AI feedback, not replaced by it

### PDF Viewer Fallback
If text extraction produces garbled output (heavily formatted sections, equations), the section displays the PDF viewer instead with a note: *"We couldn't extract clean text for this section — read it in the viewer below."* Checkpoints work identically.

---

## Teacher Experience

### Class Setup
Create class → get class code → share with students.

### Assignment Creation Flow
1. Upload PDF
2. System extracts text + figures/tables
3. Gemini generates draft `reading_guide` (async, show progress indicator)
4. Teacher reviews: sees each section with its guiding questions and key terms, all inline-editable
5. Adjust difficulty, add personal notes to any section if desired
6. Publish → students see assignment immediately

### Dashboard
- **Class view:** Student roster with per-assignment progress (sections completed / total)
- **Assignment drill-down:**
  - Per-student: sections completed, checkpoint responses readable inline
  - Class insights panel: most common misconception per section, most commonly grasped concept (generated on-demand, cached in `assignment_insights`)
- **Student removal:** Remove button on roster — student loses access, data retained

---

## Paper Ingestion (MVP)

PDF upload only. Teacher uploads → PyMuPDF extracts text + figures/tables/diagrams → stored in Supabase Storage + text in `papers` table.

**Future:** DOI lookup and keyword search (OpenAlex/Semantic Scholar) to support student self-study mode.

---

## What Carries Over from PaperPulse

| Module | File | What changes |
|---|---|---|
| AI provider abstraction | `backend/ai_provider.py` | All prompts replaced; functions renamed |
| Async DB client | `backend/db.py` | No changes |
| JWT auth verification | `backend/deps.py` | No changes |
| PDF text extraction | `backend/services/paper_service.py` | Extract figures/tables in addition to text; strip metadata/DOI logic |
| Frontend API client | `frontend/src/lib/api.js` | No changes |
| Auth context | `frontend/src/context/AuthContext.jsx` | No changes |
| Layout shell | `frontend/src/components/Layout.jsx` | New nav items for teacher vs student roles |
| Supabase init | `frontend/src/lib/supabase.js` | No changes |

---

## Out of Scope (MVP)

- Student self-study mode (no teacher, self-assigned papers)
- DOI / keyword paper search
- Pattern recognition across multiple papers ("you've now read 3 RCTs...")
- School SSO / LMS integration
- Mobile-optimized UI
- Notifications / email reminders
