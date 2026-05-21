# Superpowers Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 learning-enhancement features (annotations, ELI5, structure coach, critical prompts, methodology decoder, quiz, streaks, recommendations) to ReadLabs, all rendered inside existing pages with minimal new AI cost.

**Architecture:** Extend `generate_reading_guide` to embed `section_type` and `simplifications` into the reading guide JSON (zero extra runtime AI calls), save `methodology_elements` and `critical_prompts` to new tables in the same background task, then add a `superpowers` router for annotations, quiz generation, stats, and recommendations. Frontend renders all new features as inline components inside `ReadingPage.jsx`.

**Tech Stack:** FastAPI + Supabase (Python backend), React + Tailwind (frontend), Gemini 2.5 Flash (AI), `google.generativeai` SDK, pytest + MagicMock (tests)

---

## File Map

**Create:**
- `backend/routers/superpowers.py` — annotations, methodology, critical prompts, quiz, stats, recommendations endpoints
- `backend/tests/test_superpowers.py` — tests for superpowers router
- `frontend/src/lib/superpowersApi.js` — API client for superpowers endpoints

**Modify:**
- `supabase_schema.sql` — add 6 new tables (annotations, methodology_elements, critical_prompts, quiz_questions, quiz_attempts, reading_stats)
- `backend/ai_provider.py` — extend `generate_reading_guide`; add `generate_annotation_socratic_prompt`, `generate_quiz_questions`, `grade_short_answer`
- `backend/routers/assignments.py` — update `_process_assignment` to save methodology/prompts data
- `backend/routers/library.py` — update `_process_self_study` to save methodology/prompts data
- `backend/main.py` — register superpowers router
- `frontend/src/pages/student/ReadingPage.jsx` — add ELI5 toggle, structure coach, critical prompts, methodology decoder, annotation system, quiz panel
- `frontend/src/pages/student/SelfStudyPage.jsx` — add recommendation panel
- `frontend/src/components/Layout.jsx` — add streak widget

---

## Phase 1: Backend Foundation

---

### Task 1: Schema Migration

**Files:**
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Append new tables to `supabase_schema.sql`**

```sql
-- ── Superpowers: Annotations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES student_sessions(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  start_char integer NOT NULL,
  end_char integer NOT NULL,
  highlight_text text NOT NULL,
  note_text text,
  color text DEFAULT '#3B82F9',
  category text DEFAULT 'important'
    CHECK (category IN ('important', 'confusion', 'question', 'idea')),
  ai_prompt_shown boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id, section_index);
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own annotations" ON annotations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.id = annotations.session_id
              AND student_sessions.student_id = auth.uid())
  );

-- ── Superpowers: Methodology Elements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS methodology_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  element_type text NOT NULL
    CHECK (element_type IN (
      'study_design', 'sample_size', 'statistical_test', 'control',
      'effect_size', 'limitation', 'assumption', 'variable', 'finding', 'key_result'
    )),
  label text NOT NULL,
  description text NOT NULL,
  explanation text NOT NULL,
  follow_up_questions jsonb DEFAULT '[]',
  difficulty text DEFAULT 'intermediate'
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))
);
ALTER TABLE methodology_elements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read methodology for own sessions" ON methodology_elements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = methodology_elements.assignment_id
              AND student_sessions.student_id = auth.uid())
  );

-- ── Superpowers: Critical Prompts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS critical_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  section_index integer,
  prompt_text text NOT NULL,
  prompt_type text NOT NULL
    CHECK (prompt_type IN ('evaluation', 'connection', 'synthesis', 'application')),
  ai_followup text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE critical_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read critical prompts for own sessions" ON critical_prompts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = critical_prompts.assignment_id
              AND student_sessions.student_id = auth.uid())
  );

-- ── Superpowers: Quiz ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL
    CHECK (question_type IN ('multiple_choice', 'short_answer')),
  options jsonb,
  correct_answer text,
  explanation text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read quiz for own sessions" ON quiz_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = quiz_questions.assignment_id
              AND student_sessions.student_id = auth.uid())
  );
CREATE POLICY "Students generate quiz for own sessions" ON quiz_questions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = quiz_questions.assignment_id
              AND student_sessions.student_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  max_score integer NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own quiz attempts" ON quiz_attempts
  FOR ALL USING (auth.uid() = student_id);

-- ── Superpowers: Reading Stats ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_stats (
  student_id uuid PRIMARY KEY,
  papers_read integer DEFAULT 0,
  quizzes_passed integer DEFAULT 0,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  last_read_at timestamptz,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  total_sections_completed integer DEFAULT 0,
  checkpoints_completed integer DEFAULT 0,
  average_comprehension_score real DEFAULT 0
);
ALTER TABLE reading_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own reading stats" ON reading_stats
  FOR ALL USING (auth.uid() = student_id);
```

- [ ] **Step 2: Run schema in Supabase SQL editor and confirm no errors**

  All 6 tables should appear in the Supabase table list.

- [ ] **Step 3: Commit**

```bash
git add supabase_schema.sql
git commit -m "feat: add superpowers schema tables (annotations, methodology, critical_prompts, quiz, reading_stats)"
```

---

### Task 2: Extend `generate_reading_guide` in `ai_provider.py`

**Files:**
- Modify: `backend/ai_provider.py:13-63`
- Test: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write failing test for the extended reading guide structure**

  Add to `backend/tests/test_ai_provider.py`:

```python
import pytest
from unittest.mock import patch, MagicMock
from backend.ai_provider import generate_reading_guide


@pytest.mark.asyncio
async def test_generate_reading_guide_includes_superpowers_fields():
    mock_response = MagicMock()
    mock_response.text = '''{
      "sections": [{
        "title": "Methods",
        "text": "We studied X.",
        "guiding_questions": ["Look for: study design"],
        "key_terms": ["RCT"],
        "teacher_notes": "",
        "section_type": "Methods",
        "simplifications": {
          "undergrad": "Researchers used RCT.",
          "high_school": "Scientists tested two groups.",
          "eli5": "They compared two groups to see which worked better."
        }
      }],
      "difficulty": "intermediate",
      "methodology_elements": [{
        "section_index": 0,
        "element_type": "study_design",
        "label": "RCT",
        "description": "Randomized controlled trial",
        "explanation": "Participants were randomly assigned to groups.",
        "follow_up_questions": ["Why randomize?"],
        "difficulty": "intermediate"
      }],
      "critical_prompts": [{
        "section_index": 0,
        "prompt_text": "What assumptions did the authors make?",
        "prompt_type": "evaluation"
      }]
    }'''

    with patch.object(
        __import__('backend.ai_provider', fromlist=['_model']).ai_provider if False else
        __import__('backend.ai_provider', fromlist=['_model']),
        '_model',
    ) as mock_model:
        pass

    # Simpler: patch generate_content directly
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_reading_guide("paper text here", 2)

    assert "sections" in result
    assert "methodology_elements" in result
    assert "critical_prompts" in result
    section = result["sections"][0]
    assert "section_type" in section
    assert "simplifications" in section
    assert set(section["simplifications"].keys()) == {"undergrad", "high_school", "eli5"}
    assert result["methodology_elements"][0]["element_type"] == "study_design"
    assert result["critical_prompts"][0]["prompt_type"] == "evaluation"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd C:\Users\prash\ReadLabs && python -m pytest backend/tests/test_ai_provider.py::test_generate_reading_guide_includes_superpowers_fields -v
```

Expected: FAIL (section has no `section_type` key)

- [ ] **Step 3: Update `generate_reading_guide` prompt and structure**

  Replace the `prompt` variable inside `generate_reading_guide` in `backend/ai_provider.py`:

```python
    prompt = f"""You are creating a guided reading experience for students reading a research paper.

Paper text (may be truncated to 50,000 characters):
{extracted_text[:50000]}

This paper contains {figure_count} embedded figures, images, or tables.

Return a JSON object with this exact structure:
{{
  "sections": [
    {{
      "title": "section name as it appears in the paper",
      "text": "first 400 characters of this section verbatim",
      "guiding_questions": [
        "Look for: [specific thing to find in this section]",
        "As you read, notice: [another specific thing]",
        "Consider: [a third prompt]"
      ],
      "key_terms": ["jargon term 1", "jargon term 2"],
      "teacher_notes": "",
      "section_type": "Introduction",
      "simplifications": {{
        "undergrad": "technical terms kept, simpler sentence structure, 3-4 sentences",
        "high_school": "key concepts only in everyday language, 3-4 sentences",
        "eli5": "core idea in plain language with analogies, 2-3 sentences"
      }}
    }}
  ],
  "difficulty": "beginner",
  "methodology_elements": [
    {{
      "section_index": 0,
      "element_type": "study_design",
      "label": "human-readable label for this element",
      "description": "one sentence describing what was found",
      "explanation": "2-3 sentences explaining why this matters to a student",
      "follow_up_questions": ["one follow-up question to deepen understanding"],
      "difficulty": "intermediate"
    }}
  ],
  "critical_prompts": [
    {{
      "section_index": 0,
      "prompt_text": "evaluative question for this section",
      "prompt_type": "evaluation"
    }}
  ]
}}

Rules:
- Detect only sections that actually exist in this paper
- Guiding questions must be framed as reading prompts (what to look FOR before reading)
- Include 3 guiding questions per section
- Include 2-5 key terms per section
- difficulty: "beginner" = high school reader, "intermediate" = undergraduate, "advanced" = graduate
- teacher_notes is always an empty string
- section_type must be one of: "Introduction", "Methods", "Results", "Discussion", "Other"
- simplifications: write all three levels for every section (undergrad, high_school, eli5)
- methodology_elements: only for sections with actual methodology content (Methods, Results). May be empty list []
- element_type must be one of: study_design, sample_size, statistical_test, control, effect_size, limitation, assumption, variable, finding, key_result
- critical_prompts: one prompt per section. prompt_type must be one of: evaluation, connection, synthesis, application
  - Introduction sections: use "connection" or "evaluation"
  - Methods sections: use "evaluation" or "application"
  - Results sections: use "synthesis" or "evaluation"
  - Discussion sections: use "synthesis" or "application"
- Return ONLY the JSON object, no markdown, no explanation"""
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
python -m pytest backend/tests/test_ai_provider.py::test_generate_reading_guide_includes_superpowers_fields -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: extend reading guide generation with section_type, simplifications, methodology, critical prompts"
```

