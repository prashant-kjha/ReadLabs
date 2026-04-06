# Superpowers Features Design

> **Status:** Approved 2026-04-05
> **Author:** Claude (from brainstorming session)

## Overview

Eight features that transform ReadLabAI from a reading assignment tool into a comprehensive research paper learning platform. Features work in both self-study and classroom modes. Designed for incremental implementation on top of the existing Plans 1–4 + self-study mode architecture.

**Key Decision:** Build into existing flow — no new pages. All features render inside `ReadingPage.jsx` as panels, overlays, and sidebar additions. Minimize AI calls by pre-computing during reading guide generation and caching aggressively.

---

## File Map

```
backend/
  ai_provider.py                    MODIFY — append 8 AI functions
  routers/
    superpowers.py                NEW — quiz, methodology, ELI5, prompts endpoints
  tests/
    test_superpowers.py             NEW
  main.py                            MODIFY — register superpowers router
  config.py                            NO CHANGE (all keys exist)

frontend/src/
  pages/student/ReadingPage.jsx        MODIFY — add annotation layer, ELI5, structure coach, critical prompts, quizzes, streaks
  pages/student/SelfStudyPage.jsx     MODIFY — add recommendations
  components/Layout.jsx               MODIFY — add streak widget
  lib/superpowersApi.js            NEW — API client for superpowers endpoints

supabase_schema.sql                    MODIFY — add new tables
```

---

## Data Model

### New Tables

```sql
-- ── Annotations ──────────────────────────────────────────────────────────────
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

-- ── Methodology Elements ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS methodology_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  element_type text NOT NULL
    CHECK (element_type IN (
      'study_design', 'sample_size', 'statistical_test',
      'control', 'effect_size', 'limitation',
      'assumption', 'variable', 'finding', 'key_result'
    )),
  label text NOT NULL,
  description text NOT NULL,
  explanation text NOT NULL,
  follow_up_questions jsonb DEFAULT '[] CHECK (follow_up_questions @> 0),
  difficulty text DEFAULT 'intermediate'
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))
);

-- ── Critical Prompts ────────────────────────────────────────────────────
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

-- ── Quizzes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL
    CHECK (question_type IN ('multiple_choice', 'short_answer')),
  options jsonb,          -- for multiple choice: ["A", "B", "C", "D"]
  correct_answer text,
  explanation text,           -- why the answer is correct
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  quiz_id uuid NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,         -- [{ question_id: string, answer: string }]
  score integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── Reading Stats & Streaks ──────────────────────────────────────────────
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
```

---

## Feature Specifications

### Feature 1: Annotation & Highlighting System

**Goal:** Students highlight text and attach notes. AI optionally asks reflective questions about highlights.

**When it activates:** Student selects text in paper text area → tooltip appears with options.

**Reading flow:**
1. Student selects text in the `PaperText` component
2. Floating tooltip appears with options: Highlight (color picker), Add Note, Ask AI
3. On "Highlight": saves annotation to DB with `start_char`, `end_char`, `quote`, `category`
4. On "Add Note": opens inline note textarea below the highlight
5. On "Ask AI": AI generates a Socratic question about why they highlighted this passage (e.g., "What about this passage caught your attention?")
6. Annotation renders as colored highlight with category icon
7. Student can revisit annotations from sidebar

**Annotation categories:** important, confusion, question, idea — each with distinct color

**Highlight colors:** yellow (important), orange (confusion), blue (question), green (idea)

**Sidebar:** Annotation panel in sidebar shows list of all annotations for current paper, filterable by category, clickable to jump to annotation location.

**Teacher view (classroom only):** Class heatmap overlay on paper view showing annotation density per section. Aggregated stats visible in drill-down.

**Components:**
- `AnnotationLayer` — absolute-positioned overlay on `PaperText` that renders highlight rectangles
- `HighlightTooltip` — floating action bar on text selection
- `AnnotationNote` — inline note textarea
- `AnnotationSidebar` — list view in existing sidebar area
- `ClassHeatmapOverlay` — teacher-only aggregated view

**AI prompt:** Only triggered when user clicks "Ask AI". Generates one Socratic question, saved to `annotations.ai_prompt_shown`. Not auto-triggered to save AI costs.

**Storage:** `annotations` table,- `session_id`, `section_index`, `start_char`, `end_char`, `highlight_text`, `note_text`, `color`, `category`, `ai_prompt_shown`

---

### Feature 2: Paper Structure Coach

**Goal:** Interactive overlay teaching the IMRaD structure of research papers.

**When it activates:** Always visible — a collapsible "Structure Guide" panel in the section sidebar.

**UI:** Small panel below the `SectionSidebar` with section-type indicators:
- Each section gets a badge: "Introduction", "Methods", "Results", "Discussion", "Other"
- Badge determined by AI during reading guide generation (added to `reading_guide.sections[].section_type` field)
- Clicking a badge shows a tooltip explaining what to look for in this section type
- Section progress indicator shows: "3/5 Introduction sections read"

