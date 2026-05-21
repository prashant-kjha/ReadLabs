import api from "./api";
import type { CriticalPrompt, QuizQuestion, QuizResult, ReadingStats } from "../types/superpowers";

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

export interface Recommendation {
  paper: { id: string; title: string };
  assignment_id: string;
  reason: string;
}

export const getRecommendations = () =>
  api.get<Recommendation[]>("/superpowers/recommendations").then((r) => r.data);