---

### Task 3: Add Quiz and Annotation AI Functions to `ai_provider.py`

**Files:**
- Modify: `backend/ai_provider.py`
- Test: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write failing tests**

  Add to `backend/tests/test_ai_provider.py`:

```python
from backend.ai_provider import generate_annotation_socratic_prompt, generate_quiz_questions, grade_short_answer


@pytest.mark.asyncio
async def test_generate_annotation_socratic_prompt():
    mock_response = MagicMock()
    mock_response.text = "What about this passage caught your attention?"
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_annotation_socratic_prompt(
            highlighted_text="The p-value was 0.03",
            section_title="Results"
        )
    assert isinstance(result, str)
    assert len(result) > 10


@pytest.mark.asyncio
async def test_generate_quiz_questions():
    mock_response = MagicMock()
    mock_response.text = '''[
      {
        "question_text": "What was the primary outcome measure?",
        "question_type": "multiple_choice",
        "options": ["A", "B", "C", "D"],
        "correct_answer": "A",
        "explanation": "The primary outcome was X as stated in Methods."
      },
      {
        "question_text": "Describe the main limitation of this study.",
        "question_type": "short_answer",
        "options": null,
        "correct_answer": "Small sample size limited generalizability",
        "explanation": "Discussed in Discussion section."
      }
    ]'''
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await generate_quiz_questions(
            paper_title="Effects of X on Y",
            sections=[{"title": "Methods", "text": "We used RCT."}, {"title": "Results", "text": "p=0.03"}],
            difficulty="intermediate"
        )
    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["question_type"] == "multiple_choice"


@pytest.mark.asyncio
async def test_grade_short_answer():
    mock_response = MagicMock()
    mock_response.text = '{"score": 1, "explanation": "Partially correct — mentioned size but not generalizability."}'
    with patch('backend.ai_provider._model') as mock_model:
        mock_model.generate_content.return_value = mock_response
        result = await grade_short_answer(
            question="What is the main limitation?",
            correct_answer="Small sample size limited generalizability",
            student_answer="The sample was small"
        )
    assert result["score"] == 1
    assert "explanation" in result
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest backend/tests/test_ai_provider.py::test_generate_annotation_socratic_prompt backend/tests/test_ai_provider.py::test_generate_quiz_questions backend/tests/test_ai_provider.py::test_grade_short_answer -v
```

Expected: FAIL with ImportError (functions not yet defined)

- [ ] **Step 3: Add three new functions to `backend/ai_provider.py`** (append after `generate_class_insights`)

```python
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_annotation_socratic_prompt(highlighted_text: str, section_title: str) -> str:
    """Generate a Socratic question about text a student highlighted."""
    prompt = f"""A student highlighted this passage from the "{section_title}" section of a research paper:

"{highlighted_text}"

Ask one Socratic question (10-20 words) that helps the student reflect on WHY this passage caught their attention. 
Do not summarize, explain, or evaluate the passage. Just ask the question.
Return only the question text, no labels."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.5),
        )
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_quiz_questions(paper_title: str, sections: list[dict], difficulty: str) -> list[dict]:
    """Generate 5 quiz questions for a paper. One call per paper, cached in quiz_questions table."""
    sections_text = "\n".join(
        f"## {s['title']}\n{s.get('text', '')[:300]}" for s in sections[:6]
    )
    prompt = f"""Generate 5 comprehension quiz questions for a {difficulty}-level research paper titled "{paper_title}".

Paper sections:
{sections_text}

Return a JSON array of exactly 5 questions. Mix: 3 multiple choice + 2 short answer.

Each question:
{{
  "question_text": "the question",
  "question_type": "multiple_choice" | "short_answer",
  "options": ["A: ...", "B: ...", "C: ...", "D: ..."] or null,
  "correct_answer": "A: ..." or "expected short answer",
  "explanation": "why this is the correct answer, 1-2 sentences"
}}

Rules:
- Multiple choice: 4 options (A-D prefix), one clearly correct
- Short answer: 1-2 sentence expected answer
- Questions must be answerable from the section excerpts provided
- No trick questions; focus on key concepts and findings
Return ONLY the JSON array, no markdown."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
    )
    return json.loads(response.text)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def grade_short_answer(question: str, correct_answer: str, student_answer: str) -> dict:
    """Grade a short answer 0-2. Returns {score: int, explanation: str}."""
    prompt = f"""Grade this student answer for a research paper quiz.

Question: {question}
Expected answer: {correct_answer}
Student's answer: {student_answer}

Score 0-2:
- 2: fully correct, captures the key concept
- 1: partially correct, missing one key element  
- 0: incorrect or irrelevant

Return JSON: {{"score": 0|1|2, "explanation": "one sentence explaining the score"}}
Return ONLY the JSON object."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
    )
    return json.loads(response.text)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
python -m pytest backend/tests/test_ai_provider.py::test_generate_annotation_socratic_prompt backend/tests/test_ai_provider.py::test_generate_quiz_questions backend/tests/test_ai_provider.py::test_grade_short_answer -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/ai_provider.py backend/tests/test_ai_provider.py
git commit -m "feat: add annotation socratic prompt, quiz generation, and short answer grading AI functions"
```

---

### Task 4: Update `_process_assignment` and `_process_self_study` to Save Superpowers Data

**Files:**
- Modify: `backend/routers/assignments.py:21-35`
- Modify: `backend/routers/library.py:26-48`

These background tasks generate the reading guide and now must also save `methodology_elements` and `critical_prompts` to their tables.

- [ ] **Step 1: Update `_process_assignment` in `backend/routers/assignments.py`**

  Replace the existing `_process_assignment` function:

```python
async def _process_assignment(assignment_id: str, extracted_text: str, figure_count: int) -> None:
    """Background task: call Gemini and store reading guide + superpowers data."""
    sb = _supabase_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        methodology_elements = full_result.pop("methodology_elements", [])
        critical_prompts = full_result.pop("critical_prompts", [])

        sb.table("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "draft",
        }).eq("id", assignment_id).execute()

        if methodology_elements:
            for elem in methodology_elements:
                elem["assignment_id"] = assignment_id
            sb.table("methodology_elements").insert(methodology_elements).execute()

        if critical_prompts:
            for prompt in critical_prompts:
                prompt["assignment_id"] = assignment_id
            sb.table("critical_prompts").insert(critical_prompts).execute()

    except Exception as e:
        sb.table("assignments").update({
            "status": "draft",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()
```

- [ ] **Step 2: Update `_process_self_study` in `backend/routers/library.py`**

  Replace the existing `_process_self_study` function:

```python
async def _process_self_study(
    assignment_id: str,
    extracted_text: str,
    figure_count: int,
    db: Any,
) -> None:
    """Background task: generate reading guide for self-study paper, auto-publish."""
    sb = _supabase_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        full_result = await generate_reading_guide(extracted_text, figure_count)

        methodology_elements = full_result.pop("methodology_elements", [])
        critical_prompts = full_result.pop("critical_prompts", [])

        sb.table("assignments").update({
            "reading_guide": full_result,
            "difficulty": full_result.get("difficulty", "intermediate"),
            "status": "published",
        }).eq("id", assignment_id).execute()

        if methodology_elements:
            for elem in methodology_elements:
                elem["assignment_id"] = assignment_id
            sb.table("methodology_elements").insert(methodology_elements).execute()

        if critical_prompts:
            for prompt in critical_prompts:
                prompt["assignment_id"] = assignment_id
            sb.table("critical_prompts").insert(critical_prompts).execute()

    except Exception as e:
        logger.error("Self-study guide generation failed: %s", e)
        sb.table("assignments").update({
            "status": "published",
            "reading_guide": {"sections": [], "generation_error": str(e)},
        }).eq("id", assignment_id).execute()
```

  Also add the import at the top of `backend/routers/library.py` (it already imports `_supabase_client`, so no change needed there — just remove the `db` parameter since we now use `sb` directly).

  Update the call site in `library.py` to not pass `db`:

```python
background_tasks.add_task(
    _process_self_study,
    assignment_id,
    extracted_text,
    figure_count,
)
```

  Find the existing call and remove the `db` argument.

- [ ] **Step 3: Run existing assignment tests to confirm nothing broke**

```bash
python -m pytest backend/tests/test_assignments.py -v
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add backend/routers/assignments.py backend/routers/library.py
git commit -m "feat: save methodology elements and critical prompts during reading guide generation"
```

---

### Task 5: Create `backend/routers/superpowers.py` — Annotations, Methodology, Critical Prompts

**Files:**
- Create: `backend/routers/superpowers.py`

- [ ] **Step 1: Create `backend/routers/superpowers.py` with annotations, methodology, and critical prompts endpoints**

