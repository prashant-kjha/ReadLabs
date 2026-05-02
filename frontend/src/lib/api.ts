import axios from "axios";
import { supabase } from "./supabase";
import type { PaperUploadResponse, PaperListItem, Paper } from "../types/papers";
import type { ClassItem, ClassWithStudents, EnrolledClass } from "../types/classes";
import type { AuthResponse } from "../types/auth";
import type { Session, SessionDetail } from "../types/sessions";

export const API_URL: string =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  if (config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  return config;
});

// Auto-refresh on token expiry
api.interceptors.response.use(
  (res) => res,
  async (err: { config?: Record<string, unknown>; response?: { status?: number; data?: { detail?: string } }; message?: string }) => {
    const original = err.config;
    if (
      err.response?.status === 401 &&
      err.response?.data?.detail === "Token expired" &&
      original &&
      !original._retry
    ) {
      original._retry = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          const stored = localStorage.getItem("readlab_user");
          if (stored) {
            const parsed = JSON.parse(stored);
            localStorage.setItem(
              "readlab_user",
              JSON.stringify({
                ...parsed,
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              })
            );
          }
          original.headers = {
            ...(original.headers || {}),
            Authorization: `Bearer ${session.access_token}`,
          };
          return api(original);
        }
      } catch {
        localStorage.removeItem("readlab_user");
        window.location.href = "/auth";
        return Promise.reject(new Error("Session expired. Please log in again."));
      }
    }
    const rawDetail = err.response?.data?.detail;
    const msg: string = rawDetail
      ? typeof rawDetail === "string"
        ? rawDetail
        : JSON.stringify(rawDetail)
      : err.message || "An error occurred";
    return Promise.reject(new Error(msg));
  }
);

// ── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  signup: (data: { email: string; password: string; name: string }) =>
    api
      .post<{ user_id: string; email_confirmation_required: boolean }>("/auth/signup", data)
      .then((r) => r.data),
  signin: (data: { email: string; password: string }) =>
    api.post<AuthResponse>("/auth/signin", data).then((r) => r.data),
  me: () =>
    api.get<{ user_id: string; name: string; role: string }>("/auth/me").then((r) => r.data),
};

// ── Papers ──────────────────────────────────────────────────────────────────

export const papersApi = {
  upload: (file: File, title?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    return api
      .post<PaperUploadResponse>("/papers/upload", form)
      .then((r) => r.data);
  },
  list: () =>
    api.get<PaperListItem[]>("/papers").then((r) => r.data),
  get: (id: string) =>
    api.get<Paper>(`/papers/${id}`).then((r) => r.data),
  getPdfUrl: (id: string) =>
    api.get<{ url: string }>(`/papers/${id}/pdf-url`).then((r) => r.data),
};

// ── Classes ─────────────────────────────────────────────────────────────────

export const classesApi = {
  create: (name: string) =>
    api.post<ClassItem>("/classes", { name }).then((r) => r.data),
  list: () =>
    api.get<ClassItem[]>("/classes").then((r) => r.data),
  get: (id: string) =>
    api.get<ClassWithStudents>(`/classes/${id}`).then((r) => r.data),
  removeStudent: (classId: string, studentId: string) =>
    api.delete(`/classes/${classId}/students/${studentId}`).then((r) => r.data),
};

// ── Assignments ─────────────────────────────────────────────────────────────

export const assignmentsApi = {
  create: (classId: string, paperId: string) =>
    api.post("/assignments", { class_id: classId, paper_id: paperId }).then((r) => r.data),
  get: (id: string) =>
    api.get(`/assignments/${id}`).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/assignments/${id}`, data).then((r) => r.data),
};

// ── Enrollment ──────────────────────────────────────────────────────────────

export const enrollmentApi = {
  join: (classCode: string) =>
    api.post("/enrollment/join", { class_code: classCode }).then((r) => r.data),
  listClasses: () =>
    api.get<EnrolledClass[]>("/enrollment/classes").then((r) => r.data),
  leave: (classId: string) =>
    api.delete(`/enrollment/classes/${classId}`).then((r) => r.data),
};

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessionsApi = {
  start: (assignmentId: string) =>
    api.post<Session>("/sessions", { assignment_id: assignmentId }).then((r) => r.data),
  get: (sessionId: string) =>
    api.get<SessionDetail>(`/sessions/${sessionId}`).then((r) => r.data),
  list: () =>
    api.get<SessionDetail[]>("/sessions").then((r) => r.data),
  updateProgress: (sessionId: string, currentSectionIndex: number) =>
    api.patch(`/sessions/${sessionId}/progress`, { current_section_index: currentSectionIndex }).then((r) => r.data),
  submitCheckpoint: (sessionId: string, sectionIndex: number, studentText: string) =>
    api.post(`/sessions/${sessionId}/checkpoint`, { section_index: sectionIndex, student_text: studentText }).then((r) => r.data),
  submitSowhat: (sessionId: string, studentText: string) =>
    api.post(`/sessions/${sessionId}/sowhat`, { student_text: studentText }).then((r) => r.data),
  lookupJargon: (sessionId: string, term: string, contextSnippet: string) =>
    api.post(`/sessions/${sessionId}/jargon`, { term, context_snippet: contextSnippet }).then((r) => r.data),
  lookupKeyterm: (sessionId: string, term: string, contextSnippet: string) =>
    api.post(`/sessions/${sessionId}/keyterm`, { term, context_snippet: contextSnippet }).then((r) => r.data),
};

// ── Dashboard (teacher) ────────────────────────────────────────────────────

export const dashboardApi = {
  classProgress: (classId: string) =>
    api.get(`/dashboard/classes/${classId}/progress`).then((r) => r.data),
  studentResponses: (assignmentId: string, studentId: string) =>
    api.get(`/dashboard/assignments/${assignmentId}/students/${studentId}/responses`).then((r) => r.data),
  assignmentInsights: (assignmentId: string) =>
    api.get(`/dashboard/assignments/${assignmentId}/insights`).then((r) => r.data),
};

// ── Library (self-study) ───────────────────────────────────────────────────

export const libraryApi = {
  upload: (file: File, title?: string, category?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (category) form.append("category", category);
    return api.post("/library/upload", form).then((r) => r.data);
  },
  getStatus: (assignmentId: string) =>
    api.get(`/library/status/${assignmentId}`).then((r) => r.data),
  search: (q: string) =>
    api.get("/library/search", { params: { q } }).then((r) => r.data),
  browse: (params?: { category?: string; limit?: number; offset?: number }) =>
    api.get("/library/browse", { params }).then((r) => r.data),
  fetchCore: (coreId: string, title: string) =>
    api.post("/library/fetch", { core_id: coreId, title }).then((r) => r.data),
};

export default api;

// Legacy named exports for backward compat with .jsx pages not yet converted
export const getPdfUrl = (paperId: string) => papersApi.getPdfUrl(paperId);
