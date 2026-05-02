# ReadingPage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-extraction ReadingPage with a three-panel PDF-centric layout (collapsible sections sidebar, PDF viewer, resizable AI guidance panel).

**Architecture:** The existing monolithic `ReadingPage.jsx` (~1180 lines) gets replaced with a cleaner component that composes three child components. A new backend endpoint serves signed PDF URLs from Supabase Storage. The session creation endpoint is extended to return `paper_id`.

**Tech Stack:** react-pdf (PDF.js wrapper), existing FastAPI backend, Supabase Storage signed URLs, existing Tailwind CSS theme variables.

---

## File Structure

### Backend
| File | Action | Responsibility |
|------|--------|----------------|
| `backend/routers/papers.py` | Modify | Add `GET /papers/{paper_id}/pdf-url` endpoint |
| `backend/routers/sessions.py` | Modify | Include `paper_id` in session start response |
| `backend/tests/test_papers.py` | Modify | Add test for the new PDF URL endpoint |

### Frontend
| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/package.json` | Modify | Add `react-pdf` dependency |
| `frontend/src/lib/api.js` | Modify | Add `getPdfUrl(paperId)` helper |
| `frontend/src/pages/student/ReadingPage.jsx` | Rewrite | Three-panel layout shell, state management |
| `frontend/src/components/reading/SectionsSidebar.jsx` | Create | Left panel: section list, collapse toggle, structure coach |
| `frontend/src/components/reading/PdfViewer.jsx` | Create | Center panel: react-pdf rendering, page controls |
| `frontend/src/components/reading/AiGuidancePanel.jsx` | Create | Right panel: guiding questions, checkpoint, critical prompts, jargon |

---

### Task 1: Backend — Add PDF URL endpoint

**Files:**
- Modify: `backend/routers/papers.py`
- Modify: `backend/tests/test_papers.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_papers.py`:

```python
def test_get_pdf_url_requires_auth():
    r = api_client.get("/api/v1/papers/p-1/pdf-url")
    assert r.status_code == 401