```python
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from supabase import create_client as _supabase_client
from backend.db import get_db
from backend.deps import require_student
from backend.ai_provider import generate_annotation_socratic_prompt
from backend.config import get_settings

router = APIRouter()
settings = get_settings()

UTC = timezone.utc


# ── Request Models ─────────────────────────────────────────────────────────────

class CreateAnnotationRequest(BaseModel):
    session_id: str
    section_index: int
    start_char: int
    end_char: int
    highlight_text: str
    color: str = "#3B82F9"
    category: str = "important"

class UpdateAnnotationRequest(BaseModel):
    note_text: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = None

class XpRequest(BaseModel):
    action: str  # 'section', 'checkpoint', 'sowhat', 'quiz_correct', 'daily'


# ── XP Constants ──────────────────────────────────────────────────────────────

XP_BY_ACTION = {
    "section": 5,
    "checkpoint": 10,
    "sowhat": 15,
    "daily": 20,
    "quiz_correct": 25,
}

LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000]


def compute_level(xp: int) -> int:
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
    return level


# ── Annotations ───────────────────────────────────────────────────────────────

@router.get("/annotations/{session_id}")
async def list_annotations(session_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("id", session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.from_("annotations").select("*") \
        .eq("session_id", session_id).execute()
    return result.data or []


@router.post("/annotations")
async def create_annotation(body: CreateAnnotationRequest, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("id", body.session_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.from_("annotations").insert({
        "session_id": body.session_id,
        "section_index": body.section_index,
        "start_char": body.start_char,
        "end_char": body.end_char,
        "highlight_text": body.highlight_text,
        "color": body.color,
        "category": body.category,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save annotation")
    return result.data[0]


@router.patch("/annotations/{annotation_id}")
async def update_annotation(
    annotation_id: str, body: UpdateAnnotationRequest,
    user=Depends(require_student), db=Depends(get_db),
):
    annotation = await db.from_("annotations").select("session_id") \
        .eq("id", annotation_id).single().execute()
    if not annotation.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    session = await db.from_("student_sessions").select("id") \
        .eq("id", annotation.data["session_id"]).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="Not your annotation")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    await db.from_("annotations").update(updates).eq("id", annotation_id).execute()
    return {"ok": True}


@router.delete("/annotations/{annotation_id}")
async def delete_annotation(annotation_id: str, user=Depends(require_student), db=Depends(get_db)):
    annotation = await db.from_("annotations").select("session_id") \
        .eq("id", annotation_id).single().execute()
    if not annotation.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    session = await db.from_("student_sessions").select("id") \
        .eq("id", annotation.data["session_id"]).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="Not your annotation")

    await db.from_("annotations").delete().eq("id", annotation_id).execute()
    return {"ok": True}


async def _run_annotation_socratic(annotation_id: str, highlight_text: str, section_title: str) -> None:
    sb = _supabase_client(settings.supabase_url, settings.supabase_service_role_key)
    prompt = await generate_annotation_socratic_prompt(highlight_text, section_title)
    sb.table("annotations").update({"ai_prompt_shown": True}).eq("id", annotation_id).execute()
    # Return prompt text via a separate response — stored in a local cache or returned directly
    # Since we need to return it to the frontend, we use a synchronous call instead of background
    return prompt


@router.post("/annotations/{annotation_id}/ai-prompt")
async def get_annotation_ai_prompt(
    annotation_id: str, user=Depends(require_student), db=Depends(get_db),
):
    annotation = await db.from_("annotations").select("session_id, highlight_text, section_index") \
        .eq("id", annotation_id).single().execute()
    if not annotation.data:
        raise HTTPException(status_code=404, detail="Annotation not found")

    ann = annotation.data
    session = await db.from_("student_sessions").select("id, assignment_id") \
        .eq("id", ann["session_id"]).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="Not your annotation")

    assignment = await db.from_("assignments").select("reading_guide") \
        .eq("id", session.data["assignment_id"]).single().execute()
    sections = assignment.data["reading_guide"]["sections"]
    section_title = sections[ann["section_index"]]["title"] if ann["section_index"] < len(sections) else "Unknown"

    prompt = await generate_annotation_socratic_prompt(ann["highlight_text"], section_title)
    await db.from_("annotations").update({"ai_prompt_shown": True}).eq("id", annotation_id).execute()
    return {"prompt": prompt}


# ── Methodology ───────────────────────────────────────────────────────────────

@router.get("/methodology/{assignment_id}/{section_index}")
async def get_methodology_elements(
    assignment_id: str, section_index: int,
    user=Depends(require_student), db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    result = await db.from_("methodology_elements").select("*") \
        .eq("assignment_id", assignment_id).eq("section_index", section_index).execute()
    return result.data or []


# ── Critical Prompts ──────────────────────────────────────────────────────────

@router.get("/critical-prompts/{assignment_id}/{section_index}")
async def get_critical_prompt(
    assignment_id: str, section_index: int,
    user=Depends(require_student), db=Depends(get_db),
):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    result = await db.from_("critical_prompts").select("*") \
        .eq("assignment_id", assignment_id).eq("section_index", section_index).single().execute()
    return result.data  # May be None if no prompt for this section
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
python -c "from backend.routers.superpowers import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/routers/superpowers.py
git commit -m "feat: superpowers router — annotations, methodology, critical prompts endpoints"
```

---

### Task 6: Add Quiz Endpoints to `superpowers.py`

**Files:**
- Modify: `backend/routers/superpowers.py`

- [ ] **Step 1: Add quiz request models and endpoints** (append to `superpowers.py`)

```python
from backend.ai_provider import generate_quiz_questions, grade_short_answer


# ── Quiz Request Models ────────────────────────────────────────────────────────

class QuizAttemptRequest(BaseModel):
    assignment_id: str
    answers: dict  # {question_id: answer_string}


# ── Quiz Endpoints ─────────────────────────────────────────────────────────────

@router.get("/quiz/{assignment_id}")
async def get_quiz(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    questions = await db.from_("quiz_questions").select("*") \
        .eq("assignment_id", assignment_id).execute()
    return questions.data or []


@router.post("/quiz/{assignment_id}/generate")
async def generate_quiz(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    # Return cached questions if already generated
    existing = await db.from_("quiz_questions").select("id") \
        .eq("assignment_id", assignment_id).execute()
    if existing.data:
        questions = await db.from_("quiz_questions").select("*") \
            .eq("assignment_id", assignment_id).execute()
        return questions.data

    assignment = await db.from_("assignments").select("reading_guide, difficulty") \
        .eq("id", assignment_id).single().execute()
    if not assignment.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    guide = assignment.data["reading_guide"]
    paper = await db.from_("papers").select("title") \
        .eq("id", (await db.from_("assignments").select("paper_id").eq("id", assignment_id).single().execute()).data["paper_id"]).single().execute()

    # Re-fetch with paper_id in one query
    assign_full = await db.from_("assignments").select("reading_guide, difficulty, paper_id") \
        .eq("id", assignment_id).single().execute()
    paper_result = await db.from_("papers").select("title") \
        .eq("id", assign_full.data["paper_id"]).single().execute()
    paper_title = paper_result.data["title"] if paper_result.data else "Unknown"

    sections = assign_full.data["reading_guide"]["sections"]
    difficulty = assign_full.data.get("difficulty", "intermediate")

    questions = await generate_quiz_questions(paper_title, sections, difficulty)

    # Insert questions (student INSERT policy allows this for own sessions)
    rows = [{**q, "assignment_id": assignment_id} for q in questions]
    result = await db.from_("quiz_questions").insert(rows).execute()
    return result.data or []


@router.post("/quiz/attempt")
async def submit_quiz_attempt(body: QuizAttemptRequest, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", body.assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    questions = await db.from_("quiz_questions").select("*") \
        .eq("assignment_id", body.assignment_id).execute()
    if not questions.data:
        raise HTTPException(status_code=404, detail="Quiz not generated yet")

    total_score = 0
    max_score = 0
    results = []

    for q in questions.data:
        student_answer = body.answers.get(q["id"], "")
        if q["question_type"] == "multiple_choice":
            max_score += 1
            correct = student_answer.strip() == (q["correct_answer"] or "").strip()
            score = 1 if correct else 0
            total_score += score
            results.append({
                "question_id": q["id"],
                "score": score,
                "max": 1,
                "correct_answer": q["correct_answer"],
                "explanation": q["explanation"],
            })
        else:  # short_answer
            max_score += 2
            grading = await grade_short_answer(q["question_text"], q["correct_answer"] or "", student_answer)
            total_score += grading["score"]
            results.append({
                "question_id": q["id"],
                "score": grading["score"],
                "max": 2,
                "correct_answer": q["correct_answer"],
                "explanation": grading["explanation"],
            })

    await db.from_("quiz_attempts").insert({
        "student_id": user["sub"],
        "assignment_id": body.assignment_id,
        "answers": body.answers,
        "score": total_score,
        "max_score": max_score,
    }).execute()

    return {"score": total_score, "max_score": max_score, "results": results}
```

  Clean up the duplicate paper query in `generate_quiz` — replace the entire function body with this corrected version (remove the intermediate `paper` variable):

```python
@router.post("/quiz/{assignment_id}/generate")
async def generate_quiz(assignment_id: str, user=Depends(require_student), db=Depends(get_db)):
    session = await db.from_("student_sessions").select("id") \
        .eq("assignment_id", assignment_id).eq("student_id", user["sub"]).single().execute()
    if not session.data:
        raise HTTPException(status_code=403, detail="No session for this assignment")

    existing = await db.from_("quiz_questions").select("id") \
        .eq("assignment_id", assignment_id).execute()
    if existing.data:
        questions = await db.from_("quiz_questions").select("*") \
            .eq("assignment_id", assignment_id).execute()
        return questions.data

    assign_full = await db.from_("assignments").select("reading_guide, difficulty, paper_id") \
        .eq("id", assignment_id).single().execute()
    if not assign_full.data:
        raise HTTPException(status_code=404, detail="Assignment not found")

    paper_result = await db.from_("papers").select("title") \
        .eq("id", assign_full.data["paper_id"]).single().execute()
    paper_title = paper_result.data["title"] if paper_result.data else "Unknown"

    sections = assign_full.data["reading_guide"]["sections"]
    difficulty = assign_full.data.get("difficulty", "intermediate")

    questions = await generate_quiz_questions(paper_title, sections, difficulty)
    rows = [{**q, "assignment_id": assignment_id} for q in questions]
    result = await db.from_("quiz_questions").insert(rows).execute()
    return result.data or []
```

