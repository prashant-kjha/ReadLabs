import { create } from "zustand";
import api, { getPdfUrl } from "../lib/api";
import { addXp } from "../lib/superpowersApi";
import toast from "react-hot-toast";
import type { ReadingGuide, Section } from "../types/sessions";
import type { QuizQuestion, QuizResult } from "../types/superpowers";

interface CheckpointState {
  text: string;
  ai_feedback: string | null;
  pending: boolean;
  skipped: boolean;
}

interface SoWhatState {
  text: string;
  ai_feedback: string | null;
  pending: boolean;
  skipped: boolean;
}

interface ReadingState {
  // Session
  loading: boolean;
  sessionId: string | null;
  readingGuide: ReadingGuide | null;
  paperTitle: string;
  currentSection: number;
  currentAssignmentId: string | null;

  // PDF
  pdfUrl: string | null;

  // Checkpoints: keyed by section index
  checkpoints: Record<number, CheckpointState>;

  // So What
  soWhat: SoWhatState;

  // Jargon
  jargonExplanation: string | null;
  jargonPending: boolean;

  // Quiz
  quizQuestions: QuizQuestion[];
  quizAnswers: Record<string, string>;
  quizResults: QuizResult | null;
  quizGenerating: boolean;
  quizSubmitting: boolean;

  // Layout
  sectionsCollapsed: boolean;
  aiPanelWidth: number;
  aiPanelVisible: boolean;

  // Polling
  _pollIntervalId: ReturnType<typeof setInterval> | null;

