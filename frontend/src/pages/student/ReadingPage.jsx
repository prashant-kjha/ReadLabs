import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

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
  const { assignmentId } = useParams();
  const navigate = useNavigate();

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
      setReadingGuide(data.reading_guide);
      setPaperTitle(data.paper_title || "Paper");
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
    if (!previewMode && sessionId) {
      await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: next }).catch(() => {});
    }
  };

  // ── Text selection for highlight-to-lookup ─────────────────────────────────

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setFloatingLookup(null); return; }
    const text = sel.toString().trim();
    if (text.length < 2) { setFloatingLookup(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
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
      ? { assignment_id: assignmentId, term, context_snippet: context }
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

  const SectionSidebar = () => (
    <div className="w-48 shrink-0">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Sections</p>
      <div className="space-y-1">
        {sections.map((s, i) => {
          const done = !!checkpoints[i]?.ai_feedback;
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
                "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {done && <span className="text-green-400 text-xs">✓</span>}
              <span className="truncate">{s.title}</span>
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

  const PaperText = () => (
    <div
      ref={textRef}
      className="text-gray-300 text-sm leading-7 select-text"
      onMouseUp={handleMouseUp}
    >
      <HighlightedText
        text={section.text}
        keyTerms={section.key_terms || []}
        onTermClick={lookupKeyTerm}
      />
    </div>
  );

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
        </div>
      </div>

      {/* Body */}
      <div className="flex p-6 gap-6">
        <SectionSidebar />

        <div className="flex-1 min-w-0">
          {isSoWhatSection ? (
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
                <PaperText />
              </div>
              <div className="bg-gray-900 rounded-xl p-5">
                <CheckpointArea />
              </div>
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
                </div>
              </div>
              <div className="w-1/2 overflow-y-auto bg-gray-900 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Paper Text</p>
                <PaperText />
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
    </div>
  );
}
