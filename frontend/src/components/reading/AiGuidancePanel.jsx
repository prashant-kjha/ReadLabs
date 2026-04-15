import { useState } from "react";
import { SkipForward, Search } from "lucide-react";
import { getCriticalPrompt } from "../../lib/superpowersApi";
import toast from "react-hot-toast";

export default function AiGuidancePanel({
  section, currentSection, sections,
  checkpoint, setCheckpoint, submitCheckpoint, skipCheckpoint,
  canAdvance, advanceSection, isLastSection,
  soWhat, setSoWhat, submitSoWhat,
  quizQuestions, setQuizQuestions, quizAnswers, setQuizAnswers,
  quizResults, setQuizResults, quizGenerating, setQuizGenerating,
  quizSubmitting, setQuizSubmitting, currentAssignmentId,
  lookupJargon, jargonExplanation, jargonPending,
  previewMode, optionalCheckpoints, showSoWhat,
  panelWidth, panelVisible,
}) {
  const isQuizSection = currentSection === sections.length + 1;
  const isSoWhatSection = currentSection === sections.length;

  if (!panelVisible) return null;

  const startQuiz = async () => {
    if (!currentAssignmentId) return;
    setQuizGenerating(true);
    try {
      const { getQuiz, generateQuiz } = await import("../../lib/superpowersApi");
      let questions = await getQuiz(currentAssignmentId);
      if (questions.length === 0) questions = await generateQuiz(currentAssignmentId);
      setQuizQuestions(questions);
    } catch { toast.error("Could not load quiz"); }
    finally { setQuizGenerating(false); }
  };

  const submitQuiz = async () => {
    setQuizSubmitting(true);
    try {
      const { submitQuizAttempt, addXp } = await import("../../lib/superpowersApi");
      const results = await submitQuizAttempt(currentAssignmentId, quizAnswers);
      setQuizResults(results);
      const correctCount = results.results.filter((r) => r.score === r.max).length;
      for (let i = 0; i < correctCount; i++) await addXp("quiz_correct").catch(() => {});
    } catch { toast.error("Failed to submit quiz"); }
    finally { setQuizSubmitting(false); }
  };

  return (
    <div className="shrink-0 bg-surface border-l border-border flex flex-col relative" style={{ width: `${panelWidth}px` }}>
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/30 transition-colors" />
      <div className="px-4 py-2 border-b border-border">
        <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">AI Guidance</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isQuizSection ? (
          <QuizContent quizQuestions={quizQuestions} quizAnswers={quizAnswers} setQuizAnswers={setQuizAnswers}
            quizResults={quizResults} quizGenerating={quizGenerating} quizSubmitting={quizSubmitting}
            startQuiz={startQuiz} submitQuiz={submitQuiz} />
        ) : isSoWhatSection ? (
          <SoWhatContent soWhat={soWhat} setSoWhat={setSoWhat} submitSoWhat={submitSoWhat}
            previewMode={previewMode} optionalCheckpoints={optionalCheckpoints} />
        ) : (
          <SectionContent section={section} currentSection={currentSection} currentAssignmentId={currentAssignmentId}
            checkpoint={checkpoint} setCheckpoint={setCheckpoint} submitCheckpoint={submitCheckpoint}
            skipCheckpoint={skipCheckpoint} canAdvance={canAdvance} advanceSection={advanceSection}
            isLastSection={isLastSection} showSoWhat={showSoWhat} previewMode={previewMode}
            optionalCheckpoints={optionalCheckpoints} lookupJargon={lookupJargon}
            jargonExplanation={jargonExplanation} jargonPending={jargonPending} />
        )}
      </div>
    </div>
  );
}

