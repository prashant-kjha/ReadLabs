import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useReadingStore } from "../../hooks/useReadingStore";
import SectionsSidebar from "../../components/reading/SectionsSidebar";
import PdfViewer from "../../components/reading/PdfViewer";
import AiGuidancePanel from "../../components/reading/AiGuidancePanel";
import { PanelLeftClose, PanelRight } from "lucide-react";

interface Props {
  previewMode?: boolean;
  optionalCheckpoints?: boolean;
}

export default function ReadingPage({ previewMode = false, optionalCheckpoints = false }: Props) {
  const { assignmentId } = useParams();

  const {
    loading, readingGuide, paperTitle, currentSection, pdfUrl,
    checkpoints, soWhat, jargonExplanation, jargonPending,
    quizQuestions, quizAnswers, quizResults, quizGenerating, quizSubmitting,
    currentAssignmentId, sectionsCollapsed, aiPanelWidth, aiPanelVisible,
    initPreview, initSession, setCurrentSection, advanceSection,
    updateCpText, submitCheckpoint, skipCheckpoint,
    updateSoWhat, submitSoWhat, lookupJargon,
    setSectionsCollapsed, setAiPanelVisible,
    setQuizAnswers, setQuizResults, setQuizGenerating, setQuizSubmitting,
    setQuizQuestions, cleanup,
  } = useReadingStore();

  useEffect(() => {
    if (previewMode) initPreview(assignmentId!);
    else initSession(assignmentId!);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const sections = readingGuide?.sections || [];
  const section = sections[currentSection];
  const cp = checkpoints[currentSection] || { text: "", ai_feedback: null, pending: false, skipped: false };
  const allSectionsComplete = sections.every((_: unknown, i: number) => checkpoints[i]?.ai_feedback);
  const canAdvance = previewMode || !!cp.ai_feedback || (optionalCheckpoints && cp.skipped);
  const isLastSection = currentSection === sections.length - 1;
  const showSoWhat = allSectionsComplete || previewMode;
  const showQuiz = !!(soWhat.ai_feedback || soWhat.skipped);

  if (loading) return <div className="p-8 font-mono text-sm text-[var(--color-text-secondary)]">Loading...</div>;
  if (!readingGuide) return <div className="p-8 text-danger">Assignment not found.</div>;

  return (
    <div className="h-screen flex flex-col bg-[var(--color-bg)]">
      {previewMode && (
        <div className="bg-warning/10 border-b border-warning/40 px-6 py-2 text-warning font-mono text-xs tracking-wide text-center shrink-0">
          Preview Mode — you are viewing this as a student would. Nothing is saved.
        </div>
      )}

      <div className="bg-surface border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <p className="label-mono">{previewMode ? "Preview" : "Reading"}</p>
          <h1 className="font-display text-lg leading-tight text-[var(--color-text)] font-semibold truncate">{paperTitle}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSectionsCollapsed(!sectionsCollapsed)}
            data-testid="sections-toggle"
            className="font-mono text-[11px] tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-border-strong border border-border rounded-sm px-2 py-1 transition-colors flex items-center gap-1"
          >
            <PanelLeftClose className="w-3 h-3" />
            {sectionsCollapsed ? "Sections" : "Hide"}
          </button>
          <button
            onClick={() => setAiPanelVisible(!aiPanelVisible)}
            className="font-mono text-[11px] tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-border-strong border border-border rounded-sm px-2 py-1 transition-colors flex items-center gap-1"
          >
            <PanelRight className="w-3 h-3" />
            {aiPanelVisible ? "Hide AI" : "AI Panel"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <SectionsSidebar
          sections={sections}
          currentSection={currentSection}
          setCurrentSection={setCurrentSection}
          checkpoints={checkpoints}
          showSoWhat={showSoWhat}
          showQuiz={showQuiz}
          collapsed={sectionsCollapsed}
          setCollapsed={setSectionsCollapsed}
          previewMode={previewMode}
        />

        <PdfViewer url={pdfUrl} />

        <AiGuidancePanel
          section={section!}
          currentSection={currentSection}
          sections={sections}
          checkpoint={cp}
          setCheckpoint={(text: string) => updateCpText(currentSection, text)}
          submitCheckpoint={() => submitCheckpoint(previewMode)}
          skipCheckpoint={() => skipCheckpoint(optionalCheckpoints)}
          canAdvance={canAdvance}
          advanceSection={advanceSection}
          isLastSection={isLastSection}
          soWhat={soWhat}
          setSoWhat={updateSoWhat}
          submitSoWhat={() => submitSoWhat(previewMode)}
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
          lookupJargon={(term: string) => lookupJargon(previewMode, term)}
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
