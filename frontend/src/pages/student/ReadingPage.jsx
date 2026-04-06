import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import {
  listAnnotations, createAnnotation, deleteAnnotation, getAnnotationAiPrompt,
  getMethodologyElements, getCriticalPrompt,
  getQuiz, generateQuiz as generateQuizApi, submitQuizAttempt, addXp,
} from "../../lib/superpowersApi";

// Renders paper text with key terms highlighted
function HighlightedText({ text, keyTerms, onTermClick }) {
  if (!text) return null;
  if (!keyTerms || keyTerms.length === 0) {
    return <span className="whitespace-pre-wrap leading-relaxed">{text}</span>;
  }
  const escaped = keyTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const isKey = keyTerms.some((t) => t.toLowerCase() === part.toLowerCase());
        return isKey ? (
          <span
            key={i}
            className="underline decoration-yellow-400 decoration-2 cursor-pointer hover:bg-yellow-400/10 rounded px-0.5"
            onClick={() => onTermClick(part)}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}

export default function ReadingPage({ previewMode = false, optionalCheckpoints = false }) {
  const { assignmentId: routeAssignmentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [readingGuide, setReadingGuide] = useState(null);
  const [paperTitle, setPaperTitle] = useState("");
  const [currentSection, setCurrentSection] = useState(0);
  const [layout, setLayout] = useState(
    () => localStorage.getItem("readlab_layout_preference") || "stacked"
  );
  const [checkpoints, setCheckpoints] = useState({});
  const [soWhat, setSoWhat] = useState({ text: "", ai_feedback: null, pending: false });
  const [jargonDrawer, setJargonDrawer] = useState({ open: false, term: "", explanation: null, pending: false });
  const [floatingLookup, setFloatingLookup] = useState(null);
  const [manualTerm, setManualTerm] = useState("");
  const [simplificationLevel, setSimplificationLevel] = useState("original");
  const [activeTypeTip, setActiveTypeTip] = useState(null);
  const [criticalPrompt, setCriticalPrompt] = useState(null);
  const [criticalPromptOpen, setCriticalPromptOpen] = useState(false);
  const [assignmentId, setAssignmentId] = useState(null);
  const [methodologyElements, setMethodologyElements] = useState([]);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [methodologyLoading, setMethodologyLoading] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [highlightTooltip, setHighlightTooltip] = useState(null);
  const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState(null);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const pollRef = useRef(null);
  const textRef = useRef(null);

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (previewMode) {
      initPreview();
    } else {
      initSession();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeAssignmentId]);

  const initPreview = async () => {
    try {
      const { data } = await api.get(`/assignments/${routeAssignmentId}`);
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper Preview");
      setLoading(false);
    } catch (err) {
      toast.error(err.message || "Could not load assignment");
    }
  };

  const initSession = async () => {
    try {
      const { data } = await api.post("/sessions/", { assignment_id: routeAssignmentId });
      setSessionId(data.session_id);
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper");
      setAssignmentId(data.assignment_id);
      if (data.session_id) {
        listAnnotations(data.session_id).then(setAnnotations).catch(() => {});
      }
      setCurrentSection(data.current_section_index || 0);
      // Hydrate existing checkpoints
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
      setLoading(false);
    } catch (err) {
      toast.error(err.message || "Could not start session");
    }
  };

  // ── Layout toggle ──────────────────────────────────────────────────────────

  const toggleLayout = () => {
    const next = layout === "stacked" ? "side" : "stacked";
    setLayout(next);
    localStorage.setItem("readlab_layout_preference", next);
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
          setSoWhat({ text: data.sowhat.student_text, ai_feedback: data.sowhat.ai_feedback, pending: !data.sowhat.ai_feedback });
          if (!data.sowhat.ai_feedback) pending = true;
        }

        setJargonDrawer((prev) => {
          if (!prev.pending) return prev;
          const match = (data.jargon_lookups || []).find(
            (j) => j.term === prev.term.toLowerCase() && j.explanation
          );
          if (match) return { ...prev, explanation: match.explanation, pending: false };
          pending = true;
          return prev;
        });

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

  // ── Text selection for highlight-to-lookup ─────────────────────────────────

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
      text, startChar, endChar,
      top: rect.top + window.scrollY - 52,
      left: Math.min(rect.left, window.innerWidth - 280),
    });
    setFloatingLookup({ text, top: rect.top + window.scrollY - 44, left: Math.min(rect.left, window.innerWidth - 120) });
  };

  // ── Jargon lookup (highlight or manual) ───────────────────────────────────

  const lookupJargon = async (term) => {
    setFloatingLookup(null);
    window.getSelection()?.removeAllRanges();
    const section = readingGuide.sections[currentSection];
    const context = section?.text?.slice(0, 500) || "";
    setJargonDrawer({ open: true, term, explanation: null, pending: true });

    const endpoint = previewMode ? "/sessions/preview/jargon" : `/sessions/${sessionId}/jargon`;
    try {
      const { data } = await api.post(endpoint, { term, context_snippet: context });
      if (data.explanation) {
        setJargonDrawer({ open: true, term, explanation: data.explanation, pending: false });
      } else {
        startPolling(sessionId);
      }
    } catch {
      setJargonDrawer((d) => ({ ...d, pending: false }));
      toast.error("Lookup failed");
    }
  };

  // ── Key term click ─────────────────────────────────────────────────────────

  const lookupKeyTerm = async (term) => {
    const section = readingGuide.sections[currentSection];
    const context = section?.text?.slice(0, 500) || "";
    setJargonDrawer({ open: true, term, explanation: null, pending: true });

    const endpoint = previewMode ? "/sessions/preview/keyterm" : `/sessions/${sessionId}/keyterm`;
    const body = previewMode
      ? { assignment_id: routeAssignmentId, term, context_snippet: context }
      : { term, context_snippet: context };

    try {
      const { data } = await api.post(endpoint, body);
      setJargonDrawer({ open: true, term, explanation: data.explanation, pending: false });
    } catch {
      setJargonDrawer((d) => ({ ...d, pending: false }));
      toast.error("Lookup failed");
    }
  };

  // ── Checkpoint submission ─────────────────────────────────────────────────

  const submitCheckpoint = async () => {
    const text = checkpoints[currentSection]?.text || "";
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

  // ── So What? submission ───────────────────────────────────────────────────

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

  const skipCheckpoint = async () => {
    setCheckpoints((prev) => ({ ...prev, [currentSection]: { text: "", ai_feedback: null, pending: false, skipped: true } }));
    if (!previewMode && sessionId) {
      await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: currentSection + 1 }).catch(() => {});
    }
    if (isLastSection && !showSoWhat) {
      setCurrentSection(sections.length);
    } else if (!isLastSection) {
      advanceSection();
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!readingGuide) return <div className="p-8 text-red-400">Assignment not found.</div>;

  const sections = readingGuide.sections;
  const section = sections[currentSection];
  const cp = checkpoints[currentSection] || { text: "", ai_feedback: null, pending: false, skipped: false };
  const allSectionsComplete = sections.every((_, i) => checkpoints[i]?.ai_feedback);
  const canAdvance = previewMode || !!cp.ai_feedback || (optionalCheckpoints && cp.skipped);
  const isLastSection = currentSection === sections.length - 1;
  const showSoWhat = allSectionsComplete || previewMode;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const ANNOTATION_COLORS = {
    important: "#FBBF24",
    confusion: "#F97316",
    question: "#3B82F6",
    idea: "#22C55E",
  };

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
          <button key={key} onClick={() => setSimplificationLevel(key)}
            className={`text-xs px-2 py-1 rounded transition-colors ${simplificationLevel === key ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>
    );
  };

  const MethodologyDecoder = () => {
    const [expertMode, setExpertMode] = useState(false);
    const loadElements = async () => {
      if (!assignmentId || previewMode || methodologyLoading) return;
      setMethodologyLoading(true);
      try {
        const data = await getMethodologyElements(assignmentId, currentSection);
        setMethodologyElements(data || []);
        setMethodologyOpen(true);
      } catch { toast.error("Could not load methodology elements"); }
      finally { setMethodologyLoading(false); }
    };
    if (!methodologyOpen) {
      return (
        <button onClick={loadElements} disabled={methodologyLoading}
          className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline disabled:opacity-50">
          {methodologyLoading ? "Loading..." : "Decode Methods \u2192"}
        </button>
      );
    }
    if (methodologyElements.length === 0) {
      return (<div className="mt-3 text-xs text-gray-500">No methodology elements for this section.
        <button onClick={() => setMethodologyOpen(false)} className="ml-2 text-gray-600 hover:text-gray-400">Close</button></div>);
    }
    return (
      <div className="mt-4 border border-gray-700 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Methodology</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setExpertMode(m => !m)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${expertMode ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>Expert</button>
            <button onClick={() => setMethodologyOpen(false)} className="text-gray-600 hover:text-gray-400 text-sm">{"\u00d7"}</button>
          </div>
        </div>
        <div className="space-y-3">
          {methodologyElements.map(elem => (
            <div key={elem.id} className="bg-gray-800/50 rounded p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded capitalize">{elem.element_type.replace(/_/g, " ")}</span>
                <span className="text-sm text-white font-medium">{elem.label}</span>
              </div>
              <p className="text-xs text-gray-400 mb-1">{elem.description}</p>
              {expertMode && <p className="text-xs text-gray-300 leading-relaxed">{elem.explanation}</p>}
              {expertMode && elem.follow_up_questions?.length > 0 && <p className="text-xs text-indigo-400 mt-1 italic">{elem.follow_up_questions[0]}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const saveAnnotation = async (category) => {
    if (!highlightTooltip || !sessionId) return;
    const color = ANNOTATION_COLORS[category] || ANNOTATION_COLORS.important;
    try {
      const ann = await createAnnotation({
        session_id: sessionId, section_index: currentSection,
        start_char: highlightTooltip.startChar, end_char: highlightTooltip.endChar,
        highlight_text: highlightTooltip.text, color, category,
      });
      setAnnotations(prev => [...prev, ann]);
      toast.success(`Saved as "${category}"`);
    } catch { toast.error("Failed to save highlight"); }
    setHighlightTooltip(null);
    window.getSelection()?.removeAllRanges();
  };

  const CriticalPromptPanel = () => {
    const loadPrompt = async () => {
      if (!assignmentId || previewMode) return;
      try {
        const data = await getCriticalPrompt(assignmentId, currentSection);
        setCriticalPrompt(data);
        setCriticalPromptOpen(true);
      } catch {}
    };
    if (!criticalPrompt && !criticalPromptOpen) {
      return (<button onClick={loadPrompt} className="mt-3 text-xs text-gray-500 hover:text-indigo-400 underline transition-colors">Critical thinking prompt {"\u2192"}</button>);
    }
    if (!criticalPrompt) return null;
    return (
      <div className="mt-4 border border-indigo-900/50 rounded-lg p-3 bg-indigo-950/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-indigo-400 uppercase tracking-wider font-medium">Critical Thinking</span>
          <button onClick={() => { setCriticalPromptOpen(false); setCriticalPrompt(null); }} className="text-gray-600 hover:text-gray-400 text-sm">{"\u00d7"}</button>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">{criticalPrompt.prompt_text}</p>
        <span className="text-xs text-gray-600 capitalize mt-1 block">{criticalPrompt.prompt_type}</span>
      </div>
    );
  };

  const HighlightTooltip = () => {
    if (!highlightTooltip || previewMode) return null;
    return (
      <div style={{ position: "absolute", top: highlightTooltip.top, left: highlightTooltip.left, zIndex: 50 }}
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-2 flex items-center gap-1">
        {Object.entries(ANNOTATION_COLORS).map(([cat, color]) => (
          <button key={cat} title={cat} onClick={() => saveAnnotation(cat)}
            style={{ backgroundColor: color }} className="w-5 h-5 rounded-full hover:scale-110 transition-transform" />
        ))}
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <button onClick={() => { lookupJargon(highlightTooltip.text); setHighlightTooltip(null); }}
          className="text-xs text-gray-400 hover:text-white px-1">Look up</button>
      </div>
    );
  };

  const AnnotationSidebar = () => {
    const sessionAnnotations = annotations.filter(a => a.section_index === currentSection);
    const [aiPrompts, setAiPrompts] = useState({});
    const askAI = async (ann) => {
      try { const { prompt } = await getAnnotationAiPrompt(ann.id); setAiPrompts(prev => ({ ...prev, [ann.id]: prompt })); }
      catch { toast.error("Could not get AI prompt"); }
    };
    const removeAnnotation = async (annId) => {
      try { await deleteAnnotation(annId); setAnnotations(prev => prev.filter(a => a.id !== annId)); }
      catch { toast.error("Failed to delete"); }
    };
    return (
      <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-medium text-sm">Annotations ({annotations.length})</h3>
          <button onClick={() => setAnnotationSidebarOpen(false)} className="text-gray-500 hover:text-white text-lg leading-none">{"\u00d7"}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessionAnnotations.length === 0 && <p className="text-gray-600 text-xs text-center mt-8">No annotations in this section yet.</p>}
          {sessionAnnotations.map(ann => (
            <div key={ann.id} className="bg-gray-800 rounded-lg p-2.5">
              <div className="flex items-start gap-2">
                <div className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: ann.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-xs leading-relaxed">&quot;{ann.highlight_text}&quot;</p>
                  {ann.note_text && <p className="text-gray-500 text-xs mt-1 italic">{ann.note_text}</p>}
                  {aiPrompts[ann.id] && <p className="text-indigo-400 text-xs mt-1 italic">{aiPrompts[ann.id]}</p>}
                  <div className="flex gap-2 mt-1.5">
                    {!aiPrompts[ann.id] && <button onClick={() => askAI(ann)} className="text-xs text-indigo-500 hover:text-indigo-300">Ask AI</button>}
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

  const QuizPanel = () => {
    const startQuiz = async () => {
      if (!assignmentId) return;
      setQuizGenerating(true);
      try {
        let questions = await getQuiz(assignmentId);
        if (questions.length === 0) questions = await generateQuizApi(assignmentId);
        setQuizQuestions(questions);
      } catch { toast.error("Could not load quiz"); }
      finally { setQuizGenerating(false); }
    };
    const submitQuiz = async () => {
      setQuizSubmitting(true);
      try {
        const results = await submitQuizAttempt(assignmentId, quizAnswers);
        setQuizResults(results);
        const correctCount = results.results.filter(r => r.score === r.max).length;
        for (let i = 0; i < correctCount; i++) await addXp("quiz_correct").catch(() => {});
      } catch { toast.error("Failed to submit quiz"); }
      finally { setQuizSubmitting(false); }
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
              const q = quizQuestions.find(q => q.id === r.question_id);
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
      const allAnswered = quizQuestions.every(q => quizAnswers[q.id]?.trim());
      return (
        <div className="max-w-2xl">
          <h2 className="text-white font-semibold text-lg mb-4">Comprehension Quiz</h2>
          <div className="space-y-5">
            {quizQuestions.map((q, i) => (
              <div key={q.id} className="bg-gray-900 rounded-xl p-4">
                <p className="text-gray-200 text-sm font-medium mb-3">{i + 1}. {q.question_text}</p>
                {q.question_type === "multiple_choice" ? (
                  <div className="space-y-2">
                    {(q.options || []).map(opt => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={q.id} value={opt} checked={quizAnswers[q.id] === opt}
                          onChange={() => setQuizAnswers(prev => ({ ...prev, [q.id]: opt }))} className="text-indigo-600" />
                        <span className="text-gray-300 text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea rows={3} value={quizAnswers[q.id] || ""}
                    onChange={e => setQuizAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your answer..." className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 resize-none" />
                )}
              </div>
            ))}
          </div>
          <button onClick={submitQuiz} disabled={!allAnswered || quizSubmitting}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors">
            {quizSubmitting ? "Grading..." : "Submit Quiz"}
          </button>
        </div>
      );
    }
    return (
      <div className="max-w-2xl">
        <h2 className="text-white font-semibold text-lg mb-2">Test Your Understanding</h2>
        <p className="text-gray-400 text-sm mb-4">Answer 5 questions to check your comprehension of this paper.</p>
        <button onClick={startQuiz} disabled={quizGenerating}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 transition-colors">
          {quizGenerating ? "Generating quiz..." : "Generate Quiz"}
        </button>
      </div>
    );
  };

  const SectionSidebar = () => (
    <div className="w-48 shrink-0">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Sections</p>
      <div className="space-y-1">
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
                active ? "bg-indigo-600 text-white" :
                locked ? "text-gray-600 cursor-not-allowed" :
                skipped ? "text-gray-600" :
                "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {skipped ? (
                <span className="text-gray-500 text-xs">Skipped</span>
              ) : done ? (
                <span className="text-green-400 text-xs">{"\u2713"}</span>
              ) : (
                <span className="text-gray-700 text-xs">{i + 1}</span>
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
              currentSection === sections.length ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            So What?
          </button>
        )}
        {(soWhat.ai_feedback || soWhat.skipped) && (
          <button onClick={() => setCurrentSection(sections.length + 1)}
            className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${currentSection === sections.length + 1 ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}>
            Quiz
          </button>
        )}
      </div>
      {/* Structure Coach */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Structure Guide</p>
        <div className="space-y-1.5">
          {Object.entries(sections.reduce((acc, s, i) => {
            const t = s.section_type || "Other";
            acc[t] = acc[t] || { total: 0, done: 0 };
            acc[t].total++;
            if (checkpoints[i]?.ai_feedback) acc[t].done++;
            return acc;
          }, {})).map(([type, counts]) => (
            <button key={type} onClick={() => setActiveTypeTip(activeTypeTip === type ? null : type)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between ${SECTION_TYPE_COLORS[type] || SECTION_TYPE_COLORS.Other}`}>
              <span>{type}</span>
              <span className="text-gray-500">{counts.done}/{counts.total}</span>
            </button>
          ))}
        </div>
        {activeTypeTip && (
          <div className="mt-2 text-xs text-gray-400 bg-gray-800 rounded p-2 leading-relaxed">
            {SECTION_TYPE_TIPS[activeTypeTip] || SECTION_TYPE_TIPS.Other}
          </div>
        )}
      </div>
    </div>
  );

  const GuidingQuestions = () => (
    <div className="mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Before you read</p>
      <ul className="space-y-1.5">
        {section.guiding_questions.map((q, i) => (
          <li key={i} className="text-gray-300 text-sm flex gap-2">
            <span className="text-indigo-400 shrink-0">→</span>
            <span>{q}</span>
          </li>
        ))}
      </ul>
    </div>
  );

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

  const CheckpointArea = () => (
    <div className="mt-4 border-t border-gray-800 pt-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your response</p>
      <textarea
        rows={4}
        value={cp.text}
        onChange={(e) => setCheckpoints((prev) => ({ ...prev, [currentSection]: { ...prev[currentSection], text: e.target.value } }))}
        placeholder="What did you find in this section? Address the guiding questions above."
        disabled={!!cp.ai_feedback}
        className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 resize-none disabled:opacity-60"
      />
      {!cp.ai_feedback && !cp.skipped && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={submitCheckpoint}
            disabled={cp.pending || !cp.text?.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {cp.pending ? "Getting feedback…" : "Submit"}
          </button>
          {optionalCheckpoints && (
            <button
              onClick={skipCheckpoint}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      )}
      {cp.skipped && !cp.ai_feedback && optionalCheckpoints && (
        <p className="mt-2 text-gray-500 text-xs italic">Section skipped. You can come back and submit a response later.</p>
      )}
      {cp.pending && (
        <div className="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          AI is reviewing your response…
        </div>
      )}
      {cp.ai_feedback && (
        <div className="mt-3 bg-indigo-950/50 border border-indigo-800/50 rounded-lg px-4 py-3 text-sm text-indigo-200">
          {cp.ai_feedback}
        </div>
      )}
      {canAdvance && !isLastSection && (
        <button
          onClick={advanceSection}
          className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 underline"
        >
          Next Section →
        </button>
      )}
      {canAdvance && isLastSection && !showSoWhat && (
        <button
          onClick={() => setCurrentSection(sections.length)}
          className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 underline"
        >
          Finish → So What?
        </button>
      )}
    </div>
  );

  const SoWhatPanel = () => (
    <div className="max-w-2xl">
      <h2 className="text-white font-semibold text-lg mb-1">So What?</h2>
      <p className="text-gray-400 text-sm mb-4">
        In 2–3 sentences: what does this paper contribute, and why does it matter?
      </p>
      <textarea
        rows={5}
        value={soWhat.text}
        onChange={(e) => setSoWhat((s) => ({ ...s, text: e.target.value }))}
        disabled={!!soWhat.ai_feedback}
        placeholder="Describe the paper's significance in your own words…"
        className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 resize-none disabled:opacity-60"
      />
      {!soWhat.ai_feedback && !soWhat.skipped && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={submitSoWhat}
            disabled={soWhat.pending || !soWhat.text.trim()}
            className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {soWhat.pending ? "Getting feedback…" : "Submit"}
          </button>
          {optionalCheckpoints && (
            <button
              onClick={() => { setSoWhat((s) => ({ ...s, skipped: true })); if (!previewMode) setCurrentSection(sections.length + 1); }}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      )}
      {soWhat.pending && (
        <div className="mt-3 flex items-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          AI is evaluating your summary…
        </div>
      )}
      {soWhat.ai_feedback && (
        <>
          <div className="mt-3 bg-indigo-950/50 border border-indigo-800/50 rounded-lg px-4 py-3 text-sm text-indigo-200">
            {soWhat.ai_feedback}
          </div>
          {!previewMode && (
            <div className="mt-4 p-4 bg-green-900/30 border border-green-700/40 rounded-lg text-green-300 text-sm font-medium">
              You've completed this assignment!
            </div>
          )}
        </>
      )}
    </div>
  );

  const isSoWhatSection = currentSection === sections.length;
  const isQuizSection = currentSection === sections.length + 1;

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Preview banner */}
      {previewMode && (
        <div className="bg-amber-600/20 border-b border-amber-600/40 px-6 py-2 text-amber-300 text-sm text-center">
          Preview Mode — you are viewing this as a student would. Nothing is saved.
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">{previewMode ? "Preview" : "Reading"}</p>
          <h1 className="text-white font-semibold">{paperTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLayout}
            className="text-gray-400 hover:text-white text-xs border border-gray-700 rounded px-2.5 py-1 transition-colors"
          >
            {layout === "stacked" ? "⇔ Side by Side" : "↕ Stacked"}
          </button>
          {!previewMode && (
            <button onClick={() => setAnnotationSidebarOpen(o => !o)}
              className="text-gray-400 hover:text-white text-xs border border-gray-700 rounded px-2.5 py-1 transition-colors">
              Annotations ({annotations.length})
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex p-6 gap-6">
        <SectionSidebar />

        <div className="flex-1 min-w-0">
          {isQuizSection ? <QuizPanel /> : isSoWhatSection ? (
            <SoWhatPanel />
          ) : layout === "stacked" ? (
            /* Stacked layout */
            <div className="max-w-2xl space-y-6">
              <div className="bg-gray-900 rounded-xl p-5">
                <h2 className="text-white font-semibold text-lg mb-4">{section.title}</h2>
                <GuidingQuestions />
              </div>
              <div className="bg-gray-900 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
                <SimplificationToggle />
                <PaperText />
                {!previewMode && <MethodologyDecoder />}
              </div>
              <div className="bg-gray-900 rounded-xl p-5">
                <CheckpointArea />
              </div>
              {cp.ai_feedback && <div className="bg-gray-900 rounded-xl p-5"><CriticalPromptPanel /></div>}
            </div>
          ) : (
            /* Side-by-side layout */
            <div className="flex gap-4 h-[calc(100vh-140px)]">
              <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2">
                <div className="bg-gray-900 rounded-xl p-5">
                  <h2 className="text-white font-semibold text-lg mb-4">{section.title}</h2>
                  <GuidingQuestions />
                </div>
                <div className="bg-gray-900 rounded-xl p-5 flex-1">
                  <CheckpointArea />
                  {cp.ai_feedback && <CriticalPromptPanel />}
                </div>
              </div>
              <div className="w-1/2 overflow-y-auto bg-gray-900 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
                <SimplificationToggle />
                <PaperText />
                {!previewMode && <MethodologyDecoder />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating highlight-to-lookup button */}
      {floatingLookup && (
        <button
          style={{ position: "absolute", top: floatingLookup.top, left: floatingLookup.left }}
          onClick={() => lookupJargon(floatingLookup.text)}
          className="z-40 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg"
        >
          Look up "{floatingLookup.text.slice(0, 20)}{floatingLookup.text.length > 20 ? "…" : ""}"
        </button>
      )}

      {/* Manual jargon search pinned at bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 bg-gray-950 px-6 py-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Look up a term…"
          value={manualTerm}
          onChange={(e) => setManualTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && manualTerm.trim()) { lookupJargon(manualTerm.trim()); setManualTerm(""); } }}
          className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 w-64"
        />
        <button
          onClick={() => { if (manualTerm.trim()) { lookupJargon(manualTerm.trim()); setManualTerm(""); } }}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded-lg"
        >
          Look up
        </button>
      </div>

      {/* Jargon drawer */}
      {jargonDrawer.open && (
        <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 shadow-xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-white font-medium text-sm">Jargon Lookup</h3>
            <button onClick={() => setJargonDrawer((d) => ({ ...d, open: false }))} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <p className="text-indigo-300 font-medium text-sm mb-2">"{jargonDrawer.term}"</p>
            {jargonDrawer.pending ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
                <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Looking up…
              </div>
            ) : (
              <p className="text-gray-300 text-sm leading-relaxed">{jargonDrawer.explanation}</p>
            )}
          </div>
        </div>
      )}
      <HighlightTooltip />
      {annotationSidebarOpen && <AnnotationSidebar />}
    </div>
  );
}