def test_get_pdf_url_returns_signed_url():
    import json
    mock_student = {"sub": "student-uuid-1"}

    # Mock DB: paper lookup -> returns pdf_path
    mock_db = MagicMock()
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.single.return_value = chain
    chain.execute = AsyncMock(return_value=MagicMock(
        data={"id": "p-1", "pdf_path": "papers/teacher-1/abc.pdf", "uploaded_by": "teacher-1"}
    ))
    mock_db.from_ = MagicMock(return_value=chain)

    # Mock Supabase storage signed URL
    mock_signed = "https://project.supabase.co/storage/v1/object/sign/papers/teacher-1/abc.pdf?token=xyz"

    app.dependency_overrides[_get_db] = lambda: mock_db
    app.dependency_overrides[require_student] = lambda: mock_student
    try:
        with patch("backend.routers.papers._get_storage_client") as mock_storage:
            mock_bucket = MagicMock()
            mock_storage.return_value.storage.from_.return_value = mock_bucket
            mock_bucket.create_signed_url.return_value = {"signedURL": mock_signed}

            r = api_client.get("/api/v1/papers/p-1/pdf-url")
    finally:
        app.dependency_overrides.pop(_get_db, None)
        app.dependency_overrides.pop(require_student, None)

    assert r.status_code == 200
    assert r.json()["url"] == mock_signed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/prash/OneDrive/Desktop/ReadLabAI && python -m pytest backend/tests/test_papers.py::test_get_pdf_url_returns_signed_url -v`
Expected: FAIL — `AttributeError` or 404 (endpoint doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Add to `backend/routers/papers.py` after the `get_paper` endpoint:

```python
@router.get("/{paper_id}/pdf-url")
async def get_pdf_url(paper_id: str, db=Depends(get_db), user=Depends(require_student)):
    result = await db.from_("papers").select("id, pdf_path").eq("id", paper_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Paper not found")

    pdf_path = result.data["pdf_path"]
    if not pdf_path:
        raise HTTPException(status_code=404, detail="No PDF stored for this paper")

    # pdf_path is stored as "papers/user-id/uuid.pdf" — strip bucket prefix for storage API
    object_path = pdf_path.removeprefix("papers/")

    def _create_signed_url():
        client = _get_storage_client()
        resp = client.storage.from_("papers").create_signed_url(object_path, expires_in=3600)
        return resp

    signed = await asyncio.to_thread(_create_signed_url)
    signed_url = f"{settings.supabase_url}/storage/v1{signed.get('signedURL', '')}"

    return {"url": signed_url}
```

Add `require_student` to the imports at the top of `papers.py`:

```python
from backend.deps import require_teacher, require_student
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/prash/OneDrive/Desktop/ReadLabAI && python -m pytest backend/tests/test_papers.py::test_get_pdf_url_requires_auth backend/tests/test_papers.py::test_get_pdf_url_returns_signed_url -v`
Expected: Both PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/papers.py backend/tests/test_papers.py
git commit -m "feat: add GET /papers/{paper_id}/pdf-url endpoint for signed PDF URLs"
```

---

### Task 2: Backend — Return paper_id from session creation

**Files:**
- Modify: `backend/routers/sessions.py` (line ~100-108, the return dict in `start_session`)

- [ ] **Step 1: Update the session start response to include `paper_id`**

In `backend/routers/sessions.py`, the `start_session` function at line ~100 already queries the paper:

```python
paper = await db.from_("papers").select("title") \
    .eq("id", assignment.data["paper_id"]).single().execute()
```

Change it to also select `id`:

```python
paper = await db.from_("papers").select("id, title") \
    .eq("id", assignment.data["paper_id"]).single().execute()
```

Then add `paper_id` to the return dict (currently at line ~100-108):

```python
return {
    "session_id": session["id"],
    "assignment_id": body.assignment_id,
    "paper_id": assignment.data["paper_id"],
    "status": session["status"],
    "current_section_index": session["current_section_index"],
    "reading_guide": assignment.data["reading_guide"],
    "paper_title": paper.data["title"] if paper.data else "Unknown",
    "difficulty": assignment.data["difficulty"],
}
```

- [ ] **Step 2: Verify the existing session test still passes**

Run: `cd /c/Users/prash/OneDrive/Desktop/ReadLabAI && python -m pytest backend/tests/test_sessions.py -v`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add backend/routers/sessions.py
git commit -m "feat: return paper_id in session creation response"
```

---

### Task 3: Frontend — Install react-pdf and add PDF URL helper

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/lib/api.js`

- [ ] **Step 1: Install react-pdf**

Run: `cd /c/Users/prash/OneDrive/Desktop/ReadLabAI/frontend && npm install react-pdf`

This adds `react-pdf` and its peer dependency `pdfjs-dist` to `package.json`.

- [ ] **Step 2: Add the `getPdfUrl` helper to `frontend/src/lib/api.js`**

Add after the existing `papersApi` object (around line 41):

```javascript
// ── PDF URL ────────────────────────────────────────────────────────────────
export const getPdfUrl = (paperId) => api.get(`/papers/${paperId}/pdf-url`).then((r) => r.data);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/api.js
git commit -m "feat: install react-pdf and add getPdfUrl API helper"
```

---

### Task 4: Frontend — Create PdfViewer component

**Files:**
- Create: `frontend/src/components/reading/PdfViewer.jsx`

- [ ] **Step 1: Create the component directory**

Run: `mkdir -p frontend/src/components/reading`

- [ ] **Step 2: Write the PdfViewer component**

Create `frontend/src/components/reading/PdfViewer.jsx`:

```jsx
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ url }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [fitWidth, setFitWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
  }, []);

  const goToPage = (n) => {
    if (numPages && n >= 1 && n <= numPages) setPageNumber(n);
  };

  const zoomIn = () => { setFitWidth(false); setScale((s) => Math.min(s + 0.25, 3.0)); };
  const zoomOut = () => { setFitWidth(false); setScale((s) => Math.max(s - 0.25, 0.5)); };
  const toggleFitWidth = () => setFitWidth((f) => !f);

  const onRenderSuccess = useCallback(() => {
    if (!fitWidth || !containerWidth) return;
    const pageEl = document.querySelector(".react-pdf__Page");
    if (pageEl) {
      const pageWidth = pageEl.getBoundingClientRect().width;
      if (pageWidth > containerWidth) {
        setScale((s) => Math.max(containerWidth / pageWidth * s, 0.5));
      }
    }
  }, [fitWidth, containerWidth]);

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-secondary)]">
        Loading PDF...
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-w-0"
      ref={(el) => { if (el) setContainerWidth(el.getBoundingClientRect().width); }}
    >
      {/* PDF controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border text-xs text-[var(--color-text-secondary)] shrink-0">
        <button onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} className="disabled:opacity-30 hover:text-[var(--color-text)]">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span>{pageNumber} / {numPages || "—"}</span>
        <button onClick={() => goToPage(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages} className="disabled:opacity-30 hover:text-[var(--color-text)]">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button onClick={zoomOut} className="hover:text-[var(--color-text)]"><ZoomOut className="w-3.5 h-3.5" /></button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="hover:text-[var(--color-text)]"><ZoomIn className="w-3.5 h-3.5" /></button>
        <button onClick={toggleFitWidth} className={`hover:text-[var(--color-text)] ${fitWidth ? "text-primary" : ""}`}>
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* PDF document */}
      <div className="flex-1 overflow-auto bg-[var(--color-bg)] flex justify-center py-6">
        <Document file={url} onLoadSuccess={onDocumentLoadSuccess} loading={
          <div className="flex items-center justify-center h-64 text-[var(--color-text-secondary)]">
            Loading PDF...
          </div>
        }>
          <Page
            pageNumber={pageNumber}
            scale={scale}
            onRenderSuccess={onRenderSuccess}
            loading={
              <div className="w-[595px] h-[842px] bg-muted animate-pulse rounded" />
            }
          />
        </Document>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/reading/PdfViewer.jsx
git commit -m "feat: create PdfViewer component with react-pdf"
```

---

### Task 5: Frontend — Create SectionsSidebar component

**Files:**
- Create: `frontend/src/components/reading/SectionsSidebar.jsx`

- [ ] **Step 1: Write the SectionsSidebar component**

Create `frontend/src/components/reading/SectionsSidebar.jsx`:

```jsx
import { Check, SkipForward } from "lucide-react";

const SECTION_TYPE_COLORS = {
  Introduction: "bg-blue-500/20 text-blue-300",
  Methods: "bg-purple-500/20 text-purple-300",
  Results: "bg-green-500/20 text-green-300",
  Discussion: "bg-amber-500/20 text-amber-300",
  Other: "bg-muted text-[var(--color-text-secondary)]",
};

const SECTION_TYPE_TIPS = {
  Introduction: "Look for: the research gap, the main claim, and how the authors position their work.",
  Methods: "Look for: study design, sample size, controls, and statistical tests.",
  Results: "Look for: key findings, statistical significance, and effect sizes.",
  Discussion: "Look for: limitations, implications, future directions, and how findings connect to the field.",
  Other: "Read for context and supporting information.",
};

export default function SectionsSidebar({
  sections,
  currentSection,
  setCurrentSection,
  checkpoints,
  showSoWhat,
  soWhatDone,
  showQuiz,
  collapsed,
  setCollapsed,
  previewMode,
  optionalCheckpoints,
}) {
  const isLastSection = currentSection === sections.length - 1;

  if (collapsed) {
    return (
      <div className="w-11 shrink-0 bg-surface border-r border-border flex flex-col items-center py-3 gap-1">
        <button
          onClick={() => setCollapsed(false)}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-2"
          title="Expand sections"
        >
          →
        </button>
        {sections.map((s, i) => {
          const cp = checkpoints[i] || {};
          const done = !!cp.ai_feedback;
          const skipped = !!cp.skipped;
          const active = i === currentSection;
          const locked = !previewMode && i > currentSection && !done;
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => { if (!locked) { setCollapsed(false); setCurrentSection(i); }}}
              title={s.title}
              className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-colors ${
                active ? "bg-primary text-white" :
                done ? "bg-primary/20 text-primary" :
                skipped ? "bg-muted text-[var(--color-text-secondary)]" :
                locked ? "bg-muted text-[var(--color-text-secondary)] opacity-40" :
                "bg-muted text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              }`}
            >
              {done ? <Check className="w-3 h-3" /> : skipped ? <SkipForward className="w-3 h-3" /> : i + 1}
            </button>
          );
        })}
        {showSoWhat && (
          <button
            onClick={() => { setCollapsed(false); setCurrentSection(sections.length); }}
            title="So What?"
            className={`w-7 h-7 rounded flex items-center justify-center text-xs ${
              currentSection === sections.length ? "bg-primary text-white" : "bg-muted text-[var(--color-text-secondary)]"
            }`}
          >
            ?
          </button>
        )}
        {showQuiz && (
          <button
            onClick={() => { setCollapsed(false); setCurrentSection(sections.length + 1); }}
            title="Quiz"
            className={`w-7 h-7 rounded flex items-center justify-center text-xs ${
              currentSection === sections.length + 1 ? "bg-primary text-white" : "bg-muted text-[var(--color-text-secondary)]"
            }`}
          >
            Q
          </button>
        )}
      </div>
    );
  }

  // Expanded state
  return (
    <div className="w-52 shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Sections</span>
        <button onClick={() => setCollapsed(true)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-sm">←</button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {sections.map((s, i) => {
          const cp = checkpoints[i] || {};
          const done = !!cp.ai_feedback;
          const skipped = !!cp.skipped;
          const active = i === currentSection;
          const locked = !previewMode && i > currentSection && !done;
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => !locked && setCurrentSection(i)}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                active ? "bg-primary text-white" :
                locked ? "text-[var(--color-text-secondary)] cursor-not-allowed opacity-50" :
                skipped ? "text-[var(--color-text-secondary)]" :
                "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-muted"
              }`}
            >
              {skipped ? (
                <SkipForward className="w-3 h-3 text-[var(--color-text-secondary)]" />
              ) : done ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <span className="text-[var(--color-text-secondary)] text-xs">{i + 1}</span>
              )}
              <span className="truncate">{s.title}</span>
              {s.section_type && (
                <span className={`text-xs px-1 rounded shrink-0 ${SECTION_TYPE_COLORS[s.section_type] || SECTION_TYPE_COLORS.Other}`}>
                  {s.section_type.slice(0, 1)}
                </span>
              )}
            </button>
          );
        })}
        {showSoWhat && (
          <button
            onClick={() => setCurrentSection(sections.length)}
            className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
              currentSection === sections.length ? "bg-primary text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-muted"
            }`}
          >
            So What?
          </button>
        )}
        {showQuiz && (
          <button
            onClick={() => setCurrentSection(sections.length + 1)}
            className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
              currentSection === sections.length + 1 ? "bg-primary text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-muted"
            }`}
          >
            Quiz
          </button>
        )}
      </div>

      {/* Structure Coach */}
      <StructureCoach sections={sections} checkpoints={checkpoints} />
    </div>
  );
}

function StructureCoach({ sections, checkpoints }) {
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
    <div className="px-3 py-3 border-t border-border">
      <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Structure Guide</p>
      <div className="space-y-1">
        {types.map((type) => (
          <div
            key={type}
            className={`text-xs px-2 py-1 rounded flex items-center justify-between ${SECTION_TYPE_COLORS[type] || SECTION_TYPE_COLORS.Other}`}
          >
            <span>{type}</span>
            <span className="text-[var(--color-text-secondary)]">
              {completedCounts[type] || 0}/{typeCounts[type]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/reading/SectionsSidebar.jsx
git commit -m "feat: create SectionsSidebar with expand/collapse and structure coach"
```

---

### Task 6: Frontend — Create AiGuidancePanel component

**Files:**
- Create: `frontend/src/components/reading/AiGuidancePanel.jsx`

- [ ] **Step 1: Write the AiGuidancePanel component**

Create `frontend/src/components/reading/AiGuidancePanel.jsx`:

```jsx
import { useState, useRef, useCallback } from "react";
import { SkipForward, Search } from "lucide-react";
import { getCriticalPrompt } from "../../lib/superpowersApi";
import toast from "react-hot-toast";

export default function AiGuidancePanel({
  // Section content
  section,
  currentSection,
  sections,
  // Checkpoint
  checkpoint,
  setCheckpoint,
  submitCheckpoint,
  skipCheckpoint,
  canAdvance,
  advanceSection,
  isLastSection,
  // So What
  soWhat,
  setSoWhat,
  submitSoWhat,
  // Quiz
  quizQuestions,
  setQuizQuestions,
  quizAnswers,
  setQuizAnswers,
  quizResults,
  setQuizResults,
  quizGenerating,
  setQuizGenerating,
  quizSubmitting,
  setQuizSubmitting,
  currentAssignmentId,
  // Jargon
  lookupJargon,
  jargonExplanation,
  jargonPending,
  // State
  previewMode,
  optionalCheckpoints,
  showSoWhat,
  // Panel resize
  panelWidth,
  panelVisible,
}) {
  const dragRef = useRef(null);
  const isQuizSection = currentSection === sections.length + 1;
  const isSoWhatSection = currentSection === sections.length;

  if (!panelVisible) return null;

  // Quiz helpers
  const startQuiz = async () => {
    if (!currentAssignmentId) return;
    setQuizGenerating(true);
    try {
      const { getQuiz, generateQuiz } = await import("../../lib/superpowersApi");
      let questions = await getQuiz(currentAssignmentId);
      if (questions.length === 0) {
        questions = await generateQuiz(currentAssignmentId);
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
      const { submitQuizAttempt, addXp } = await import("../../lib/superpowersApi");
      const results = await submitQuizAttempt(currentAssignmentId, quizAnswers);
      setQuizResults(results);
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

  return (
    <div
      className="shrink-0 bg-surface border-l border-border flex flex-col relative"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Drag handle */}
      <div
        ref={dragRef}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/30 transition-colors"
      />

      {/* Header */}
      <div className="px-4 py-2 border-b border-border">
        <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">AI Guidance</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isQuizSection ? (
          <QuizContent
            quizQuestions={quizQuestions}
            quizAnswers={quizAnswers}
            setQuizAnswers={setQuizAnswers}
            quizResults={quizResults}
            quizGenerating={quizGenerating}
            quizSubmitting={quizSubmitting}
            startQuiz={startQuiz}
            submitQuiz={submitQuiz}
          />
        ) : isSoWhatSection ? (
          <SoWhatContent
            soWhat={soWhat}
            setSoWhat={setSoWhat}
            submitSoWhat={submitSoWhat}
            previewMode={previewMode}
            optionalCheckpoints={optionalCheckpoints}
          />
        ) : (
          <SectionContent
            section={section}
            currentSection={currentSection}
            currentAssignmentId={currentAssignmentId}
            checkpoint={checkpoint}
            setCheckpoint={setCheckpoint}
            submitCheckpoint={submitCheckpoint}
            skipCheckpoint={skipCheckpoint}
            canAdvance={canAdvance}
            advanceSection={advanceSection}
            isLastSection={isLastSection}
            showSoWhat={showSoWhat}
            previewMode={previewMode}
            optionalCheckpoints={optionalCheckpoints}
            lookupJargon={lookupJargon}
            jargonExplanation={jargonExplanation}
            jargonPending={jargonPending}
          />
        )}
      </div>
    </div>
  );
}

function SectionContent({
  section,
  currentSection,
  currentAssignmentId,
  checkpoint,
  setCheckpoint,
  submitCheckpoint,
  skipCheckpoint,
  canAdvance,
  advanceSection,
  isLastSection,
  showSoWhat,
  previewMode,
  optionalCheckpoints,
  lookupJargon,
  jargonExplanation,
  jargonPending,
}) {
  const [criticalPrompt, setCriticalPrompt] = useState(null);
  const [criticalPromptOpen, setCriticalPromptOpen] = useState(false);
  const [jargonTerm, setJargonTerm] = useState("");

  const loadCriticalPrompt = async () => {
    if (!currentAssignmentId || previewMode) return;
    try {
      const data = await getCriticalPrompt(currentAssignmentId, currentSection);
      setCriticalPrompt(data);
      setCriticalPromptOpen(true);
    } catch { /* silently skip */ }
  };

  const handleJargonLookup = () => {
    if (!jargonTerm.trim()) return;
    lookupJargon(jargonTerm.trim());
  };

  if (!section) return null;

  return (
    <>
      {/* Section title */}
      <h2 className="text-[var(--color-text)] font-semibold text-base mb-1">{section.title}</h2>

      {/* Guiding questions */}
      <div className="mb-4">
        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Before you read</p>
        <ul className="space-y-1.5">
          {(section.guiding_questions || []).map((q, i) => (
            <li key={i} className="text-[var(--color-text)] text-sm flex gap-2">
              <span className="text-primary shrink-0">→</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Checkpoint */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Your response</p>
        <textarea
          rows={4}
          value={checkpoint?.text || ""}
          onChange={(e) => setCheckpoint(e.target.value)}
          placeholder="What did you find in this section? Address the guiding questions above."
          disabled={!!checkpoint?.ai_feedback}
          className="input-field resize-none disabled:opacity-60"
        />
        {!checkpoint?.ai_feedback && !checkpoint?.skipped && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitCheckpoint}
              disabled={checkpoint?.pending || !checkpoint?.text?.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {checkpoint?.pending ? "Getting feedback..." : "Submit"}
            </button>
            {optionalCheckpoints && (
              <button onClick={skipCheckpoint} className="btn-secondary text-sm flex items-center gap-1">
                <SkipForward className="w-3.5 h-3.5" /> Skip
              </button>
            )}
          </div>
        )}
        {checkpoint?.skipped && !checkpoint?.ai_feedback && optionalCheckpoints && (
          <p className="mt-2 text-[var(--color-text-secondary)] text-xs italic">Section skipped. You can come back and submit a response later.</p>
        )}
        {checkpoint?.pending && (
          <div className="mt-3 flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
            <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            AI is reviewing your response...
          </div>
        )}
        {checkpoint?.ai_feedback && (
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary">
            {checkpoint.ai_feedback}
          </div>
        )}
      </div>

      {/* Navigation */}
      {canAdvance && !isLastSection && (
        <button onClick={advanceSection} className="mt-3 text-sm text-primary hover:text-primary-hover underline">
          Next Section →
        </button>
      )}
      {canAdvance && isLastSection && !showSoWhat && (
        <button onClick={advanceSection} className="mt-3 text-sm text-primary hover:text-primary-hover underline">
          Finish → So What?
        </button>
      )}

      {/* Critical thinking prompt */}
      <div className="border-t border-border pt-3 mt-3">
        {!criticalPrompt && !criticalPromptOpen ? (
          <button onClick={loadCriticalPrompt} className="text-xs text-[var(--color-text-secondary)] hover:text-primary underline transition-colors">
            Critical thinking prompt →
          </button>
        ) : criticalPrompt ? (
          <div className="border border-primary/20 rounded-lg p-3 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-primary uppercase tracking-wider font-medium">Critical Thinking</span>
              <button onClick={() => { setCriticalPromptOpen(false); setCriticalPrompt(null); }} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-sm">×</button>
            </div>
            <p className="text-[var(--color-text)] text-sm leading-relaxed">{criticalPrompt.prompt_text}</p>
            <span className="text-xs text-[var(--color-text-secondary)] capitalize mt-1 block">{criticalPrompt.prompt_type}</span>
          </div>
        ) : null}
      </div>

      {/* Jargon lookup */}
      <div className="border-t border-border pt-3 mt-3">
        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Look up a term</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter term..."
            value={jargonTerm}
            onChange={(e) => setJargonTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleJargonLookup(); }}
            className="input-field flex-1"
          />
          <button onClick={handleJargonLookup} disabled={!jargonTerm.trim()} className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-50">
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
        {jargonPending && (
          <div className="mt-2 flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
            <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Looking up...
          </div>
        )}
        {jargonExplanation && !jargonPending && (
          <div className="mt-2 bg-muted rounded-lg p-3 text-sm text-[var(--color-text)] leading-relaxed">
            {jargonExplanation}
          </div>
        )}
      </div>
    </>
  );
}

function SoWhatContent({ soWhat, setSoWhat, submitSoWhat, previewMode, optionalCheckpoints }) {
  return (
    <>
      <h2 className="text-[var(--color-text)] font-semibold text-lg mb-1">So What?</h2>
      <p className="text-[var(--color-text-secondary)] text-sm mb-4">
        In 2–3 sentences: what does this paper contribute, and why does it matter?
      </p>
      <textarea
        rows={5}
        value={soWhat?.text || ""}
        onChange={(e) => setSoWhat(e.target.value)}
        disabled={!!soWhat?.ai_feedback}
        placeholder="Describe the paper's significance in your own words..."
        className="input-field resize-none disabled:opacity-60"
      />
      {!soWhat?.ai_feedback && !soWhat?.skipped && (
        <div className="mt-2 flex gap-2">
          <button onClick={submitSoWhat} disabled={soWhat?.pending || !soWhat?.text?.trim()} className="btn-primary mt-2 text-sm disabled:opacity-50">
            {soWhat?.pending ? "Getting feedback..." : "Submit"}
          </button>
          {optionalCheckpoints && (
            <button onClick={() => setSoWhat({ ...soWhat, skipped: true })} className="btn-secondary mt-2 text-sm flex items-center gap-1">
              <SkipForward className="w-3.5 h-3.5" /> Skip
            </button>
          )}
        </div>
      )}
      {soWhat?.pending && (
        <div className="mt-3 flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
          <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          AI is evaluating your summary...
        </div>
      )}
      {soWhat?.ai_feedback && (
        <>
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary">
            {soWhat.ai_feedback}
          </div>
          {!previewMode && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-success/30 rounded-lg text-success text-sm font-medium">
              You've completed this assignment!
            </div>
          )}
        </>
      )}
    </>
  );
}

function QuizContent({
  quizQuestions, quizAnswers, setQuizAnswers,
  quizResults, quizGenerating, quizSubmitting,
  startQuiz, submitQuiz,
}) {
  if (quizResults) {
    const pct = Math.round((quizResults.score / quizResults.max_score) * 100);
    return (
      <>
        <h2 className="text-[var(--color-text)] font-semibold text-lg mb-4">Quiz Results</h2>
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-4">
          <p className="text-3xl font-bold text-[var(--color-text)]">{pct}%</p>
          <p className="text-primary text-sm">{quizResults.score} / {quizResults.max_score} points</p>
        </div>
        <div className="space-y-3">
          {quizResults.results.map((r) => {
            const q = quizQuestions.find((q) => q.id === r.question_id);
            return (
              <div key={r.question_id} className={`rounded-lg p-3 ${r.score === r.max ? "bg-emerald-500/10 border border-success/30" : "bg-red-900/20 border border-red-800/40"}`}>
                <p className="text-[var(--color-text)] text-sm font-medium mb-1">{q?.question_text}</p>
                <p className="text-[var(--color-text-secondary)] text-xs">Correct: {r.correct_answer}</p>
                <p className="text-[var(--color-text-secondary)] text-xs mt-1 italic">{r.explanation}</p>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  if (quizQuestions.length > 0) {
    const allAnswered = quizQuestions.every((q) => quizAnswers[q.id]?.trim());
    return (
      <>
        <h2 className="text-[var(--color-text)] font-semibold text-lg mb-4">Comprehension Quiz</h2>
        <div className="space-y-5">
          {quizQuestions.map((q, i) => (
            <div key={q.id} className="card p-4">
              <p className="text-[var(--color-text)] text-sm font-medium mb-3">{i + 1}. {q.question_text}</p>
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
                        className="text-primary"
                      />
                      <span className="text-[var(--color-text)] text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={3}
                  value={quizAnswers[q.id] || ""}
                  onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Your answer..."
                  className="input-field resize-none"
                />
              )}
            </div>
          ))}
        </div>
        <button onClick={submitQuiz} disabled={!allAnswered || quizSubmitting} className="btn-primary mt-4 text-sm disabled:opacity-50">
          {quizSubmitting ? "Grading..." : "Submit Quiz"}
        </button>
      </>
    );
  }

  return (
    <>
      <h2 className="text-[var(--color-text)] font-semibold text-lg mb-2">Test Your Understanding</h2>
      <p className="text-[var(--color-text-secondary)] text-sm mb-4">
        Answer 5 questions to check your comprehension of this paper.
      </p>
      <button onClick={startQuiz} disabled={quizGenerating} className="btn-primary text-sm disabled:opacity-50">
        {quizGenerating ? "Generating quiz..." : "Generate Quiz"}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/reading/AiGuidancePanel.jsx
git commit -m "feat: create AiGuidancePanel with checkpoint, critical prompts, jargon, quiz"
```

---

### Task 7: Frontend — Rewrite ReadingPage with three-panel layout

**Files:**
- Rewrite: `frontend/src/pages/student/ReadingPage.jsx`

- [ ] **Step 1: Rewrite ReadingPage.jsx**

This replaces the entire 1180-line file. The new version composes the three child components and manages shared state.

```jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import { getPdfUrl } from "../../lib/api";
import toast from "react-hot-toast";
import { addXp } from "../../lib/superpowersApi";
import SectionsSidebar from "../../components/reading/SectionsSidebar";
import PdfViewer from "../../components/reading/PdfViewer";
import AiGuidancePanel from "../../components/reading/AiGuidancePanel";
import { PanelLeftClose, PanelRight } from "lucide-react";

export default function ReadingPage({ previewMode = false, optionalCheckpoints = false }) {
  const { assignmentId } = useParams();

  // Session state
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [readingGuide, setReadingGuide] = useState(null);
  const [paperTitle, setPaperTitle] = useState("");
  const [paperId, setPaperId] = useState(null);
  const [currentSection, setCurrentSection] = useState(0);

  // PDF state
  const [pdfUrl, setPdfUrl] = useState(null);

  // Checkpoint state: { [sectionIndex]: { text, ai_feedback, pending, skipped } }
  const [checkpoints, setCheckpoints] = useState({});

  // So What state
  const [soWhat, setSoWhat] = useState({ text: "", ai_feedback: null, pending: false, skipped: false });

  // Jargon state
  const [jargonExplanation, setJargonExplanation] = useState(null);
  const [jargonPending, setJargonPending] = useState(false);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState(null);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [currentAssignmentId, setCurrentAssignmentId] = useState(null);

  // Layout state
  const [sectionsCollapsed, setSectionsCollapsed] = useState(
    () => localStorage.getItem("readlab_sections_collapsed") === "true"
  );
  const [aiPanelWidth, setAiPanelWidth] = useState(
    () => parseInt(localStorage.getItem("readlab_ai_panel_width") || "340", 10)
  );
  const [aiPanelVisible, setAiPanelVisible] = useState(true);

  const pollRef = useRef(null);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (previewMode) initPreview();
    else initSession();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const initPreview = async () => {
    try {
      const { data } = await api.get(`/assignments/${assignmentId}`);
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper Preview");
      setLoading(false);
    } catch (err) {
      toast.error(err.message || "Could not load assignment");
    }
  };

  const initSession = async () => {
    try {
      const { data } = await api.post("/sessions/", { assignment_id: assignmentId });
      setSessionId(data.session_id);
      setCurrentAssignmentId(data.assignment_id);
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper");
      setPaperId(data.paper_id);
      setCurrentSection(data.current_section_index || 0);

      // Hydrate checkpoints
      const cpMap = {};
      (data.checkpoints || []).forEach((cp) => {
        cpMap[cp.section_index] = {
          text: cp.student_text,
          ai_feedback: cp.ai_feedback,
          pending: !cp.ai_feedback && !!cp.student_text,
        };
      });
      setCheckpoints(cpMap);
      if (data.sowhat) {
        setSoWhat({ text: data.sowhat.student_text, ai_feedback: data.sowhat.ai_feedback, pending: !data.sowhat.ai_feedback });
      }

      // Fetch PDF URL
      if (data.paper_id) {
        try {
          const pdfData = await getPdfUrl(data.paper_id);
          setPdfUrl(pdfData.url);
        } catch {
          toast.error("Could not load PDF");
        }
      }
      setLoading(false);
    } catch (err) {
      setLoading(false);
      toast.error(err.message || "Could not start session");
    }
  };

  // ── Polling ────────────────────────────────────────────────────────────────

  const startPolling = useCallback((sid) => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/sessions/${sid}`);
        let pending = false;

        const cpMap = {};
        (data.checkpoints || []).forEach((cp) => {
          cpMap[cp.section_index] = { text: cp.student_text, ai_feedback: cp.ai_feedback, pending: !cp.ai_feedback };
          if (!cp.ai_feedback) pending = true;
        });
        setCheckpoints(cpMap);

        if (data.sowhat) {
          setSoWhat((s) => ({ ...s, ai_feedback: data.sowhat.ai_feedback, pending: !data.sowhat.ai_feedback }));
          if (!data.sowhat.ai_feedback) pending = true;
        }

        if (!pending) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {}
    }, 2000);
  }, []);

  // ── Section navigation ─────────────────────────────────────────────────────

  const advanceSection = async () => {
    const next = currentSection + 1;
    setCurrentSection(next);
    if (!previewMode && sessionId) {
      await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: next }).catch(() => {});
      addXp("section").catch(() => {});
    }
  };

  // ── Checkpoint helpers ─────────────────────────────────────────────────────

  const cp = checkpoints[currentSection] || { text: "", ai_feedback: null, pending: false, skipped: false };

  const updateCpText = (text) => {
    setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], text } }));
  };

  const submitCheckpoint = async () => {
    const text = cp.text || "";
    if (!text.trim()) return;
    setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], pending: true } }));

    if (previewMode) {
      const section = readingGuide.sections[currentSection];
      try {
        const { data } = await api.post("/sessions/preview/checkpoint", {
          section_title: section.title,
          guiding_questions: section.guiding_questions,
          student_text: text,
        });
        setCheckpoints((prev) => ({ ...prev, [currentSection]: { text, ai_feedback: data.feedback, pending: false } }));
      } catch {
        setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], pending: false } }));
        toast.error("Could not get feedback");
      }
      return;
    }

    try {
      await api.post(`/sessions/${sessionId}/checkpoint`, { section_index: currentSection, student_text: text });
      addXp("checkpoint").catch(() => {});
      startPolling(sessionId);
    } catch (err) {
      setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], pending: false } }));
      toast.error(err.message || "Submission failed");
    }
  };

  const skipCheckpoint = async () => {
    setCheckpoints((prev) => ({ ...prev, [currentSection]: { text: "", ai_feedback: null, pending: false, skipped: true } }));
    if (!previewMode && sessionId) {
      await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: currentSection + 1 }).catch(() => {});
    }
    const sections = readingGuide.sections;
    const isLast = currentSection === sections.length - 1;
    const allSectionsComplete = sections.every((_, i) => checkpoints[i]?.ai_feedback);
    if (isLast && !allSectionsComplete) {
      setCurrentSection(sections.length);
    } else if (!isLast) {
      advanceSection();
    }
  };

  // ── So What ────────────────────────────────────────────────────────────────

  const updateSoWhat = (val) => {
    if (typeof val === "string") {
      setSoWhat((s) => ({ ...s, text: val }));
    } else {
      setSoWhat(val);
    }
  };

  const submitSoWhat = async () => {
    if (!soWhat.text.trim()) return;
    setSoWhat((s) => ({ ...s, pending: true }));

    if (previewMode) {
      try {
        const { data } = await api.post("/sessions/preview/sowhat", {
          paper_title: paperTitle,
          section_titles: readingGuide.sections.map((s) => s.title),
          difficulty: readingGuide.difficulty || "intermediate",
          student_text: soWhat.text,
        });
        setSoWhat((s) => ({ ...s, ai_feedback: data.feedback, pending: false }));
      } catch {
        setSoWhat((s) => ({ ...s, pending: false }));
        toast.error("Could not get feedback");
      }
      return;
    }

    try {
      await api.post(`/sessions/${sessionId}/sowhat`, { student_text: soWhat.text });
      addXp("sowhat").catch(() => {});
      startPolling(sessionId);
    } catch (err) {
      setSoWhat((s) => ({ ...s, pending: false }));
      toast.error(err.message || "Submission failed");
    }
  };

  // ── Jargon lookup ──────────────────────────────────────────────────────────

  const lookupJargon = async (term) => {
    const section = readingGuide.sections[currentSection];
    const context = section?.text?.slice(0, 500) || "";
    setJargonPending(true);
    setJargonExplanation(null);

    const endpoint = previewMode ? "/sessions/preview/jargon" : `/sessions/${sessionId}/jargon`;
    try {
      const { data } = await api.post(endpoint, { term, context_snippet: context });
      if (data.explanation) {
        setJargonExplanation(data.explanation);
        setJargonPending(false);
      } else {
        startPolling(sessionId);
      }
    } catch {
      setJargonPending(false);
      toast.error("Lookup failed");
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-[var(--color-text-secondary)]">Loading...</div>;
  if (!readingGuide) return <div className="p-8 text-red-400">Assignment not found.</div>;

  const sections = readingGuide.sections;
  const section = sections[currentSection];
  const allSectionsComplete = sections.every((_, i) => checkpoints[i]?.ai_feedback);
  const canAdvance = previewMode || !!cp.ai_feedback || (optionalCheckpoints && cp.skipped);
  const isLastSection = currentSection === sections.length - 1;
  const showSoWhat = allSectionsComplete || previewMode;
  const showQuiz = (soWhat.ai_feedback || soWhat.skipped);

  // ── Persist layout state ───────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem("readlab_sections_collapsed", sectionsCollapsed);
  }, [sectionsCollapsed]);

  useEffect(() => {
    localStorage.setItem("readlab_ai_panel_width", aiPanelWidth);
  }, [aiPanelWidth]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)]">
      {/* Preview banner */}
      {previewMode && (
        <div className="bg-amber-600/20 border-b border-amber-600/40 px-6 py-2 text-amber-300 text-sm text-center shrink-0">
          Preview Mode — you are viewing this as a student would. Nothing is saved.
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-[var(--color-text-secondary)]">{previewMode ? "Preview" : "Reading"}</p>
          <h1 className="text-[var(--color-text)] font-semibold truncate">{paperTitle}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSectionsCollapsed((c) => !c)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-xs border border-border rounded px-2 py-1 transition-colors flex items-center gap-1"
          >
            <PanelLeftClose className="w-3 h-3" />
            {sectionsCollapsed ? "Sections" : "Hide"}
          </button>
          <button
            onClick={() => setAiPanelVisible((v) => !v)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-xs border border-border rounded px-2 py-1 transition-colors flex items-center gap-1"
          >
            <PanelRight className="w-3 h-3" />
            {aiPanelVisible ? "Hide AI" : "AI Panel"}
          </button>
        </div>
      </div>

      {/* Three-panel body */}
      <div className="flex flex-1 min-h-0">
        <SectionsSidebar
          sections={sections}
          currentSection={currentSection}
          setCurrentSection={setCurrentSection}
          checkpoints={checkpoints}
          showSoWhat={showSoWhat}
          soWhatDone={!!soWhat.ai_feedback}
          showQuiz={showQuiz}
          collapsed={sectionsCollapsed}
          setCollapsed={setSectionsCollapsed}
          previewMode={previewMode}
          optionalCheckpoints={optionalCheckpoints}
        />

        <PdfViewer url={pdfUrl} />

        <AiGuidancePanel
          section={section}
          currentSection={currentSection}
          sections={sections}
          checkpoint={cp}
          setCheckpoint={updateCpText}
          submitCheckpoint={submitCheckpoint}
          skipCheckpoint={skipCheckpoint}
          canAdvance={canAdvance}
          advanceSection={advanceSection}
          isLastSection={isLastSection}
          soWhat={soWhat}
          setSoWhat={updateSoWhat}
          submitSoWhat={submitSoWhat}
          quizQuestions={quizQuestions}
          setQuizQuestions={setQuizQuestions}
          quizAnswers={quizAnswers}
          setQuizAnswers={setQuizAnswers}
          quizResults={quizResults}
          setQuizResults={setQuizResults}
          quizGenerating={quizGenerating}
          setQuizGenerating={setQuizGenerating}
          quizSubmitting={quizSubmitting}
          setQuizSubmitting={setQuizSubmitting}
          currentAssignmentId={currentAssignmentId}
          lookupJargon={lookupJargon}
          jargonExplanation={jargonExplanation}
          jargonPending={jargonPending}
          previewMode={previewMode}
          optionalCheckpoints={optionalCheckpoints}
          showSoWhat={showSoWhat}
          panelWidth={aiPanelWidth}
          panelVisible={aiPanelVisible}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app loads**

Run: `cd /c/Users/prash/OneDrive/Desktop/ReadLabAI/frontend && npm start`
Open the browser and navigate to a reading page. Verify:
- Three-panel layout renders (sections left, PDF center, AI panel right)
- Sections collapse/expand via the header button
- AI panel toggles via the header button
- No console errors related to missing imports

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/student/ReadingPage.jsx
git commit -m "feat: rewrite ReadingPage with three-panel PDF-centric layout"
```

---

### Task 8: Frontend — Add draggable resize to AI panel

**Files:**
- Modify: `frontend/src/components/reading/AiGuidancePanel.jsx`

- [ ] **Step 1: Add drag-to-resize logic**

Add the `useEffect` for drag handling inside the `AiGuidancePanel` component, right before the `if (!panelVisible)` guard:

```jsx
import { useState, useRef, useCallback, useEffect } from "react";
```

Then inside the component function, after `const dragRef = useRef(null);`, add:

```jsx
  const [internalWidth, setInternalWidth] = useState(panelWidth);
  const MIN_WIDTH = 280;
  const MAX_WIDTH = 500;

  // Sync external width prop
  useEffect(() => { setInternalWidth(panelWidth); }, [panelWidth]);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = internalWidth;

    const handleDragMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setInternalWidth(newWidth);
    };

    const handleDragEnd = () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      // Propagate final width to parent
      if (typeof window !== "undefined") {
        localStorage.setItem("readlab_ai_panel_width", internalWidth.toString());
      }
    };

    // Also persist on each move for responsiveness
    const handleDragMoveAndPersist = (moveEvent) => {
      handleDragMove(moveEvent);
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      localStorage.setItem("readlab_ai_panel_width", newWidth.toString());
    };

    document.addEventListener("mousemove", handleDragMoveAndPersist);
    document.addEventListener("mouseup", () => {
      document.removeEventListener("mousemove", handleDragMoveAndPersist);
      document.removeEventListener("mouseup", arguments.callee);
    });
  }, [internalWidth]);