  // Actions
  initPreview: (assignmentId: string) => Promise<void>;
  initSession: (assignmentId: string) => Promise<void>;
  setCurrentSection: (index: number) => void;
  advanceSection: () => Promise<void>;
  updateCpText: (sectionIndex: number, text: string) => void;
  submitCheckpoint: (previewMode: boolean) => Promise<void>;
  skipCheckpoint: (optionalCheckpoints: boolean) => Promise<void>;
  updateSoWhat: (val: string | Partial<SoWhatState>) => void;
  submitSoWhat: (previewMode: boolean) => Promise<void>;
  lookupJargon: (previewMode: boolean, term: string) => Promise<void>;
  setSectionsCollapsed: (collapsed: boolean) => void;
  setAiPanelWidth: (width: number) => void;
  setAiPanelVisible: (visible: boolean) => void;
  setQuizAnswers: (answers: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setQuizResults: (results: QuizResult | null) => void;
  setQuizGenerating: (v: boolean) => void;
  setQuizSubmitting: (v: boolean) => void;
  setQuizQuestions: (questions: QuizQuestion[]) => void;
  cleanup: () => void;
}

function startPolling(
  get: () => ReadingState,
  set: (partial: Partial<ReadingState>) => void
) {
  const { sessionId, _pollIntervalId } = get();
  if (_pollIntervalId || !sessionId) return;
  const id = setInterval(async () => {
    try {
      const { data } = await api.get(`/sessions/${sessionId}`);
      let pending = false;
      const cpMap: Record<number, CheckpointState> = {};
      (data.checkpoints || []).forEach((cp: { section_index: number; student_text: string; ai_feedback: string | null }) => {
        cpMap[cp.section_index] = {
          text: cp.student_text,
          ai_feedback: cp.ai_feedback,
          pending: !cp.ai_feedback,
          skipped: false,
        };
        if (!cp.ai_feedback) pending = true;
      });
      set({ checkpoints: cpMap });
      if (data.sowhat) {
        const current = get().soWhat;
        const sowhatFeedback = data.sowhat.ai_feedback;
        set({ soWhat: { ...current, ai_feedback: sowhatFeedback, pending: !sowhatFeedback } });
        if (!data.sowhat.ai_feedback) pending = true;
      }
      if (!pending) {
        clearInterval(id);
        set({ _pollIntervalId: null });
      }
    } catch {
      // ignore polling errors
    }
  }, 2000);
  set({ _pollIntervalId: id });
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  loading: true,
  sessionId: null,
  readingGuide: null,
  paperTitle: "",
  currentSection: 0,
  currentAssignmentId: null,
  pdfUrl: null,
  checkpoints: {},
  soWhat: { text: "", ai_feedback: null, pending: false, skipped: false },
  jargonExplanation: null,
  jargonPending: false,
  quizQuestions: [],
  quizAnswers: {},
  quizResults: null,
  quizGenerating: false,
  quizSubmitting: false,
  sectionsCollapsed: localStorage.getItem("readlab_sections_collapsed") === "true",
  aiPanelWidth: parseInt(localStorage.getItem("readlab_ai_panel_width") || "340", 10),
  aiPanelVisible: true,
  _pollIntervalId: null,

  initPreview: async (assignmentId) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/assignments/${assignmentId}`);
      set({
        readingGuide: data.reading_guide,
        paperTitle: data.paper_title || "Paper Preview",
        loading: false,
      });
    } catch (err: unknown) {
      set({ loading: false });
      toast.error(err instanceof Error ? err.message : "Could not load assignment");
    }
  },

  initSession: async (assignmentId) => {
    set({ loading: true });
    try {
      const { data } = await api.post("/sessions/", { assignment_id: assignmentId });
      const cpMap: Record<number, CheckpointState> = {};
      (data.checkpoints || []).forEach((cp: { section_index: number; student_text: string; ai_feedback: string | null }) => {
        cpMap[cp.section_index] = {
          text: cp.student_text,
          ai_feedback: cp.ai_feedback,
          pending: !cp.ai_feedback && !!cp.student_text,
          skipped: false,
        };
      });
      const soWhatState: SoWhatState = data.sowhat
        ? { text: data.sowhat.student_text, ai_feedback: data.sowhat.ai_feedback, pending: !data.sowhat.ai_feedback, skipped: false }
        : { text: "", ai_feedback: null, pending: false, skipped: false };

      let pdfUrl: string | null = null;
      if (data.paper_id) {
        try {
          const pdfData = await getPdfUrl(data.paper_id);
          pdfUrl = pdfData.url;
        } catch {
          toast.error("Could not load PDF");
        }
      }
      set({
        sessionId: data.session_id,
        currentAssignmentId: data.assignment_id,
        readingGuide: data.reading_guide,
        paperTitle: data.paper_title || "Paper",
        currentSection: data.current_section_index || 0,
        checkpoints: cpMap,
        soWhat: soWhatState,
        pdfUrl,
        loading: false,
      });
    } catch (err: unknown) {
      set({ loading: false });
      toast.error(err instanceof Error ? err.message : "Could not start session");
    }
  },

  setCurrentSection: (index) => set({ currentSection: index }),

  advanceSection: async () => {
    const { currentSection, sessionId } = get();
    const next = currentSection + 1;
    set({ currentSection: next });
    if (sessionId) {
      api.patch(`/sessions/${sessionId}/progress`, { current_section_index: next }).catch(() => {});
      addXp("section").catch(() => {});
    }
  },

  updateCpText: (sectionIndex, text) => {
    set((s) => ({
      checkpoints: { ...s.checkpoints, [sectionIndex]: { ...(s.checkpoints[sectionIndex] ?? { text: "", ai_feedback: null, pending: false, skipped: false }), text } },
    }));
  },

  submitCheckpoint: async (previewMode) => {
    const { currentSection, checkpoints, readingGuide, sessionId } = get();
    const cp = checkpoints[currentSection];
    if (!cp?.text?.trim()) return;
    set((s) => ({ checkpoints: { ...s.checkpoints, [currentSection]: { ...(s.checkpoints[currentSection] ?? { text: "", ai_feedback: null, pending: false, skipped: false }), pending: true } } }));

    if (previewMode) {
      const section = readingGuide!.sections[currentSection]!;
      try {
        const { data } = await api.post("/sessions/preview/checkpoint", {
          section_title: section.title,
          guiding_questions: section.guiding_questions,
          student_text: cp.text,
        });
        set((s) => ({ checkpoints: { ...s.checkpoints, [currentSection]: { text: cp.text, ai_feedback: data.feedback, pending: false, skipped: false } } }));
      } catch {
        set((s) => ({ checkpoints: { ...s.checkpoints, [currentSection]: { ...(s.checkpoints[currentSection] ?? { text: "", ai_feedback: null, pending: false, skipped: false }), pending: false } } }));
        toast.error("Could not get feedback");
      }
      return;
    }

    try {
      await api.post(`/sessions/${sessionId}/checkpoint`, { section_index: currentSection, student_text: cp.text });
      addXp("checkpoint").catch(() => {});
      startPolling(get, set);
    } catch (err: unknown) {
      set((s) => ({ checkpoints: { ...s.checkpoints, [currentSection]: { ...(s.checkpoints[currentSection] ?? { text: "", ai_feedback: null, pending: false, skipped: false }), pending: false } } }));
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
  },

  skipCheckpoint: async (_optionalCheckpoints) => {
    const { currentSection, sessionId, readingGuide, checkpoints } = get();
    set((s) => ({ checkpoints: { ...s.checkpoints, [currentSection]: { text: "", ai_feedback: null, pending: false, skipped: true } } }));
    if (sessionId) {
      await api.patch(`/sessions/${sessionId}/progress`, { current_section_index: currentSection + 1 }).catch(() => {});
    }
    const sections = readingGuide!.sections;
    const isLast = currentSection === sections.length - 1;
    const allSectionsComplete = sections.every((_: Section, i: number) => checkpoints[i]?.ai_feedback);
    if (isLast && !allSectionsComplete) {
      set({ currentSection: sections.length });
    } else if (!isLast) {
      await get().advanceSection();
    }
  },

  updateSoWhat: (val) => {
    if (typeof val === "string") {
      set((s) => ({ soWhat: { ...s.soWhat, text: val } }));
    } else {
      set((s) => ({ soWhat: { ...s.soWhat, ...val } }));
    }
  },

  submitSoWhat: async (previewMode) => {
    const { soWhat, paperTitle, readingGuide, sessionId } = get();
    if (!soWhat.text.trim()) return;
    set({ soWhat: { ...soWhat, pending: true } });

    if (previewMode) {
      try {
        const { data } = await api.post("/sessions/preview/sowhat", {
          paper_title: paperTitle,
          section_titles: readingGuide!.sections.map((s: Section) => s.title),
          difficulty: readingGuide!.difficulty || "intermediate",
          student_text: soWhat.text,
        });
        set({ soWhat: { ...get().soWhat, ai_feedback: data.feedback, pending: false } });
      } catch {
        set({ soWhat: { ...get().soWhat, pending: false } });
        toast.error("Could not get feedback");
      }
      return;
    }

    try {
      await api.post(`/sessions/${sessionId}/sowhat`, { student_text: soWhat.text });
      addXp("sowhat").catch(() => {});
      startPolling(get, set);
    } catch (err: unknown) {
      set({ soWhat: { ...get().soWhat, pending: false } });
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
  },

  lookupJargon: async (previewMode, term) => {
    const trimmedTerm = (term || "").trim();
    if (!trimmedTerm) return;
    const { currentSection, readingGuide, sessionId } = get();
    const section = readingGuide!.sections[currentSection];
    const context = section?.text?.slice(0, 500) || "";
    set({ jargonPending: true, jargonExplanation: null });

    const endpoint = previewMode ? "/sessions/preview/jargon" : `/sessions/${sessionId}/jargon`;
    try {
      const { data } = await api.post(endpoint, { term: trimmedTerm, context_snippet: context });
      if (data.explanation) {
        set({ jargonExplanation: data.explanation, jargonPending: false });
      } else {
        startPolling(get, set);
      }
    } catch {
      set({ jargonPending: false });
      toast.error("Lookup failed");
    }
  },

  setSectionsCollapsed: (collapsed) => {
    localStorage.setItem("readlab_sections_collapsed", String(collapsed));
    set({ sectionsCollapsed: collapsed });
  },

  setAiPanelWidth: (width) => {
    localStorage.setItem("readlab_ai_panel_width", String(width));
    set({ aiPanelWidth: width });
  },

  setAiPanelVisible: (visible) => set({ aiPanelVisible: visible }),
  setQuizAnswers: (answers) => {
    if (typeof answers === "function") {
      set({ quizAnswers: answers(get().quizAnswers) });
    } else {
      set({ quizAnswers: answers });
    }
  },
  setQuizResults: (results) => set({ quizResults: results }),
  setQuizGenerating: (v) => set({ quizGenerating: v }),
  setQuizSubmitting: (v) => set({ quizSubmitting: v }),
  setQuizQuestions: (questions) => set({ quizQuestions: questions }),

  cleanup: () => {
    const { _pollIntervalId } = get();
    if (_pollIntervalId) clearInterval(_pollIntervalId);
    set({ _pollIntervalId: null });
  },
}));
