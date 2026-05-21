# ReadLabs — Planning Notes
**Date:** 2026-03-29
**Purpose:** Personal reference capturing the full planning discussion, decisions made, and the reasoning behind them.

---

## The Idea

**PaperPulse gives people the fish. ReadLabs teaches them to fish.**

Most students hit a research paper and either give up at the abstract or read it linearly like a novel — both are wrong. There's a skill to reading papers that nobody explicitly teaches. Professors assume students absorb it through osmosis, and most never do. ReadLabs makes that invisible skill visible and practicable.

The key distinction: the AI never just hands over an answer. It acts like a Socratic tutor sitting next to the student — it knows the paper's content but deliberately withholds synthesis, prompting the student to build that understanding themselves, step by step.

---

## Is the PaperPulse Codebase Worth Referencing?

**Yes — absolutely worth referencing. Do not start from scratch.**

Here's what carries over directly vs. what's new:

| Carries Over | Net New |
|---|---|
| Paper ingestion pipeline (Unpaywall, OpenAlex, Semantic Scholar, PDF upload) | Socratic prompt engineering |
| AI provider abstraction (`ai_provider.py`) | Reading session state machine |
| Supabase auth + async DB client (`db.py`) | New tables: sessions, checkpoints, progress, assignments |
| JWT verification pattern (`deps.py`) | Teacher dashboard |
| React shell + Tailwind + routing | Section-by-section reading flow UI |
| SSE streaming infrastructure | Pattern recognition across papers |

Roughly 30–40% of the codebase transfers directly, another 20% with modification.

---

## Approach Decision: Fork vs. New Repo

Three options were considered:

**Option A — Fork PaperPulse, build on top**
Take the PaperPulse repo as-is and add classroom features. New routes, new tables, new pages alongside existing ones.
- Pro: Zero setup time
- Con: Carries 40% of PaperPulse that ReadLabs doesn't need (bibliographies, collections, highlights, multi-paper chat). Dead code slows iteration.

**Option B — New repo, same stack, selective copy (CHOSEN)**
Fresh repo. Same stack: FastAPI + React + Tailwind + Supabase + Gemini. Manually copy only the modules that transfer cleanly.
- Pro: Purpose-built architecture from day one. No legacy noise. Classroom data model designed correctly, not bolted onto an existing schema.
- Con: 2–3 hours of setup and selective copying. That's it.

**Option C — New repo, upgrade to Next.js**
Same as B for the backend, but Next.js for the frontend.
- Pro: SSR is useful for teacher dashboard
- Con: Learning a new frontend paradigm while building a complex product. PaperPulse React components don't transfer cleanly. Adds friction at a stage where you want momentum. Revisit after product is validated.

**Decision: Option B.** The 2–3 hour cost of a clean start is worth avoiding the legacy noise.

---

## Key Product Decisions Made

### 1. Classroom tool first, not self-study
**Decision:** Build ReadLabs as a classroom tool where teachers assign papers, not as a self-study tool where individual students find their own papers.

**Why:** More cost effective. The AI processes each paper once and serves the guide to all students in the class — no per-student processing cost. The teacher dashboard also makes it a stickier institutional product.

**Future:** Self-study mode (student finds their own papers via DOI or keyword search) is explicitly planned for later once the student reading experience is validated.

---

### 2. Pre-compute once, serve many (cost architecture)
**Decision:** When a teacher assigns a paper, Gemini processes it once and the result is stored in Supabase. All students in the class pull the same pre-computed reading guide at zero AI cost.

**Why:** Without this, every student session triggers a full paper analysis (expensive). With this, you pay one large call per assignment and small calls per student interaction.

**Cost structure:**
- 1 Gemini call per assignment (heavy — full paper analysis, generates reading guide)
- N Gemini calls per student per paper (light — checkpoint evaluation, jargon lookup, "So What?" evaluation)

**Note:** The assignment has a `processing` status while Gemini generates the guide (10–30 seconds). Teacher sees a progress indicator. Once done, status moves to `draft` for review, then `published` when ready for students.

---