function SectionContent({ section, currentSection, currentAssignmentId, checkpoint, setCheckpoint,
  submitCheckpoint, skipCheckpoint, canAdvance, advanceSection, isLastSection, showSoWhat,
  previewMode, optionalCheckpoints, lookupJargon, jargonExplanation, jargonPending }) {
  const [criticalPrompt, setCriticalPrompt] = useState(null);
  const [criticalPromptOpen, setCriticalPromptOpen] = useState(false);
  const [jargonTerm, setJargonTerm] = useState("");

  const loadCriticalPrompt = async () => {
    if (!currentAssignmentId || previewMode) return;
    try {
      const data = await getCriticalPrompt(currentAssignmentId, currentSection);
      setCriticalPrompt(data);
      setCriticalPromptOpen(true);
    } catch {}
  };

  const handleJargonLookup = () => { if (jargonTerm.trim()) lookupJargon(jargonTerm.trim()); };

  if (!section) return null;

  return (
    <>
      <h2 className="text-[var(--color-text)] font-semibold text-base mb-1">{section.title}</h2>
      <div className="mb-4">
        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Before you read</p>
        <ul className="space-y-1.5">
          {(section.guiding_questions || []).map((q, i) => (
            <li key={i} className="text-[var(--color-text)] text-sm flex gap-2">
              <span className="text-primary shrink-0">→</span><span>{q}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border pt-3">
        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Your response</p>
        <textarea rows={4} value={checkpoint?.text || ""} onChange={(e) => setCheckpoint(e.target.value)}
          placeholder="What did you find in this section? Address the guiding questions above."
          disabled={!!checkpoint?.ai_feedback} className="input-field resize-none disabled:opacity-60" />
        {!checkpoint?.ai_feedback && !checkpoint?.skipped && (
          <div className="mt-2 flex gap-2">
            <button onClick={submitCheckpoint} disabled={checkpoint?.pending || !checkpoint?.text?.trim()}
              className="btn-primary text-sm disabled:opacity-50">{checkpoint?.pending ? "Getting feedback..." : "Submit"}</button>
            {optionalCheckpoints && (
              <button onClick={skipCheckpoint} className="btn-secondary text-sm flex items-center gap-1">
                <SkipForward className="w-3.5 h-3.5" /> Skip
              </button>
            )}
          </div>
        )}
        {checkpoint?.skipped && !checkpoint?.ai_feedback && optionalCheckpoints && (
          <p className="mt-2 text-[var(--color-text-secondary)] text-xs italic">Section skipped. You can come back later.</p>
        )}
        {checkpoint?.pending && (
          <div className="mt-3 flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
            <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg> AI is reviewing your response...
          </div>
        )}
        {checkpoint?.ai_feedback && (
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary">{checkpoint.ai_feedback}</div>
        )}
      </div>
      {canAdvance && !isLastSection && (
        <button onClick={advanceSection} className="mt-3 text-sm text-primary hover:text-primary-hover underline">Next Section →</button>
      )}
      {canAdvance && isLastSection && !showSoWhat && (
        <button onClick={advanceSection} className="mt-3 text-sm text-primary hover:text-primary-hover underline">Finish → So What?</button>
      )}
      <div className="border-t border-border pt-3 mt-3">
        {!criticalPrompt && !criticalPromptOpen ? (
          <button onClick={loadCriticalPrompt} className="text-xs text-[var(--color-text-secondary)] hover:text-primary underline transition-colors">
            Critical thinking prompt →
          </button>
        ) : criticalPrompt ? (
          <div className="border border-primary/20 rounded-lg p-3 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-primary uppercase tracking-wider font-medium">Critical Thinking</span>
              <button onClick={() => { setCriticalPromptOpen(false); setCriticalPrompt(null); }}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-sm">×</button>
            </div>
            <p className="text-[var(--color-text)] text-sm leading-relaxed">{criticalPrompt.prompt_text}</p>
            <span className="text-xs text-[var(--color-text-secondary)] capitalize mt-1 block">{criticalPrompt.prompt_type}</span>
          </div>
        ) : null}
      </div>
      <div className="border-t border-border pt-3 mt-3">
        <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Look up a term</p>
        <div className="flex gap-2">
          <input type="text" placeholder="Enter term..." value={jargonTerm} onChange={(e) => setJargonTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleJargonLookup(); }} className="input-field flex-1" />
          <button onClick={handleJargonLookup} disabled={!jargonTerm.trim()}
            className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"><Search className="w-3.5 h-3.5" /></button>
        </div>
        {jargonPending && (
          <div className="mt-2 flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
            <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg> Looking up...
          </div>
        )}
        {jargonExplanation && !jargonPending && (
          <div className="mt-2 bg-muted rounded-lg p-3 text-sm text-[var(--color-text)] leading-relaxed">{jargonExplanation}</div>
        )}
      </div>
    </>
  );
}

function SoWhatContent({ soWhat, setSoWhat, submitSoWhat, previewMode, optionalCheckpoints }) {
  return (
    <>
      <h2 className="text-[var(--color-text)] font-semibold text-lg mb-1">So What?</h2>
      <p className="text-[var(--color-text-secondary)] text-sm mb-4">In 2–3 sentences: what does this paper contribute, and why does it matter?</p>
      <textarea rows={5} value={soWhat?.text || ""} onChange={(e) => setSoWhat(e.target.value)}
        disabled={!!soWhat?.ai_feedback} placeholder="Describe the paper's significance in your own words..."
        className="input-field resize-none disabled:opacity-60" />
      {!soWhat?.ai_feedback && !soWhat?.skipped && (
        <div className="mt-2 flex gap-2">
          <button onClick={submitSoWhat} disabled={soWhat?.pending || !soWhat?.text?.trim()}
            className="btn-primary mt-2 text-sm disabled:opacity-50">{soWhat?.pending ? "Getting feedback..." : "Submit"}</button>
          {optionalCheckpoints && (
            <button onClick={() => setSoWhat({ ...soWhat, skipped: true })}
              className="btn-secondary mt-2 text-sm flex items-center gap-1"><SkipForward className="w-3.5 h-3.5" /> Skip</button>
          )}
        </div>
      )}
      {soWhat?.pending && (
        <div className="mt-3 flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
          <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg> AI is evaluating your summary...
        </div>
      )}
      {soWhat?.ai_feedback && (
        <>
          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 text-sm text-primary">{soWhat.ai_feedback}</div>
          {!previewMode && (
            <div className="mt-4 p-4 bg-emerald-500/10 border border-success/30 rounded-lg text-success text-sm font-medium">You've completed this assignment!</div>
          )}
        </>
      )}
    </>
  );
}

function QuizContent({ quizQuestions, quizAnswers, setQuizAnswers, quizResults, quizGenerating, quizSubmitting, startQuiz, submitQuiz }) {
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
                      <input type="radio" name={q.id} value={opt} checked={quizAnswers[q.id] === opt}
                        onChange={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))} className="text-primary" />
                      <span className="text-[var(--color-text)] text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea rows={3} value={quizAnswers[q.id] || ""}
                  onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Your answer..." className="input-field resize-none" />
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
      <p className="text-[var(--color-text-secondary)] text-sm mb-4">Answer 5 questions to check your comprehension of this paper.</p>
      <button onClick={startQuiz} disabled={quizGenerating} className="btn-primary text-sm disabled:opacity-50">
        {quizGenerating ? "Generating quiz..." : "Generate Quiz"}
      </button>
    </>
  );
}