- [ ] **Step 2: Verify no syntax errors**

```bash
python -c "from backend.routers.superpowers import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/routers/superpowers.py
git commit -m "feat: superpowers router — quiz generation and attempt submission endpoints"
```

---

### Task 7: Add Stats and Recommendations Endpoints to `superpowers.py`

**Files:**
- Modify: `backend/routers/superpowers.py`

- [ ] **Step 1: Append stats and recommendations endpoints to `superpowers.py`**

```python
# ── Reading Stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(user=Depends(require_student), db=Depends(get_db)):
    result = await db.from_("reading_stats").select("*") \
        .eq("student_id", user["sub"]).single().execute()
    if not result.data:
        return {
            "student_id": user["sub"], "papers_read": 0, "quizzes_passed": 0,
            "current_streak": 0, "longest_streak": 0, "last_read_at": None,
            "level": 1, "xp": 0, "total_sections_completed": 0,
            "checkpoints_completed": 0, "average_comprehension_score": 0,
        }
    return result.data


@router.post("/stats/xp")
async def add_xp(body: XpRequest, user=Depends(require_student), db=Depends(get_db)):
    if body.action not in XP_BY_ACTION:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    earned_xp = XP_BY_ACTION[body.action]

    existing = await db.from_("reading_stats").select("*") \
        .eq("student_id", user["sub"]).single().execute()

    now = datetime.now(UTC)
    today = now.date()

    if not existing.data:
        # First ever reading action — also award daily bonus
        bonus = XP_BY_ACTION["daily"] if body.action != "daily" else 0
        new_xp = earned_xp + bonus
        new_level = compute_level(new_xp)
        await db.from_("reading_stats").insert({
            "student_id": user["sub"],
            "xp": new_xp,
            "level": new_level,
            "current_streak": 1,
            "longest_streak": 1,
            "last_read_at": now.isoformat(),
            "total_sections_completed": 1 if body.action == "section" else 0,
            "checkpoints_completed": 1 if body.action == "checkpoint" else 0,
        }).execute()
        return {"xp": new_xp, "level": new_level, "streak": 1, "xp_earned": new_xp}

    stats = existing.data
    last_read_at = stats.get("last_read_at")
    last_date = datetime.fromisoformat(last_read_at).date() if last_read_at else None

    # Streak logic
    current_streak = stats["current_streak"]
    longest_streak = stats["longest_streak"]
    daily_bonus = 0

    if last_date is None or last_date != today:
        # Award daily bonus on first action of the day
        if body.action != "daily":
            daily_bonus = XP_BY_ACTION["daily"]

        if last_date is None:
            current_streak = 1
        elif (today - last_date).days == 1:
            current_streak += 1
        else:
            current_streak = 1  # streak broken
        longest_streak = max(current_streak, longest_streak)

    new_xp = stats["xp"] + earned_xp + daily_bonus
    new_level = compute_level(new_xp)

    updates = {
        "xp": new_xp,
        "level": new_level,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "last_read_at": now.isoformat(),
    }
    if body.action == "section":
        updates["total_sections_completed"] = stats["total_sections_completed"] + 1
    elif body.action == "checkpoint":
        updates["checkpoints_completed"] = stats["checkpoints_completed"] + 1

    await db.from_("reading_stats").update(updates).eq("student_id", user["sub"]).execute()
    return {"xp": new_xp, "level": new_level, "streak": current_streak, "xp_earned": earned_xp + daily_bonus}


# ── Recommendations ────────────────────────────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations(user=Depends(require_student), db=Depends(get_db)):
    # Get student's completed session assignment IDs
    sessions = await db.from_("student_sessions").select("assignment_id") \
        .eq("student_id", user["sub"]).eq("status", "completed").execute()

    completed_assignment_ids = [s["assignment_id"] for s in (sessions.data or [])]

    # Get the categories and paper IDs of completed assignments
    if not completed_assignment_ids:
        # No history: return newest self-study papers
        newest = await db.from_("papers").select("id, title, authors, year_published, category") \
            .eq("is_self_study", True).execute()
        papers = (newest.data or [])[:3]
        return [{"paper": p, "reason": "Start your reading journey"} for p in papers]

    completed_papers = await db.from_("assignments").select("paper_id") \
        .in_("id", completed_assignment_ids).execute()
    completed_paper_ids = [r["paper_id"] for r in (completed_papers.data or [])]

    completed_paper_details = await db.from_("papers").select("id, category") \
        .in_("id", completed_paper_ids).execute()
    categories = list({p["category"] for p in (completed_paper_details.data or []) if p.get("category")})

    # Find unread papers in same categories
    all_library = await db.from_("papers").select("id, title, authors, year_published, category") \
        .eq("is_self_study", True).execute()

    unread = [
        p for p in (all_library.data or [])
        if p["id"] not in completed_paper_ids
        and p.get("category") in categories
    ]

    recommendations = unread[:3]
    result = []
    for paper in recommendations:
        cat = paper.get("category", "this topic")
        result.append({
            "paper": paper,
            "reason": f"Builds on your reading in {cat}",
        })

    # Pad with any unread papers if fewer than 3 recommendations
    if len(result) < 3:
        fallback = [p for p in (all_library.data or []) if p["id"] not in completed_paper_ids and p not in unread]
        for paper in fallback[:3 - len(result)]:
            result.append({"paper": paper, "reason": "Expand your reading"})

    return result[:3]
```

- [ ] **Step 2: Verify no syntax errors**

```bash
python -c "from backend.routers.superpowers import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/routers/superpowers.py
git commit -m "feat: superpowers router — reading stats, XP system, and paper recommendations"
```

---

### Task 8: Register Superpowers Router in `main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing test to verify the router is registered**

  Add to `backend/tests/test_superpowers.py` (create the file):

```python
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_superpowers_routes_exist():
    routes = [r.path for r in app.routes]
    assert any("/superpowers" in r for r in routes), f"No superpowers routes found. Routes: {routes}"
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
python -m pytest backend/tests/test_superpowers.py::test_superpowers_routes_exist -v
```

Expected: FAIL (no superpowers routes registered)

- [ ] **Step 3: Register the router in `backend/main.py`**

  Add to the import line and `include_router` call:

```python
from backend.routers import auth, papers, classes, assignments, enrollment, sessions, dashboard, library, superpowers
```

```python
app.include_router(superpowers.router, prefix="/api/v1/superpowers", tags=["superpowers"])
```

  Create `backend/routers/__init__.py` already has the routers. Just add `superpowers` to the import in `main.py`.

- [ ] **Step 4: Run test to confirm it passes**

```bash
python -m pytest backend/tests/test_superpowers.py::test_superpowers_routes_exist -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_superpowers.py
git commit -m "feat: register superpowers router at /api/v1/superpowers"
```

---

### Task 9: Tests for Superpowers Router

**Files:**
- Modify: `backend/tests/test_superpowers.py`

These tests use the same `make_db` helper pattern from `test_sessions.py`.

- [ ] **Step 1: Add full test suite to `backend/tests/test_superpowers.py`**

```python
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.deps import require_student, get_db


def make_db(*return_values):
    call_count = 0
    results = list(return_values)

    async def mock_execute():
        nonlocal call_count
        val = results[call_count] if call_count < len(results) else results[-1]
        call_count += 1
        return MagicMock(data=val)

    db = MagicMock()
    for method in ["from_", "select", "insert", "update", "upsert", "eq",
                   "in_", "single", "delete", "patch"]:
        setattr(db, method, MagicMock(return_value=db))
    db.execute = mock_execute
    return db


STUDENT = {"sub": "student-uuid-1"}


# ── Annotations ───────────────────────────────────────────────────────────────

def test_list_annotations_requires_student():
    app.dependency_overrides.clear()
    r = TestClient(app).get("/api/v1/superpowers/annotations/sess-1")
    assert r.status_code == 401


def test_list_annotations_returns_list():
    session = {"id": "sess-1"}
    annotations = [{"id": "ann-1", "highlight_text": "X", "category": "important"}]
    db = make_db(session, annotations)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/annotations/sess-1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()[0]["highlight_text"] == "X"


def test_create_annotation_returns_created():
    session = {"id": "sess-1"}
    new_ann = [{"id": "ann-2", "highlight_text": "Y", "category": "question"}]
    db = make_db(session, new_ann)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).post("/api/v1/superpowers/annotations", json={
            "session_id": "sess-1",
            "section_index": 0,
            "start_char": 10,
            "end_char": 20,
            "highlight_text": "Y",
        })
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()["id"] == "ann-2"


def test_create_annotation_rejects_unknown_session():
    db = make_db(None)  # session not found
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).post("/api/v1/superpowers/annotations", json={
            "session_id": "bad-session",
            "section_index": 0,
            "start_char": 0,
            "end_char": 5,
            "highlight_text": "test",
        })
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 404


# ── Quiz ─────────────────────────────────────────────────────────────────────

def test_get_quiz_returns_cached_questions():
    session = {"id": "sess-1"}
    questions = [
        {"id": "q-1", "question_text": "What is X?", "question_type": "multiple_choice"},
        {"id": "q-2", "question_text": "Explain Y.", "question_type": "short_answer"},
    ]
    db = make_db(session, questions)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/quiz/assign-1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_get_quiz_returns_empty_when_not_generated():
    session = {"id": "sess-1"}
    db = make_db(session, [])
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/quiz/assign-1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json() == []


# ── Stats ─────────────────────────────────────────────────────────────────────

def test_get_stats_returns_defaults_for_new_student():
    db = make_db(None)  # no row yet
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/stats")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    data = r.json()
    assert data["level"] == 1
    assert data["xp"] == 0
    assert data["current_streak"] == 0


def test_add_xp_rejects_unknown_action():
    db = make_db()
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).post("/api/v1/superpowers/stats/xp", json={"action": "fly"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 400


def test_add_xp_creates_stats_row_for_new_student():
    db = make_db(None, [{"id": "stat-1"}])  # no existing stats, then insert succeeds
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).post("/api/v1/superpowers/stats/xp", json={"action": "section"})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    data = r.json()
    assert data["xp"] == 25  # 5 (section) + 20 (daily bonus for new student)
    assert data["level"] == 1


# ── Methodology ───────────────────────────────────────────────────────────────

def test_get_methodology_requires_session():
    db = make_db(None)  # no session
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/methodology/assign-1/0")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 403


def test_get_methodology_returns_elements():
    session = {"id": "sess-1"}
    elements = [{"id": "elem-1", "element_type": "study_design", "label": "RCT"}]
    db = make_db(session, elements)
    app.dependency_overrides[require_student] = lambda: STUDENT
    app.dependency_overrides[get_db] = lambda: db
    try:
        r = TestClient(app).get("/api/v1/superpowers/methodology/assign-1/1")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json()[0]["element_type"] == "study_design"
```

