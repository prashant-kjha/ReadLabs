import api from "./api";

// ── Annotations ────────────────────────────────────────────────────────────

export const listAnnotations = (sessionId) =>
  api.get(`/superpowers/annotations/${sessionId}`).then((r) => r.data);

export const createAnnotation = (payload) =>
  api.post("/superpowers/annotations", payload).then((r) => r.data);

export const updateAnnotation = (annotationId, updates) =>
  api.patch(`/superpowers/annotations/${annotationId}`, updates).then((r) => r.data);

export const deleteAnnotation = (annotationId) =>
  api.delete(`/superpowers/annotations/${annotationId}`).then((r) => r.data);

export const getAnnotationAiPrompt = (annotationId) =>
  api.post(`/superpowers/annotations/${annotationId}/ai-prompt`).then((r) => r.data);

// ── Methodology ────────────────────────────────────────────────────────────

export const getMethodologyElements = (assignmentId, sectionIndex) =>
  api.get(`/superpowers/methodology/${assignmentId}/${sectionIndex}`).then((r) => r.data);

// ── Critical Prompts ───────────────────────────────────────────────────────

export const getCriticalPrompt = (assignmentId, sectionIndex) =>
  api.get(`/superpowers/critical-prompts/${assignmentId}/${sectionIndex}`).then((r) => r.data);

// ── Quiz ──────────────────────────────────────────────────────────────────

export const getQuiz = (assignmentId) =>
  api.get(`/superpowers/quiz/${assignmentId}`).then((r) => r.data);

export const generateQuiz = (assignmentId) =>
  api.post(`/superpowers/quiz/${assignmentId}/generate`).then((r) => r.data);

export const submitQuizAttempt = (assignmentId, answers) =>
  api.post("/superpowers/quiz/attempt", { assignment_id: assignmentId, answers }).then((r) => r.data);

// ── Stats ─────────────────────────────────────────────────────────────────

export const getStats = () =>
  api.get("/superpowers/stats").then((r) => r.data);

export const addXp = (action) =>
  api.post("/superpowers/stats/xp", { action }).then((r) => r.data);

// ── Recommendations ───────────────────────────────────────────────────────

export const getRecommendations = () =>
  api.get("/superpowers/recommendations").then((r) => r.data);
