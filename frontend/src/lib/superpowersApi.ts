import api from "./api";
import type { Annotation, MethodologyElement, CriticalPrompt, QuizQuestion, QuizResult, ReadingStats } from "../types/superpowers";

// ── Annotations ────────────────────────────────────────────────────────────

export const listAnnotations = (sessionId: string) =>
  api.get<Annotation[]>(`/superpowers/annotations/${sessionId}`).then((r) => r.data);

export const createAnnotation = (payload: {
  session_id: string; section_index: number;
  start_char: number; end_char: number;
  highlight_text: string; color?: string; category?: string;
}) =>
  api.post<Annotation>("/superpowers/annotations", payload).then((r) => r.data);

export const updateAnnotation = (annotationId: string, updates: { note_text?: string; color?: string; category?: string }) =>
  api.patch(`/superpowers/annotations/${annotationId}`, updates).then((r) => r.data);

export const deleteAnnotation = (annotationId: string) =>
  api.delete(`/superpowers/annotations/${annotationId}`).then((r) => r.data);

export const getAnnotationAiPrompt = (annotationId: string) =>
  api.post<{ prompt: string }>(`/superpowers/annotations/${annotationId}/ai-prompt`).then((r) => r.data);

// ── Methodology ────────────────────────────────────────────────────────────

export const getMethodologyElements = (assignmentId: string, sectionIndex: number) =>
  api.get<MethodologyElement[]>(`/superpowers/methodology/${assignmentId}/${sectionIndex}`).then((r) => r.data);

// ── Critical Prompts ───────────────────────────────────────────────────────

export const getCriticalPrompt = (assignmentId: string, sectionIndex: number) =>
  api.get<CriticalPrompt>(`/superpowers/critical-prompts/${assignmentId}/${sectionIndex}`).then((r) => r.data);

// ── Quiz ──────────────────────────────────────────────────────────────────

export const getQuiz = (assignmentId: string) =>
  api.get<QuizQuestion[]>(`/superpowers/quiz/${assignmentId}`).then((r) => r.data);

export const generateQuiz = (assignmentId: string) =>
  api.post<QuizQuestion[]>(`/superpowers/quiz/${assignmentId}/generate`).then((r) => r.data);

export const submitQuizAttempt = (assignmentId: string, answers: Record<string, string>) =>
  api.post<QuizResult>("/superpowers/quiz/attempt", { assignment_id: assignmentId, answers }).then((r) => r.data);

// ── Stats ─────────────────────────────────────────────────────────────────

export const getStats = () =>
  api.get<ReadingStats>("/superpowers/stats").then((r) => r.data);

export const addXp = (action: string) =>
  api.post<{ xp: number; level: number; streak: number; xp_earned: number }>("/superpowers/stats/xp", { action }).then((r) => r.data);

// ── Recommendations ───────────────────────────────────────────────────────

export const getRecommendations = () =>
  api.get("/superpowers/recommendations").then((r) => r.data);
