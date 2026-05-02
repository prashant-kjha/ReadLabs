# ReadingPage Redesign: PDF-Centric Three-Panel Layout

**Date:** 2026-04-15
**Status:** Approved

## Problem

The current ReadingPage displays extracted text instead of the original PDF, losing formatting, figures, and readability. The page cramps all learning tools (guiding questions, checkpoints, annotations, methodology decoder, jargon lookup) into the same content area as the text, making it hard for students to focus on reading.

## Solution

Replace extracted text with a real PDF viewer in the center panel, flanked by a collapsible sections sidebar on the left and an AI guidance panel with adjustable width on the right.

## Layout

### Default (all panels open)

```
┌─────────────┬──────────────────────────┬──────────────────┐
│  Sections   │                          │   AI Guidance    │
│  (200px)    │      PDF Viewer          │   (draggable     │
│             │      (flex: fills gap)   │    280-500px)    │
│  [Intro ok] │                          │                  │
│  [Methods]  │   ┌──────────────────┐   │  Guiding Qs      │
│  [Results]  │   │                  │   │  Checkpoint      │
│  [Discuss.] │   │  Research Paper  │   │  Critical Prompt │
│             │   │  (react-pdf)     │   │  Jargon Lookup   │
│  So What?   │   │                  │   │                  │
│  Quiz       │   └──────────────────┘   │                  │
│             │                          │                  │
│  Structure  │  <- 1/12 ->     75%      │  | drag handle   │
│  Guide      │  page nav     zoom       │                  │
├─────────────┤                          │                  │
│ Collapse <- │                          │                  │
└─────────────┴──────────────────────────┴──────────────────┘
```

### Collapsed sections (44px icon strip)

```
┌──┬──────────────────────────────┬──────────────────┐
│->│                              │   AI Guidance    │
│ok│        PDF Viewer            │                  │
│ 2│        (wider)               │                  │
│ 3│                              │                  │
│ 4│                              │                  │
│ ?│                              │                  │
└──┴──────────────────────────────┴──────────────────┘
```

## Components

### 1. PDF Viewer (center panel)

- **Library:** `react-pdf` (PDF.js wrapper)
- **Source:** Signed URL from Supabase Storage via new backend endpoint
- **Controls:** Page prev/next, page indicator (3/12), zoom +/-, fit-to-width
- **Behavior:** Native scrolling within center panel. PDF pages render as canvas elements.
- **Section-to-page mapping:** Not in v1. Student navigates sections via left panel and PDF pages independently.

### 2. Sections Sidebar (left panel)

**Expanded state (200px):**
- Section list with completion badges (checkmark / skipped icon / number)
- Section type badges (I=Introduction, M=Methods, R=Results, D=Discussion)
- So What? and Quiz entries (appear when unlocked)
- Structure Coach progress tracker (section type counts with completion)
- Collapse button (left arrow) in panel header

**Collapsed state (44px icon strip):**
- Numbered circles with completion colors (primary=done, muted=pending, dim=locked)
- Hover tooltip shows section name
- Click on a circle expands the panel AND navigates to that section
- Expand button (right arrow) at top

**Persistence:** Expanded/collapsed state saved to `localStorage` key `readlab_sections_collapsed`.

### 3. AI Guidance Panel (right panel)

**Resizable via drag handle:**
- Drag handle on left edge of panel (4px wide invisible hit zone + visible grab indicator)
- Min width: 280px, max width: 500px
- Width persisted to `localStorage` key `readlab_ai_panel_width`
- Default width: 340px

**Content (top to bottom, scrollable):**

For regular sections:
1. Section title + section type badge
2. Guiding questions list ("Before you read")
3. Checkpoint response textarea + Submit/Skip buttons + AI feedback display
4. "Next Section ->" navigation link
5. Critical thinking prompt (expandable, loaded on demand via link)
6. Jargon lookup input field (moved from bottom bar, with Enter-to-lookup and results inline)

For So What? section:
- So What? prompt and textarea + Submit/Skip + AI feedback

For Quiz section:
- Quiz generation, questions, submission, results

**Jargon lookup:** Text input at the bottom of the AI panel. On lookup, the explanation renders inline below the input. No separate drawer or overlay.

### 4. Header

```
[Reading] Paper Title Here                [Sections <-] [AI Panel <->]
```

- Context label (Preview / Reading) + paper title on left
- Toggle buttons on right: collapse/expand sections panel, collapse/expand AI panel
- AI panel toggle fully hides it to 0px width (student wants pure reading mode). Drag handle reappears as a thin grab indicator on the right edge to bring it back.
- Removed: Annotation button, layout toggle

### 5. Backend: PDF URL Endpoint

**New endpoint:** `GET /api/v1/papers/{paper_id}/pdf-url`

Returns:
```json
{ "url": "https://project.supabase.co/storage/v1/object/sign/papers/..." }
```

Uses Supabase Storage signed URL (time-limited, no public bucket needed). Reads the `pdf_path` from the papers table for the paper associated with the current assignment. Requires authentication — student must have an active session for an assignment that uses this paper.

The sessions router already returns `paper_title` and `assignment_id`. The frontend will need to also return `paper_id` (or derive it from the assignment) so it can fetch the PDF URL.

## Removed Features

| Feature | Reason |
|---------|--------|
| Text extraction display (`PaperText`, `HighlightedText`) | Replaced by PDF viewer |
| Simplification toggle (ELI5/undergrad/high school) | Based on extracted text; no longer applicable |
| Annotation system (`AnnotationSidebar`, `HighlightTooltip`, colors) | Removed per user decision |
| Methodology decoder | Removed per user decision |
| Layout toggle (stacked/side-by-side) | Single three-panel layout replaces both modes |
| Bottom jargon bar | Moved into AI guidance panel |
| Jargon drawer (right overlay) | Integrated into AI guidance panel inline |

## Data Flow

1. Student opens reading session -> `POST /sessions/` returns `session_id`, `reading_guide`, `paper_title`, `paper_id`
2. Frontend fetches PDF URL -> `GET /papers/{paper_id}/pdf-url` -> signed Supabase URL
3. `react-pdf` loads and renders the PDF in the center panel
4. Section navigation in left panel updates the AI guidance panel content (guiding questions, checkpoints)
5. PDF viewer is independent — student scrolls/pages the PDF freely regardless of which section is active

## Files Changed

### Frontend
- `src/pages/student/ReadingPage.jsx` — Major rewrite: three-panel layout, PDF viewer, collapsible sections, resizable AI panel
- `src/lib/api.js` — New `getPdfUrl(paperId)` helper
- `package.json` — Add `react-pdf` dependency

### Backend
- `routers/papers.py` — New `GET /papers/{paper_id}/pdf-url` endpoint
- `routers/sessions.py` — Include `paper_id` in session creation response

## Key Dependencies

- `react-pdf` (MIT) — React wrapper for Mozilla's PDF.js
- `pdfjs-dist` — Peer dependency of react-pdf, provides the worker