- [ ] **Step 2: Run the tests**

```bash
python -m pytest backend/tests/test_superpowers.py -v
```

Expected: all PASS (including the route existence test from Task 8)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_superpowers.py
git commit -m "test: superpowers router — annotations, quiz, stats, methodology tests"
```

---

## Phase 2: Frontend Features

---

### Task 10: Create `frontend/src/lib/superpowersApi.js`

**Files:**
- Create: `frontend/src/lib/superpowersApi.js`

- [ ] **Step 1: Create the API client**

```javascript
import api from "./api";

// ── Annotations ────────────────────────────────────────────────────────────

export const listAnnotations = (sessionId) =>
  api.get(`/superpowers/annotations/${sessionId}`).then((r) => r.data);

export const createAnnotation = (payload) =>
  api.post("/superpowers/annotations", payload).then((r) => r.data);

export const updateAnnotation = (annotationId, updates) =>
  api.patch(`/superpowers/annotations/${annotationId}`, updates).then((r) => r.data);

export const deleteAnnotation = (annotationId) =>
  api.delete(`/superpowers/annotations/${annotationId}`).then((r) => r.data);

export const getAnnotationAiPrompt = (annotationId) =>
  api.post(`/superpowers/annotations/${annotationId}/ai-prompt`).then((r) => r.data);

// ── Methodology ────────────────────────────────────────────────────────────

export const getMethodologyElements = (assignmentId, sectionIndex) =>
  api.get(`/superpowers/methodology/${assignmentId}/${sectionIndex}`).then((r) => r.data);

// ── Critical Prompts ───────────────────────────────────────────────────────

export const getCriticalPrompt = (assignmentId, sectionIndex) =>
  api.get(`/superpowers/critical-prompts/${assignmentId}/${sectionIndex}`).then((r) => r.data);

// ── Quiz ──────────────────────────────────────────────────────────────────

export const getQuiz = (assignmentId) =>
  api.get(`/superpowers/quiz/${assignmentId}`).then((r) => r.data);

export const generateQuiz = (assignmentId) =>
  api.post(`/superpowers/quiz/${assignmentId}/generate`).then((r) => r.data);

export const submitQuizAttempt = (assignmentId, answers) =>
  api.post("/superpowers/quiz/attempt", { assignment_id: assignmentId, answers }).then((r) => r.data);

// ── Stats ─────────────────────────────────────────────────────────────────

export const getStats = () =>
  api.get("/superpowers/stats").then((r) => r.data);

export const addXp = (action) =>
  api.post("/superpowers/stats/xp", { action }).then((r) => r.data);

// ── Recommendations ───────────────────────────────────────────────────────

export const getRecommendations = () =>
  api.get("/superpowers/recommendations").then((r) => r.data);
```

- [ ] **Step 2: Verify the file imports `api` correctly (check `frontend/src/lib/api.js` exists)**

```bash
ls frontend/src/lib/
```

Expected: `api.js` exists in the directory

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/superpowersApi.js
git commit -m "feat: superpowers API client for frontend"
```

---

### Task 11: ELI5 Mode — SimplificationToggle in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

The section's `simplifications` field (from the extended reading guide) provides pre-computed text at three levels. Add a level selector above the paper text and swap the displayed text based on selection.

- [ ] **Step 1: Add `simplificationLevel` state** (after the existing `manualTerm` state, around line 51)

```javascript
const [simplificationLevel, setSimplificationLevel] = useState("original");
```

- [ ] **Step 2: Add `SimplificationToggle` component** (after `GuidingQuestions`, before `PaperText`)

```javascript
const SIMPLIFICATION_LEVELS = [
  { key: "original", label: "Original" },
  { key: "undergrad", label: "Undergrad" },
  { key: "high_school", label: "High School" },
  { key: "eli5", label: "ELI5" },
];

const SimplificationToggle = () => {
  const hasSimplifications = !!section.simplifications;
  if (!hasSimplifications) return null;
  return (
    <div className="flex items-center gap-1 mb-3">
      <span className="text-xs text-gray-500 mr-1">Reading level:</span>
      {SIMPLIFICATION_LEVELS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSimplificationLevel(key)}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            simplificationLevel === key
              ? "bg-indigo-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: Update `PaperText` to use the selected simplification level**

  Replace the existing `PaperText` component:

```javascript
const PaperText = () => {
  const displayText =
    simplificationLevel !== "original" && section.simplifications?.[simplificationLevel]
      ? section.simplifications[simplificationLevel]
      : section.text;

  return (
    <div ref={textRef} className="text-gray-300 text-sm leading-7 select-text" onMouseUp={handleMouseUp}>
      <HighlightedText
        text={displayText}
        keyTerms={simplificationLevel === "original" ? (section.key_terms || []) : []}
        onTermClick={lookupKeyTerm}
      />
    </div>
  );
};
```

- [ ] **Step 4: Add `SimplificationToggle` above `PaperText` in the stacked and side-by-side layouts**

  In the stacked layout section (around line 547), add `<SimplificationToggle />` before the `<PaperText />` call inside the "Paper Text" card:

```javascript
<div className="bg-gray-900 rounded-xl p-5">
  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
  <SimplificationToggle />
  <PaperText />
</div>
```

  In the side-by-side layout (around line 566), add it before `<PaperText />`:

```javascript
<div className="w-1/2 overflow-y-auto bg-gray-900 rounded-xl p-5">
  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
  <SimplificationToggle />
  <PaperText />
</div>
```

- [ ] **Step 5: Reset simplification level when section changes**

  In the `advanceSection` function (after `setCurrentSection(next)`):

```javascript
setSimplificationLevel("original");
```

- [ ] **Step 6: Test manually**

  Start the dev server (`npm run dev` in `frontend/`) and open a reading page. Verify:
  1. "Reading level:" buttons appear above paper text
  2. Clicking "ELI5" shows the simplified text (if the reading guide was generated with the new prompt)
  3. Clicking "Original" restores the original text

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: ELI5 simplification toggle in reading page"
```

---

### Task 12: Structure Coach — Section Type Badges in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

The `section_type` field (e.g., "Methods") is stored in `reading_guide.sections[i].section_type`. Add a badge next to each section name in the sidebar and a tooltip explaining what to look for.

- [ ] **Step 1: Add `StructureCoach` constants and component** (add before the `SectionSidebar` component)