**Tooltips content (examples):**
- Introduction: "Look for: the research gap, the main claim, and how the authors position their work"
- Methods: "Look for: study design, sample size, controls, and statistical tests"
- Results: "Look for: key findings, statistical significance, and effect sizes"
- Discussion: "Look for: limitations, implications, future directions, and how findings connect to the field"

**Data:** Section types are determined during reading guide generation. Add `section_type` field to `reading_guide.sections[]`. This is AI-generated, no new DB table needed — stored in the existing `assignments.reading_guide` JSONB column.

**AI call:** During reading guide generation, append prompt to identify section type. Zero additional AI calls at runtime.

**Components:**
- `StructureCoach` — panel in sidebar showing section types and progress
- `SectionTypeBadge` — inline badge per section

---

### Feature 3: Post-Reading Quiz Generation

**Goal:** Auto-generate comprehension quiz after reading all sections.

**When it activates:** After student completes all sections + So What? (or skips them).

**Reading flow:**
1. Student finishes reading → "Generate Quiz" button appears in completion area
2. AI generates 3-5 questions (mix of multiple choice and short answer)
3. Questions cached in `quiz_questions` table
4. Student answers questions
5. Score calculated and shown
6. Results saved to `quiz_attempts` table
7. Reading stats updated (XP, level)

**Question types:**
- Multiple choice: 4 options, one correct, with explanation
- Short answer: free text, AI-graded on correctness (0-2 scale)

**Scoring:** Percentage correct + brief AI feedback per question.

**Components:**
- `QuizPanel` — quiz container with questions and scoring
- `QuizQuestion` — individual question renderer
- `QuizResults` — score display with per-question review

**AI call:** One Gemini call per quiz generation. Questions are cached — no per-student AI cost.

**Storage:** `quiz_questions` table, `quiz_attempts` table

---

### Feature 5: Reading Streak & Leveling System

**Goal:** Gamified reading tracking with streaks, levels, and XP.

**When it activates:** Always visible — streak widget in `Layout.jsx` header/sidebar.

**Mechanics:**
- Streak: consecutive days with at least one reading action (section completed, checkpoint submitted, quiz completed)
- Day resets at `reading_stats.last_read_at` at UTC midnight
- Streak breaks if no reading action for 2+ calendar days
- XP: earned for sections read (+5), checkpoints (+10), quizzes (+25 per correct answer), daily bonus (+20)
- Levels: 1 (0-99 XP), 2 (100-249 XP), 3 (250-499 XP), etc. Every level requires 50% more XP than previous
- Level titles: Novice Reader, Apprentice, Skilled Reader, Expert Reader, Scholar

**Reading actions that earn XP:**
| Action | XP |
|--------|-----|
| Section completed | +5 |
| Checkpoint submitted | +10 |
| Quiz correct answer | +25 |
| So What? completed | +15 |
| Daily reading bonus | +20 |

**Level thresholds:**
| Level | Title | XP Required |
|-------|-------|-------------|
| 1 | Novice Reader | 0 |
| 2 | Apprentice | 100 |
| 3 | Skilled Reader | 250 |
| 4 | Expert Reader | 500 |
| 5 | Scholar | 1000 |

**UI:** Small widget showing fire emoji + streak count + level badge + mini XP bar. In sidebar below nav links.

**Components:**
- `StreakWidget` — small component in Layout
- `LevelUpAnimation` — optional celebration overlay

**Storage:** `reading_stats` table (one row per student)

**Backend endpoints:**
- `POST /superpowers/stats/update` — update reading stats (called internally)
- `GET /superpowers/stats` — get current stats

---

### Feature 6: Paper Recommendation Engine

**Goal:** Suggest next papers based on reading history and difficulty progression.

**When it activates:** After completing a paper or on SelfStudyPage.

**Mechanics:**
- Track completed papers' topics and difficulty
- Find papers in library with similar topics but slightly harder
- Use keyword overlap + difficulty gradient, not vector embeddings (simpler, no pgvector extension needed)
- Show 3 recommended papers with "Why this paper?" explanation

**Recommendation logic:**
1. Get student's completed papers → extract topics/categories
2. Find papers in library with matching categories
3. Filter for difficulty = current level or +1
4. Exclude already-read papers
5. Return top 3

**UI:** Recommendation panel at SelfStudyPage showing 3 cards:
- Paper title, authors, year, category badge
- Difficulty badge
- "Why this paper?" one-line explanation (e.g., "Builds on the ML concepts from your last paper")
- "Start Reading" button

**Components:**
- `RecommendationPanel` — 3 recommendation cards
- `RecommendationCard` — single paper card with explanation

**Backend endpoint:**
- `GET /superpowers/recommendations` — returns 3 recommended papers

**Storage:** Uses existing `papers` table metadata (category, difficulty via assignment). No new table needed.

---

### Feature 7: Methodology Decoder

**Goal:** Break down methodology sections into learnable elements with explanations.

**When it activates:** When a section is identified as containing methodology content (by AI during reading guide generation).