### 3. MVP scope: Teacher assigns + students complete + teacher sees responses + class-wide patterns
**Decision:** B at minimum (teacher assigns, students complete, teacher sees each student's checkpoint responses), ideally C (class-wide patterns showing common misconceptions).

**Why:** C isn't much harder than B — if checkpoint responses are already stored per student, generating class insights is just one aggregation + one Gemini call over all responses. Store the result in `assignment_insights`, don't regenerate it.

---

### 4. Class enrollment via class code + student name
**Decision:** Teacher creates a class, gets a short class code (e.g. `BIO-4X2K`), shares it out-of-band. Student signs up with email + password + their display name, enters the class code, enrolled instantly.

**Why:** Simple. No complex invite flows, no roster imports, no teacher approval gates. The class code is the gate.

**Additional:** Teacher can remove any student from the roster at any time. Their session data is retained (for records) but they lose access to assignments.

---

### 5. Text extraction as primary reading mode; PDF viewer as fallback
**Decision:** Students read extracted text (not raw PDF) inside the app. The AI can work with structured text per section, inline figures/tables/diagrams are rendered alongside the prose.

**Why:** Extracted text is easier to work with for section detection, guiding questions, and inline jargon highlighting. Better reading experience than a PDF viewer.

**Fallback:** If extraction produces garbled output (heavily formatted sections, equations, complex layouts), the section falls back to the PDF viewer. Checkpoints still work identically.

**Important:** Figures, tables, and diagrams must be extracted too — not just prose. These are essential to understanding a research paper, especially the Results section. PyMuPDF can extract these as images alongside text.

---

### 6. PDF upload only for MVP paper ingestion
**Decision:** Teachers assign papers by uploading a PDF. DOI lookup and keyword search are out of scope for MVP.

**Why:** Simplest path. Teachers typically already have the PDF they want to assign.

**Future:** DOI lookup and keyword search (reusing PaperPulse's OpenAlex/Semantic Scholar pipeline) will be added when self-study mode is built.

---

### 7. AI auto-generates reading guide; teacher reviews and tweaks before publishing
**Decision:** Hybrid approach. Gemini automatically detects sections, generates guiding questions, identifies key terms, and assigns difficulty. Teacher sees this in a review UI, can edit anything, then publishes.

**Why:** Teacher shouldn't have to build the guide from scratch — that's what the AI is for. But teacher knows their students and curriculum, so they need the ability to adjust. The AI does the heavy lifting, the teacher adds judgment.

**Teacher can add:** Personal notes to any section (visible to students as teacher commentary alongside the AI questions).

---

## Feature Breakdown

### The Reading Roadmap
When a student opens an assignment, they see the paper's structure as a visual section list (Abstract → Introduction → Methods → Results → Discussion → Conclusion). Sections unlock sequentially — you can't skip to the Discussion without completing Methods. This enforces the reading skill, not just the reading.

### Guiding Questions (before the text)
For each section, guiding questions appear *before* the student reads the text. "In the Methods section, look for: Who was studied? How many? What did researchers measure?" Students know what to look for before they read, not after. This mirrors how experienced researchers approach papers.

### Active Reading Checkpoints
After reading each section, the student writes what they understood in their own words. The AI gives feedback: "You captured the main finding, but you missed that the sample size was only 42 participants — why might that matter?" The student's original response is preserved and shown alongside the feedback — it's never replaced. The AI never rewrites the student's answer.

### Jargon On-Demand
Students can highlight any term they don't understand and request an explanation in plain English, in the context of this specific paper. Jargon is NOT auto-decoded (unlike PaperPulse). The act of identifying what you don't know is itself the skill being taught.

### The "So What?" Exercise
After completing all sections, the student writes a one-paragraph summary of the paper's significance. The AI evaluates it against the paper's actual claims and gives targeted feedback — flagging overstatements ("cures" vs. "reduced symptoms by 30%") and mischaracterizations. This is the synthesis step.

### Teacher Dashboard
- **Class view:** Student roster with per-assignment progress indicators
- **Assignment drill-down:** See each student's checkpoint responses inline; see class-wide insights (most common misconception per section, most commonly grasped concept)
- **Class insights:** Generated on-demand after enough students complete a section, then cached. Not regenerated per student.

### Future: Pattern Recognition Across Papers
After a student has read 3–5 papers, the tool starts asking meta-questions: "You've now read three RCTs. What do they all have in common structurally? How did each handle their control group differently?" This builds transferable skill beyond any individual paper. Out of scope for MVP.

---

## The Prompt Engineering Is the Product

In PaperPulse, prompts say "summarize this." In ReadLabs, the prompts need to coach without spoon-feeding. The checkpoint feedback prompt is the most critical piece:

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

Getting the tone and pedagogical approach right in this prompt is the core IP of the product. It will be iterated on heavily during testing.

---

## Out of Scope for MVP

- Student self-study mode (no teacher, self-assigned papers)
- DOI / keyword paper search
- Pattern recognition across multiple papers
- School SSO / LMS integration
- Mobile-optimized UI
- Notifications / email reminders

---

## Recommended First Steps (Before Writing Code)

1. **Talk to teachers first.** Ask: What do students consistently get wrong when reading papers? Where do they get stuck? What do you wish they could practice independently? This research shapes the guiding questions and checkpoint prompts.

2. **Iterate on prompts before building UI.** The checkpoint feedback prompt should be tested manually (paste in student responses + paper sections, see if the output is actually useful) before the UI is built around it.

3. **Build student reading flow first, teacher dashboard second (build order).** The student reading experience must exist before the teacher dashboard has anything to show. This is about build sequence, not release order.

---

## Go-To-Market Strategy

**Teachers first. Self-study mode only if the classroom product succeeds.**

Teachers are the first and only exposure to the tool during the initial phase. Self-study (students finding and assigning their own papers without a teacher) is explicitly held back until the classroom product is validated.

**Why this is the right call:**

- **Cost control** — Teachers gate the volume. One teacher assigns one paper: one processing call, then small per-student calls for interactions. Self-study opens unpredictable individual usage with no natural throttle.
- **Faster validation** — One teacher with 30 students gives 30 data points on whether the checkpoint prompts actually teach anything. Individual self-study users churn quietly; a teacher whose class struggled will tell you exactly why.
- **Distribution** — One satisfied teacher recommends it to colleagues. That's the growth mechanism early on, not SEO or app store discovery.

Self-study mode (DOI lookup, keyword search, no teacher required) is the right Phase 2 — but only after the classroom product proves the learning experience works.