```javascript
const SECTION_TYPE_TIPS = {
  Introduction: "Look for: the research gap, the main claim, and how the authors position their work.",
  Methods: "Look for: study design, sample size, controls, and statistical tests.",
  Results: "Look for: key findings, statistical significance, and effect sizes.",
  Discussion: "Look for: limitations, implications, future directions, and how findings connect to the field.",
  Other: "Read for context and supporting information.",
};

const SECTION_TYPE_COLORS = {
  Introduction: "bg-blue-500/20 text-blue-300",
  Methods: "bg-purple-500/20 text-purple-300",
  Results: "bg-green-500/20 text-green-300",
  Discussion: "bg-amber-500/20 text-amber-300",
  Other: "bg-gray-500/20 text-gray-400",
};

const [activeTypeTip, setActiveTypeTip] = useState(null);

const StructureCoach = () => {
  const typeCounts = {};
  const completedCounts = {};
  sections.forEach((s, i) => {
    const t = s.section_type || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (checkpoints[i]?.ai_feedback) completedCounts[t] = (completedCounts[t] || 0) + 1;
  });

  const types = Object.keys(typeCounts);
  if (types.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Structure Guide</p>
      <div className="space-y-1.5">
        {types.map((type) => (
          <button
            key={type}
            onClick={() => setActiveTypeTip(activeTypeTip === type ? null : type)}
            className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between ${SECTION_TYPE_COLORS[type] || SECTION_TYPE_COLORS.Other}`}
          >
            <span>{type}</span>
            <span className="text-gray-500">
              {completedCounts[type] || 0}/{typeCounts[type]}
            </span>
          </button>
        ))}
      </div>
      {activeTypeTip && (
        <div className="mt-2 text-xs text-gray-400 bg-gray-800 rounded p-2 leading-relaxed">
          {SECTION_TYPE_TIPS[activeTypeTip] || SECTION_TYPE_TIPS.Other}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add `SectionTypeBadge` inline in `SectionSidebar`**

  In the `SectionSidebar` component, after `<span className="truncate">{s.title}</span>`, add:

```javascript
{s.section_type && (
  <span className={`text-xs px-1 rounded shrink-0 ${SECTION_TYPE_COLORS[s.section_type] || SECTION_TYPE_COLORS.Other}`}>
    {s.section_type.slice(0, 1)}
  </span>
)}
```

- [ ] **Step 3: Add `<StructureCoach />` at the bottom of `SectionSidebar`**

  In the `SectionSidebar` component return, after the closing `</div>` of the sections list but still inside the outer `<div className="w-48 shrink-0">`:

```javascript
<StructureCoach />
```

- [ ] **Step 4: Add `activeTypeTip` state** (after `simplificationLevel` state)

  The `useState` call is already in the component definition in Step 1. Since React components can't have state declared in nested functions, move `activeTypeTip` state to the top of `ReadingPage`:

```javascript
const [activeTypeTip, setActiveTypeTip] = useState(null);
```

  (Remove the duplicate from inside `StructureCoach`; it must be at the `ReadingPage` level and passed or accessed via closure.)

- [ ] **Step 5: Test manually**

  Verify that the section sidebar shows single-letter badges (I/M/R/D/O) and a "Structure Guide" panel below the sections list. Clicking a type shows the tip.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: structure coach — section type badges and tooltips in sidebar"
```

---

### Task 13: Critical Reading Prompts — `CriticalPromptPanel` in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

- [ ] **Step 1: Add state and imports**

  Add to the state declarations at top of `ReadingPage`:

```javascript
const [criticalPrompt, setCriticalPrompt] = useState(null);
const [criticalPromptOpen, setCriticalPromptOpen] = useState(false);
const [assignmentId, setAssignmentId] = useState(null);
```

  Add to the `initSession` function (after `setReadingGuide(data.reading_guide)`):

```javascript
setAssignmentId(data.assignment_id);
```

  Add `assignment_id` to the session start response in the backend's `sessions.py` `start_session` handler's return statement. Currently it returns `assignment_id: body.assignment_id` — verify this is already returned (it is, as `"assignment_id": body.assignment_id`).

  In `initSession`, set it:

```javascript
setAssignmentId(data.assignment_id);
```

- [ ] **Step 2: Add import in `ReadingPage.jsx`** (at the top)

```javascript
import { getCriticalPrompt } from "../../lib/superpowersApi";
```

- [ ] **Step 3: Add `CriticalPromptPanel` component** (after `CheckpointArea`)

```javascript
const CriticalPromptPanel = () => {
  const loadPrompt = async () => {
    if (!assignmentId || previewMode) return;
    try {
      const data = await getCriticalPrompt(assignmentId, currentSection);
      setCriticalPrompt(data);
      setCriticalPromptOpen(true);
    } catch {
      // Silently skip if no prompt available
    }
  };

  if (!criticalPrompt && !criticalPromptOpen) {
    return (
      <button
        onClick={loadPrompt}
        className="mt-3 text-xs text-gray-500 hover:text-indigo-400 underline transition-colors"
      >
        Critical thinking prompt →
      </button>
    );
  }

  if (!criticalPrompt) return null;

  return (
    <div className="mt-4 border border-indigo-900/50 rounded-lg p-3 bg-indigo-950/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-indigo-400 uppercase tracking-wider font-medium">
          Critical Thinking
        </span>
        <button
          onClick={() => { setCriticalPromptOpen(false); setCriticalPrompt(null); }}
          className="text-gray-600 hover:text-gray-400 text-sm"
        >
          ×
        </button>
      </div>
      <p className="text-gray-300 text-sm leading-relaxed">{criticalPrompt.prompt_text}</p>
      <span className="text-xs text-gray-600 capitalize mt-1 block">{criticalPrompt.prompt_type}</span>
    </div>
  );
};
```

- [ ] **Step 4: Add `<CriticalPromptPanel />` after `<CheckpointArea />` in both layouts**

  In the stacked layout (after `<div className="bg-gray-900 rounded-xl p-5"><CheckpointArea /></div>`):

```javascript
{cp.ai_feedback && <div className="bg-gray-900 rounded-xl p-5"><CriticalPromptPanel /></div>}
```

  In the side-by-side layout (after `<CheckpointArea />` inside the left panel):

```javascript
{cp.ai_feedback && <CriticalPromptPanel />}
```

- [ ] **Step 5: Reset critical prompt on section change**

  In `advanceSection`, after `setSimplificationLevel("original")`:

```javascript
setCriticalPrompt(null);
setCriticalPromptOpen(false);
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: critical reading prompts panel after checkpoint feedback"
```

---

### Task 14: Methodology Decoder in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

- [ ] **Step 1: Add state and import**

  Add to state declarations:

```javascript
const [methodologyElements, setMethodologyElements] = useState([]);
const [methodologyOpen, setMethodologyOpen] = useState(false);
const [methodologyLoading, setMethodologyLoading] = useState(false);
```

  Add to imports:

```javascript
import { getMethodologyElements } from "../../lib/superpowersApi";
```

- [ ] **Step 2: Add `MethodologyDecoder` component** (after `SimplificationToggle`)

```javascript
const MethodologyDecoder = () => {
  const [expertMode, setExpertMode] = useState(false);

  const loadElements = async () => {
    if (!assignmentId || previewMode || methodologyLoading) return;
    setMethodologyLoading(true);
    try {
      const data = await getMethodologyElements(assignmentId, currentSection);
      setMethodologyElements(data || []);
      setMethodologyOpen(true);
    } catch {
      toast.error("Could not load methodology elements");
    } finally {
      setMethodologyLoading(false);
    }
  };

  if (!methodologyOpen) {
    return (
      <button
        onClick={loadElements}
        disabled={methodologyLoading}
        className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline disabled:opacity-50"
      >
        {methodologyLoading ? "Loading…" : "Decode Methods →"}
      </button>
    );
  }

  if (methodologyElements.length === 0) {
    return (
      <div className="mt-3 text-xs text-gray-500">
        No methodology elements identified for this section.
        <button onClick={() => setMethodologyOpen(false)} className="ml-2 text-gray-600 hover:text-gray-400">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Methodology</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpertMode((m) => !m)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${expertMode ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            Expert
          </button>
          <button onClick={() => setMethodologyOpen(false)} className="text-gray-600 hover:text-gray-400 text-sm">×</button>
        </div>
      </div>
      <div className="space-y-3">
        {methodologyElements.map((elem) => (
          <div key={elem.id} className="bg-gray-800/50 rounded p-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded capitalize">
                {elem.element_type.replace(/_/g, " ")}
              </span>
              <span className="text-sm text-white font-medium">{elem.label}</span>
            </div>
            <p className="text-xs text-gray-400 mb-1">{elem.description}</p>
            {expertMode && <p className="text-xs text-gray-300 leading-relaxed">{elem.explanation}</p>}
            {expertMode && elem.follow_up_questions?.length > 0 && (
              <p className="text-xs text-indigo-400 mt-1 italic">{elem.follow_up_questions[0]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Add `<MethodologyDecoder />` below `<PaperText />` in both layouts**

  In the stacked layout, inside the "Paper Text" card after `<PaperText />`:

```javascript
{!previewMode && <MethodologyDecoder />}
```

  In the side-by-side layout, after `<PaperText />`:

```javascript
{!previewMode && <MethodologyDecoder />}
```

- [ ] **Step 4: Reset methodology on section change**

  In `advanceSection`:

```javascript
setMethodologyElements([]);
setMethodologyOpen(false);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: methodology decoder panel in reading page"
```

---

### Task 15: Annotation System in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

This is the most complex frontend task. The annotation system overlays colored highlights on the paper text and provides a floating action bar on text selection.

- [ ] **Step 1: Add state and imports**

  Add to state declarations:

```javascript
const [annotations, setAnnotations] = useState([]);
const [highlightTooltip, setHighlightTooltip] = useState(null);
const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState(false);
const [pendingAnnotation, setPendingAnnotation] = useState(null);
```

  Add to imports:

```javascript
import {
  listAnnotations, createAnnotation, updateAnnotation,
  deleteAnnotation, getAnnotationAiPrompt
} from "../../lib/superpowersApi";
```

- [ ] **Step 2: Load annotations on session init**

  In `initSession`, after `setSessionId(data.session_id)`:

```javascript
if (data.session_id) {
  listAnnotations(data.session_id).then(setAnnotations).catch(() => {});
}
```

- [ ] **Step 3: Add `ANNOTATION_COLORS` constant**

```javascript
const ANNOTATION_COLORS = {
  important: "#FBBF24",
  confusion: "#F97316",
  question: "#3B82F6",
  idea: "#22C55E",
};
```

- [ ] **Step 4: Update `handleMouseUp` to show annotation tooltip instead of jargon lookup**

  Replace the existing `handleMouseUp`:

```javascript
const handleMouseUp = () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    setHighlightTooltip(null);
    setFloatingLookup(null);
    return;
  }
  const text = sel.toString().trim();
  if (text.length < 2) { setHighlightTooltip(null); setFloatingLookup(null); return; }

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Calculate char offsets relative to textRef
  let startChar = 0;
  let endChar = 0;
  if (textRef.current) {
    const preRange = range.cloneRange();
    preRange.selectNodeContents(textRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    startChar = preRange.toString().length;
    endChar = startChar + text.length;
  }

  setHighlightTooltip({
    text,
    startChar,
    endChar,
    top: rect.top + window.scrollY - 52,
    left: Math.min(rect.left, window.innerWidth - 280),
  });
  setFloatingLookup({ text, top: rect.top + window.scrollY - 44, left: Math.min(rect.left, window.innerWidth - 120) });
};
```

- [ ] **Step 5: Add `saveAnnotation` function**

```javascript
const saveAnnotation = async (category) => {
  if (!highlightTooltip || !sessionId) return;
  const color = ANNOTATION_COLORS[category] || ANNOTATION_COLORS.important;
  try {
    const ann = await createAnnotation({
      session_id: sessionId,
      section_index: currentSection,
      start_char: highlightTooltip.startChar,
      end_char: highlightTooltip.endChar,
      highlight_text: highlightTooltip.text,
      color,
      category,
    });
    setAnnotations((prev) => [...prev, ann]);
    toast.success(`Saved as "${category}"`);
  } catch {
    toast.error("Failed to save highlight");
  }
  setHighlightTooltip(null);
  window.getSelection()?.removeAllRanges();
};
```

- [ ] **Step 6: Add `HighlightTooltip` component**

```javascript
const HighlightTooltip = () => {
  if (!highlightTooltip || previewMode) return null;
  return (
    <div
      style={{ position: "absolute", top: highlightTooltip.top, left: highlightTooltip.left, zIndex: 50 }}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2 flex items-center gap-1"
    >
      {Object.entries(ANNOTATION_COLORS).map(([cat, color]) => (
        <button
          key={cat}
          title={cat}
          onClick={() => saveAnnotation(cat)}
          style={{ backgroundColor: color }}
          className="w-5 h-5 rounded-full hover:scale-110 transition-transform"
        />
      ))}
      <div className="w-px h-4 bg-gray-700 mx-1" />
      <button
        onClick={() => { lookupJargon(highlightTooltip.text); setHighlightTooltip(null); }}
        className="text-xs text-gray-400 hover:text-white px-1"
      >
        Look up
      </button>
    </div>
  );
};
```

- [ ] **Step 7: Add `AnnotationSidebar` component**

```javascript
const AnnotationSidebar = () => {
  const sessionAnnotations = annotations.filter((a) => a.section_index === currentSection);
  const [aiPrompts, setAiPrompts] = useState({});

  const askAI = async (ann) => {
    try {
      const { prompt } = await getAnnotationAiPrompt(ann.id);
      setAiPrompts((prev) => ({ ...prev, [ann.id]: prompt }));
    } catch {
      toast.error("Could not get AI prompt");
    }
  };

  const removeAnnotation = async (annId) => {
    try {
      await deleteAnnotation(annId);
      setAnnotations((prev) => prev.filter((a) => a.id !== annId));
    } catch {
      toast.error("Failed to delete annotation");
    }
  };

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-white font-medium text-sm">Annotations ({annotations.length})</h3>
        <button onClick={() => setAnnotationSidebarOpen(false)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sessionAnnotations.length === 0 && (
          <p className="text-gray-600 text-xs text-center mt-8">No annotations in this section yet.</p>
        )}
        {sessionAnnotations.map((ann) => (
          <div key={ann.id} className="bg-gray-800 rounded-lg p-2.5">
            <div className="flex items-start gap-2">
              <div className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: ann.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-gray-300 text-xs leading-relaxed">"{ann.highlight_text}"</p>
                {ann.note_text && <p className="text-gray-500 text-xs mt-1 italic">{ann.note_text}</p>}
                {aiPrompts[ann.id] && (
                  <p className="text-indigo-400 text-xs mt-1 italic">{aiPrompts[ann.id]}</p>
                )}
                <div className="flex gap-2 mt-1.5">
                  {!aiPrompts[ann.id] && (
                    <button onClick={() => askAI(ann)} className="text-xs text-indigo-500 hover:text-indigo-300">Ask AI</button>
                  )}
                  <button onClick={() => removeAnnotation(ann.id)} className="text-xs text-gray-600 hover:text-red-400">Delete</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 8: Add annotation toggle button in the page header**

  In the header `flex items-center gap-3` div (after the layout toggle button):

```javascript
{!previewMode && (
  <button
    onClick={() => setAnnotationSidebarOpen((o) => !o)}
    className="text-gray-400 hover:text-white text-xs border border-gray-700 rounded px-2.5 py-1 transition-colors"
  >
    Annotations ({annotations.length})
  </button>
)}
```

- [ ] **Step 9: Add `<HighlightTooltip />` and `<AnnotationSidebar />` to the render**

  Before the closing `</div>` of the main component:

```javascript
<HighlightTooltip />
{annotationSidebarOpen && <AnnotationSidebar />}
```

- [ ] **Step 10: Test manually**

  1. Select text in the paper text area
  2. Color circles appear — click one to save annotation
  3. Toast shows "Saved as important"
  4. Annotations button in header shows count
  5. Click "Annotations" to open sidebar
  6. Click "Ask AI" on an annotation — Socratic prompt appears

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: annotation highlighting system with sidebar and AI prompts"
```

---

## Phase 3: Engagement & Discovery

---

### Task 16: Quiz Panel in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

The quiz appears after the So What? section is completed (or skipped). It's shown as a new "section" at `currentSection === sections.length + 1`.

- [ ] **Step 1: Add state and imports**

  Add to state:

```javascript
const [quizQuestions, setQuizQuestions] = useState([]);
const [quizAnswers, setQuizAnswers] = useState({});
const [quizResults, setQuizResults] = useState(null);
const [quizGenerating, setQuizGenerating] = useState(false);
const [quizSubmitting, setQuizSubmitting] = useState(false);
```

  Add to imports:

```javascript
import { getQuiz, generateQuiz, submitQuizAttempt, addXp } from "../../lib/superpowersApi";
```

- [ ] **Step 2: Add `QuizPanel` component** (after `SoWhatPanel`)

```javascript
const QuizPanel = () => {
  const startQuiz = async () => {
    if (!assignmentId) return;
    setQuizGenerating(true);
    try {
      let questions = await getQuiz(assignmentId);
      if (questions.length === 0) {
        questions = await generateQuiz(assignmentId);
      }
      setQuizQuestions(questions);
    } catch {
      toast.error("Could not load quiz");
    } finally {
      setQuizGenerating(false);
    }
  };

  const submitQuiz = async () => {
    setQuizSubmitting(true);
    try {
      const results = await submitQuizAttempt(assignmentId, quizAnswers);
      setQuizResults(results);
      // Award XP for each correct answer
      const correctCount = results.results.filter((r) => r.score === r.max).length;
      for (let i = 0; i < correctCount; i++) {
        await addXp("quiz_correct").catch(() => {});
      }
    } catch {
      toast.error("Failed to submit quiz");
    } finally {
      setQuizSubmitting(false);
    }
  };

  if (quizResults) {
    const pct = Math.round((quizResults.score / quizResults.max_score) * 100);
    return (
      <div className="max-w-2xl">
        <h2 className="text-white font-semibold text-lg mb-4">Quiz Results</h2>
        <div className="bg-indigo-950/50 border border-indigo-800/50 rounded-xl p-5 mb-4">
          <p className="text-3xl font-bold text-white">{pct}%</p>
          <p className="text-indigo-300 text-sm">{quizResults.score} / {quizResults.max_score} points</p>
        </div>
        <div className="space-y-3">
          {quizResults.results.map((r, i) => {
            const q = quizQuestions.find((q) => q.id === r.question_id);
            return (
              <div key={r.question_id} className={`rounded-lg p-3 ${r.score === r.max ? "bg-green-900/30 border border-green-700/40" : "bg-red-900/20 border border-red-800/40"}`}>
                <p className="text-gray-200 text-sm font-medium mb-1">{q?.question_text}</p>
                <p className="text-gray-400 text-xs">Correct: {r.correct_answer}</p>
                <p className="text-gray-500 text-xs mt-1 italic">{r.explanation}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (quizQuestions.length > 0) {
    const allAnswered = quizQuestions.every((q) => quizAnswers[q.id]?.trim());
    return (
      <div className="max-w-2xl">
        <h2 className="text-white font-semibold text-lg mb-4">Comprehension Quiz</h2>
        <div className="space-y-5">
          {quizQuestions.map((q, i) => (
            <div key={q.id} className="bg-gray-900 rounded-xl p-4">
              <p className="text-gray-200 text-sm font-medium mb-3">{i + 1}. {q.question_text}</p>
              {q.question_type === "multiple_choice" ? (
                <div className="space-y-2">
                  {(q.options || []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={quizAnswers[q.id] === opt}
                        onChange={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                        className="text-indigo-600"
                      />
                      <span className="text-gray-300 text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={3}
                  value={quizAnswers[q.id] || ""}
                  onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Your answer…"
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 resize-none"
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={submitQuiz}
          disabled={!allAnswered || quizSubmitting}
          className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors"
        >
          {quizSubmitting ? "Grading…" : "Submit Quiz"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-white font-semibold text-lg mb-2">Test Your Understanding</h2>
      <p className="text-gray-400 text-sm mb-4">
        Answer 5 questions to check your comprehension of this paper.
      </p>
      <button
        onClick={startQuiz}
        disabled={quizGenerating}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors"
      >
        {quizGenerating ? "Generating quiz…" : "Generate Quiz"}
      </button>
    </div>
  );
};
```

- [ ] **Step 3: Add quiz as a section after So What? in the sidebar**

  In `SectionSidebar`, after the "So What?" button:

```javascript
{(soWhat.ai_feedback || soWhat.skipped) && (
  <button
    onClick={() => setCurrentSection(sections.length + 1)}
    className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
      currentSection === sections.length + 1 ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
    }`}
  >
    Quiz
  </button>
)}
```

- [ ] **Step 4: Render `QuizPanel` when `currentSection === sections.length + 1`**

  In the main render, update the condition for `isSoWhatSection` and add quiz section:

```javascript
const isQuizSection = currentSection === sections.length + 1;
```

  In the body render (where `{isSoWhatSection ? <SoWhatPanel /> : ...}`), update to:

```javascript
{isQuizSection ? (
  <QuizPanel />
) : isSoWhatSection ? (
  <SoWhatPanel />
) : layout === "stacked" ? (
  ...
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: post-reading comprehension quiz panel"
```

---

### Task 17: Streak Widget in `Layout.jsx`

**Files:**
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Add `StreakWidget` component to `Layout.jsx`**

  Replace `Layout.jsx` with:

```javascript
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { getStats } from "../lib/superpowersApi";

const TEACHER_LINKS = [
  { to: "/teacher/papers",  label: "Papers" },
  { to: "/teacher/classes", label: "Classes" },
];

const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "My Classes" },
  { to: "/student/self-study", label: "Self-Study" },
];

const LEVEL_TITLES = ["", "Novice Reader", "Apprentice", "Skilled Reader", "Expert Reader", "Scholar"];
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000];

function StreakWidget() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return null;

  const level = stats.level || 1;
  const xp = stats.xp || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const progress = nextThreshold > prevThreshold
    ? Math.min(100, Math.round(((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100;

  return (
    <div className="mt-auto pt-4 border-t border-gray-800 px-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🔥</span>
        <span className="text-white text-sm font-medium">{stats.current_streak} day streak</span>
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          level >= 5 ? "bg-amber-500/20 text-amber-300" :
          level >= 3 ? "bg-indigo-500/20 text-indigo-300" :
          "bg-gray-700 text-gray-400"
        }`}>
          Lv.{level}
        </span>
        <span className="text-xs text-gray-500">{LEVEL_TITLES[level] || "Scholar"}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-600 mt-1">{xp} XP</p>
    </div>
  );
}

export default function Layout() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();
  const links = role === "teacher" ? TEACHER_LINKS : STUDENT_LINKS;

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
        {role === "student" && <StreakWidget />}
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-white text-sm px-3 py-2 text-left transition-colors mt-2"
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

- [ ] **Step 2: Test manually**

  Log in as a student. Verify:
  1. Streak widget appears in the sidebar below nav links
  2. Shows "🔥 0 day streak" initially
  3. Level badge shows "Lv.1 Novice Reader"
  4. XP bar is empty

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Layout.jsx
git commit -m "feat: streak and level widget in sidebar for students"
```

---

### Task 18: XP Integration in `ReadingPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/ReadingPage.jsx`

Call `addXp` when reading actions complete, so the streak widget reflects real progress.

- [ ] **Step 1: Import `addXp`** (already imported in Task 16)

- [ ] **Step 2: Call `addXp("section")` in `advanceSection`**

```javascript
const advanceSection = async () => {
  const next = currentSection + 1;
  setCurrentSection(next);
  setSimplificationLevel("original");
  setCriticalPrompt(null);
  setCriticalPromptOpen(false);
  setMethodologyElements([]);
  setMethodologyOpen(false);
  if (!previewMode && sessionId) {
    await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: next }).catch(() => {});
    addXp("section").catch(() => {});
  }
};
```

- [ ] **Step 3: Call `addXp("checkpoint")` when checkpoint feedback arrives**

  In `startPolling`, after updating `setCheckpoints` when `ai_feedback` is found for any checkpoint, add:

```javascript
// In the poll callback, after: cpMap[cp.section_index] = { ..., ai_feedback: cp.ai_feedback }
// Check if this is newly received feedback
if (cp.ai_feedback && !prev[cp.section_index]?.ai_feedback) {
  addXp("checkpoint").catch(() => {});
}
```

  Since the polling callback doesn't have easy access to the "was it new" state, simplify by calling `addXp("checkpoint")` from `submitCheckpoint` right after saving (before polling starts):

```javascript
const submitCheckpoint = async () => {
  // ... existing code ...
  try {
    await api.post(`/sessions/${sessionId}/checkpoint`, { ... });
    addXp("checkpoint").catch(() => {});  // Add this line
    startPolling(sessionId);
  }
  // ...
};
```

- [ ] **Step 4: Call `addXp("sowhat")` from `submitSoWhat`**

```javascript
const submitSoWhat = async () => {
  // ...existing code...
  try {
    await api.post(`/sessions/${sessionId}/sowhat`, { student_text: soWhat.text });
    addXp("sowhat").catch(() => {});  // Add this line
    startPolling(sessionId);
  }
  // ...
};
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: award XP for reading actions (sections, checkpoints, sowhat)"
```

---

### Task 19: Recommendation Panel in `SelfStudyPage.jsx`

**Files:**
- Modify: `frontend/src/pages/student/SelfStudyPage.jsx`

- [ ] **Step 1: Add state and import to `SelfStudyPage.jsx`**

  Add to imports:

```javascript
import { getRecommendations } from "../../lib/superpowersApi";
```

  Add to state:

```javascript
const [recommendations, setRecommendations] = useState([]);
```

- [ ] **Step 2: Load recommendations in `useEffect`**

  In the existing `useEffect`:

```javascript
useEffect(() => {
  loadPapers();
  loadCategories();
  getRecommendations().then(setRecommendations).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeCategory]);
```

- [ ] **Step 3: Add `RecommendationPanel` component** (defined inside the SelfStudyPage function, before the return)

```javascript
const RecommendationPanel = () => {
  if (recommendations.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-white font-semibold text-base mb-3">Recommended for You</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {recommendations.map(({ paper, reason }) => (
          <div
            key={paper.id}
            className="bg-gray-800 rounded-xl p-4 shrink-0 w-64 flex flex-col"
          >
            <p className="text-white text-sm font-medium leading-snug mb-1">{paper.title}</p>
            {paper.authors && <p className="text-gray-500 text-xs mb-1">{paper.authors}</p>}
            {paper.category && (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded self-start mb-2">
                {paper.category}
              </span>
            )}
            <p className="text-gray-500 text-xs italic mb-3 flex-1">{reason}</p>
            <button
              onClick={() => navigate(`/student/reading/${paper.id}`)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Start Reading
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

  Note: The "Start Reading" button navigates to the reading page. The actual route depends on how self-study papers are opened — check the existing `pollAndNavigate` and `handleFetch` functions in `SelfStudyPage.jsx` for the correct route pattern. Replace `/student/reading/${paper.id}` with the actual navigation call used in that file.

- [ ] **Step 4: Add `<RecommendationPanel />` to the SelfStudyPage render**

  Find where papers are rendered and add `<RecommendationPanel />` immediately above the search/category section.

- [ ] **Step 5: Fix navigation** — read `SelfStudyPage.jsx`'s `handleFetch`/`handleSearch` to see how it navigates to a paper, then update the "Start Reading" button accordingly

  The pattern in `SelfStudyPage.jsx` is `navigate('/student/reading/' + assignmentId)` (via `pollAndNavigate`). For recommendations, the paper needs to be fetched/assigned first. Use the existing `handleFetch` function if it accepts a `paperId`, or call the library fetch endpoint directly:

```javascript
const startRecommendedPaper = async (paperId) => {
  setFetching(paperId);
  try {
    const { data } = await api.post("/library/fetch", { paper_id: paperId });
    navigate(`/student/self-study/reading/${data.assignment_id}`);
  } catch {
    toast.error("Could not start paper");
  } finally {
    setFetching(null);
  }
};
```

  Call `startRecommendedPaper(paper.id)` from the "Start Reading" button's onClick.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/SelfStudyPage.jsx
git commit -m "feat: paper recommendation panel on self-study page"
```

---

## Self-Review

### Spec Coverage

| Spec Feature | Tasks |
|---|---|
| Feature 1: Annotations | Tasks 1 (schema), 5 (backend), 10 (api client), 15 (frontend) |
| Feature 2: Structure Coach | Tasks 2 (AI), 4 (process), 12 (frontend) |
| Feature 3: Quiz | Tasks 1 (schema), 3 (AI), 6 (backend), 10 (api client), 16 (frontend) |
| Feature 5: Streaks & Levels | Tasks 1 (schema), 7 (backend), 10 (api client), 17 (widget), 18 (XP calls) |
| Feature 6: Recommendations | Tasks 7 (backend), 10 (api client), 19 (frontend) |
| Feature 7: Methodology Decoder | Tasks 2 (AI), 4 (process), 10 (api client), 14 (frontend) |
| Feature 8: ELI5 Mode | Tasks 2 (AI), 4 (process), 11 (frontend) |
| Feature 9: Critical Prompts | Tasks 2 (AI), 4 (process), 5 (backend), 10 (api client), 13 (frontend) |

All 8 features covered. Feature 4 is absent from the spec (not a gap in this plan).

### Placeholder Scan

- Task 4: `_process_self_study` removes the `db` parameter — **verify the call site in `library.py` removes it too** (the plan says to do this explicitly in Step 2).
- Task 15 Step 4: `handleMouseUp` replaces the existing function completely — confirm the existing floating jargon lookup still works (the updated function sets both `highlightTooltip` and `floatingLookup`, so jargon lookup "Look up" still works via the tooltip).
- Task 19 Step 5: navigation route is marked for verification — the engineer must check the actual route before committing.
- Task 16 Step 4: `isQuizSection` variable added — `isSoWhatSection` variable from line 503 must remain correct (`currentSection === sections.length`).

### Type Consistency

- `annotations.session_id` is used in `create_annotation` (POST body) and in `list_annotations` (path param) — consistent.
- `ANNOTATION_COLORS` keys (`important`, `confusion`, `question`, `idea`) match the DB `CHECK` constraint — consistent.
- `XP_BY_ACTION` keys (`section`, `checkpoint`, `sowhat`, `daily`, `quiz_correct`) match what `addXp` is called with throughout — consistent.
- `compute_level` uses `LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000]` in both `superpowers.py` and `Layout.jsx` — consistent.
- `quiz_attempts` table uses `max_score` column; `submit_quiz_attempt` endpoint returns `max_score`; `QuizPanel` reads `quizResults.max_score` — consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-05-superpowers-features-design.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