**Reading flow:**
1. AI identifies methodology elements during reading guide generation
2. Elements cached in `methodology_elements` table
3. Student clicks "Decode Methods" button in section
4. Panel expands showing identified elements
5. Each element shows: type label, description, explanation, follow-up question
6. Student can toggle "Expert Mode" for deeper breakdown

**Methodology element types:**
- study_design, sample_size, statistical_test, control, effect_size, limitation, assumption, variable, finding, key_result

**Expert mode:** Shows additional detail — specific values, p-values, confidence intervals, etc.

**Components:**
- `MethodologyDecoder` — expandable panel within section
- `MethodologyElement` — single element card

**AI call:** During reading guide generation (one call, elements extracted alongside). No additional runtime AI calls.

**Storage:** `methodology_elements` table

---

### Feature 8: "Explain Like I'm 5" Mode

**Goal:** One-click progressive simplification of any paragraph.

**When it activates:** Per-section "Simplify" button.

**Reading flow:**
1. Student reads a dense paragraph
2. Clicks "Simplify" button
3. Text replaces with simplified version (ELI5)
4. Can cycle through: ELI5 → High School → Undergrad → Original
5. Original text always accessible via toggle

**Simplification levels:**
| Level | Description |
|-------|-------------|
| Original | As written |
| Undergrad | Technical terms kept, simpler sentence structure |
| High School | Key concepts only, everyday language |
| ELI5 | Core idea in plain language, analogies welcome |

**Caching:** Simplifications are generated per-section during reading guide generation. Stored in `reading_guide.sections[].simplifications` array. Zero runtime AI calls.

**UI:** Row of level buttons above paper text. Active level highlighted. Smooth text transition.

**Components:**
- `SimplificationToggle` — button row with level options
- Integrated into existing `PaperText` component

**AI call:** During reading guide generation. Adds simplification generation to the prompt. Still one Gemini call.

**Storage:** Nested in existing `assignments.reading_guide` JSONB column under `sections[].simplifications`.

---

### Feature 9: Critical Reading Prompts

**Goal:** After-section evaluative questions that teach critical thinking.

**When it activates:** After each section's checkpoint area.

**Reading flow:**
1. Student reads section
2. After checkpoint, critical prompt appears (collapsible, not blocking)
3. Student optionally responds
4. AI gives feedback comparing student response to ideal answer
5. Response saved

**Prompt types:**
- **Evaluation:** "What assumptions did the authors make here?"
- **Connection:** "How does this relate to what you learned in the previous section?"
- **Synthesis:** "If you had to explain this section to a peer in one sentence, what would you say?"
- **Application:** "How could the findings from this section be applied in a different context?"

**Prompts are pre-generated** during reading guide generation. Stored in `critical_prompts` table. One per section.

**Components:**
- `CriticalPromptPanel` — collapsible panel after checkpoint
- Integrated into existing `CheckpointArea` component

**AI call:** During reading guide generation (prompts generated alongside). No additional runtime AI calls.

**Storage:** `critical_prompts` table

---

## AI Cost Analysis

| Feature | Gemini Calls | When | Cached? |
|---------|-------------|------|----------|
| Annotation AI prompt | 1 per annotation | On "Ask AI" click | No (one-time) |
| Paper Structure Coach | 0 | During guide gen | Yes (in reading guide) |
| Quizzes | 1 per paper | On quiz generation | Yes (quiz_questions table) |
| Streaks & Levels | 0 | Internal tracking | N/A |
| Recommendations | 0 | Query-based matching | N/A |
| Methodology Decoder | 0 | During guide gen | Yes (methodology_elements) |
| ELI5 Mode | 0 | During guide gen | Yes (in reading guide) |
| Critical Prompts | 0 | During guide gen | Yes (critical_prompts) |

**Key insight:** Most features (5 of 8) add zero runtime AI cost. They enrich the reading guide generation prompt (still one Gemini call per paper) and cache results. Only Annotation AI prompts (one per click) and Quizzes (one per paper) make additional AI calls.

---

## Implementation Order

**Phase 1 (backend foundation):**
1. Schema migration — all new tables
2. AI provider — extend reading guide generation to include section types, methodology elements, ELI5 simplifications, critical prompts
3. Superpowers router — quiz, stats, recommendations endpoints

**Phase 2 (frontend features):**
4. Annotation system — highlight, note, AI prompt
5. ELI5 mode — simplification toggle
6. Structure coach — section type badges and tooltips
7. Critical prompts — post-section evaluative questions
8. Methodology decoder — expandable methods panel

**Phase 3 (engagement & discovery):**
9. Quiz panel — post-reading quiz
10. Streaks & levels — XP tracking, streak widget
11. Recommendations — next paper suggestions

---

## Out of Scope

- Vector embeddings for paper similarity (using keyword matching instead)
- Social features (peer annotation, discussion threads)
- Writing practice tools (summary generator, literature review builder)
- Spaced repetition system (separate from streak tracking)
- Email notifications
- Mobile-optimized UI
