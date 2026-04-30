import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import api, { getPdfUrl } from "../../lib/api";
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

  const sections = readingGuide?.sections || [];
  const section = sections[currentSection];
  const allSectionsComplete = sections.every((_, i) => checkpoints[i]?.ai_feedback);
  const canAdvance = previewMode || !!cp.ai_feedback || (optionalCheckpoints && cp.skipped);
  const isLastSection = currentSection === sections.length - 1;
  const showSoWhat = allSectionsComplete || previewMode;
  const showQuiz = soWhat.ai_feedback || soWhat.skipped;

  // ── Persist layout state ───────────────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem("readlab_sections_collapsed", sectionsCollapsed);
  }, [sectionsCollapsed]);

  useEffect(() => {
    localStorage.setItem("readlab_ai_panel_width", aiPanelWidth);
  }, [aiPanelWidth]);

  if (loading) return <div className="p-8 text-[var(--color-text-secondary)]">Loading...</div>;
  if (!readingGuide) return <div className="p-8 text-red-400">Assignment not found.</div>;

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