```

Then update the style to use `internalWidth`:

```jsx
  style={{ width: `${internalWidth}px` }}
```

And add the mouse down event on the drag handle:

```jsx
  <div
    ref={dragRef}
    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/30 transition-colors"
    onMouseDown={handleDragStart}
  />
```

- [ ] **Step 2: Verify resize works**

Open the app, hover over the left edge of the AI panel. The cursor should change to col-resize. Drag to resize between 280-500px.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/reading/AiGuidancePanel.jsx
git commit -m "feat: add draggable resize to AI guidance panel (280-500px)"
```

---

## Self-Review

**Spec coverage:**
- [x] PDF viewer in center — Task 4 (PdfViewer) + Task 7 (wiring)
- [x] Sections sidebar collapsible to icon strip — Task 5 (SectionsSidebar)
- [x] AI guidance panel with guiding questions, checkpoint, critical prompts, jargon — Task 6 (AiGuidancePanel)
- [x] Resizable AI panel 280-500px — Task 8 (drag handler)
- [x] Backend PDF URL endpoint — Task 1
- [x] Session returns paper_id — Task 2
- [x] Removed: annotations, methodology decoder, simplification, layout toggle — Task 7 removes all old components
- [x] Jargon lookup moved to AI panel — Task 6 (SectionContent)
- [x] Header with toggle buttons — Task 7
- [x] react-pdf dependency — Task 3

**Placeholder scan:** No TBDs, TODOs, or "implement later" patterns found.

**Type consistency:** All prop names between ReadingPage → child components are consistent across Tasks 5, 6, 7, 8. The `checkpoints` state structure `{ text, ai_feedback, pending, skipped }` is used consistently. The `soWhat` object shape `{ text, ai_feedback, pending, skipped }` is consistent. The `getPdfUrl` import from `api.js` matches the export added in Task 3.
