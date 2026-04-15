import axios from 'axios';
import { supabase } from './supabase';

export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Auto-refresh on token expiry (safety net — Supabase client handles most refreshes)
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (
      err.response?.status === 401 &&
      err.response?.data?.detail === "Token expired" &&
      !original._retry
    ) {
      original._retry = true;
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          // Persist refreshed tokens
          const stored = localStorage.getItem("readlab_user");
          if (stored) {
            const parsed = JSON.parse(stored);
            localStorage.setItem("readlab_user", JSON.stringify({
              ...parsed,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }));
          }
          original.headers.Authorization = `Bearer ${session.access_token}`;
          return api(original);
        }
      } catch {
        // Refresh failed — force re-login
        localStorage.removeItem("readlab_user");
        window.location.href = "/auth";
        return Promise.reject(new Error("Session expired. Please log in again."));
      }
    }
    const msg = err.response?.data?.detail || err.message || "An error occurred";
    return Promise.reject(new Error(msg));
  }
);

// ── PDF URL ────────────────────────────────────────────────────────────────
export const getPdfUrl = (paperId) => api.get(`/papers/${paperId}/pdf-url`).then((r) => r.data);

// ── Papers ──────────────────────────────────────────────────────────────────
export const papersApi = {
  ingestDoi: (doi) => api.post('/papers/doi', { doi }),
  uploadPdf: (file, title) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    return api.post('/papers/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  search: (query, source = 'openalex', limit = 10) =>
    api.get('/papers/search', { params: { query, source, limit } }),
  getLibrary: () => api.get('/papers/library'),
  getPaper: (id) => api.get(`/papers/${id}`),
};

// ── Summaries ────────────────────────────────────────────────────────────────
export const summariesApi = {
  generate: (paperId) => api.post(`/summaries/${paperId}`),
  regenerate: (paperId) => api.post(`/summaries/${paperId}`, null, { params: { regenerate: true } }),
  get: (paperId) => api.get(`/summaries/${paperId}`),
};

// ── Chat ─────────────────────────────────────────────────────────────────────
export const chatApi = {
  send: (paperId, message, history = []) =>
    api.post('/chat/', { paper_id: paperId, message, history }),
  sendMulti: (paperIds, message, history = []) =>
    api.post('/chat/multi', { paper_ids: paperIds, message, history }),
  // Streaming handled separately with fetch + EventSource
};

// ── Related ──────────────────────────────────────────────────────────────────
export const relatedApi = {
  get: (paperId, limit = 4) => api.get(`/related/${paperId}`, { params: { limit } }),
};

// ── Library ──────────────────────────────────────────────────────────────────
export const libraryApi = {
  getHistory: () => api.get('/library/history'),
  recordView: (paperId) => api.post(`/library/history/${paperId}`),
  updateTags: (paperId, tags) => api.patch(`/library/${paperId}/tags`, { tags }),
  updateNotes: (paperId, notes) => api.patch(`/library/${paperId}/notes`, { notes }),
  updateStatus: (paperId, status) => api.patch(`/library/${paperId}/status`, { status }),
  getMeta: (paperId) => api.get(`/library/${paperId}/meta`),
  generateBibliography: (paperIds, style) =>
    api.post('/library/bibliography', { paper_ids: paperIds, style }),
};


// ── Conversations ─────────────────────────────────────────────────────────────
export const conversationsApi = {
  get: (paperId) => api.get(`/conversations/${paperId}`),
  addMessage: (paperId, role, content) =>
    api.post(`/conversations/${paperId}/message`, { role, content }),
  clear: (paperId) => api.delete(`/conversations/${paperId}`),
};

// ── PDF URL ───────────────────────────────────────────────────────────────────
export const pdfApi = {
  getUrl: (paperId) => api.get(`/papers/${paperId}/pdf-url`),
};

// ── Bibliographies ────────────────────────────────────────────────────────────
export const bibliographiesApi = {
  list: () => api.get('/bibliographies'),
  create: (name, description = '') => api.post('/bibliographies', { name, description }),
  get: (id) => api.get(`/bibliographies/${id}`),
  update: (id, updates) => api.patch(`/bibliographies/${id}`, updates),
  delete: (id) => api.delete(`/bibliographies/${id}`),
  getPaperIds: (id) => api.get(`/bibliographies/${id}/paper-ids`),
  addPapers: (id, paper_ids) => api.post(`/bibliographies/${id}/papers`, { paper_ids }),
  removePaper: (id, paperId) => api.delete(`/bibliographies/${id}/papers/${paperId}`),
  updateAnnotation: (id, paperId, annotation) =>
    api.patch(`/bibliographies/${id}/papers/${paperId}/annotation`, { annotation }),
  generateAnnotation: (id, paperId) =>
    api.post(`/bibliographies/${id}/papers/${paperId}/annotation/generate`),
  reorder: (id, order) => api.patch(`/bibliographies/${id}/papers/reorder`, { order }),
  getPaperMemberships: (paperId) => api.get(`/bibliographies/paper-memberships/${paperId}`),
  getChat: (id) => api.get(`/bibliographies/${id}/chat`),
  saveChatMessage: (id, role, content) =>
    api.post(`/bibliographies/${id}/chat/message`, { role, content }),
  clearChat: (id) => api.delete(`/bibliographies/${id}/chat`),
};

// ── Collections ────────────────────────────────────────────────────────────────
export const collectionsApi = {
  list: () => api.get('/collections'),
  create: (name, description = '', color = 'sky') =>
    api.post('/collections', { name, description, color }),
  get: (id) => api.get(`/collections/${id}`),
  update: (id, updates) => api.patch(`/collections/${id}`, updates),
  delete: (id) => api.delete(`/collections/${id}`),
  addPaper: (collectionId, paperId) =>
    api.post(`/collections/${collectionId}/papers/${paperId}`),
  removePaper: (collectionId, paperId) =>
    api.delete(`/collections/${collectionId}/papers/${paperId}`),
  getPaperIds: (collectionId) => api.get(`/collections/${collectionId}/paper-ids`),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

// ── Streaming chat helper ─────────────────────────────────────────────────────
export async function streamChat(paperId, message, history, onChunk, onDone, onError) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${API_URL}/api/v1/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ paper_id: paperId, message, history }),
  });

  if (!response.ok) {
    onError?.(new Error(`HTTP ${response.status}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { onDone?.(); return; }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.chunk) onChunk?.(parsed.chunk);
          if (parsed.error) onError?.(new Error(parsed.error));
        } catch {}
      }
    }
  }
  onDone?.();
}

// ── Bibliography streaming chat ───────────────────────────────────────────────
export async function streamBibliographyChat(bibId, message, history, onChunk, onDone, onError) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${API_URL}/api/v1/bibliographies/${bibId}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    onError?.(new Error(`HTTP ${response.status}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { onDone?.(); return; }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.chunk) onChunk?.(parsed.chunk);
          if (parsed.error) onError?.(new Error(parsed.error));
        } catch {}
      }
    }
  }
  onDone?.();
}

export default api;
