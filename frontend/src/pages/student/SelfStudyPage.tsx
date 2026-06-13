import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { getRecommendations, type Recommendation } from "../../lib/superpowersApi";
import { Upload, Search, BookOpen, X } from "lucide-react";

interface LibraryPaper {
  id?: string;
  core_id?: string;
  title: string;
  authors?: string;
  year_published?: number;
  assignment?: { id: string; difficulty: string; status: string };
  fromSearch?: boolean;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "badge border border-border bg-surface-raised text-success",
  intermediate: "badge border border-border bg-surface-raised text-warning",
  advanced: "badge border border-border bg-surface-raised text-danger",
};

export default function SelfStudyPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LibraryPaper[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // Tracks mount status and the in-flight poll timeout so the self-rescheduling
  // poll below never calls setState/navigate after the user navigates away.
  const mountedRef = useRef(true);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPapers();
    getRecommendations().then(setRecommendations).catch(() => {
      // Recommendations are non-critical; fail silently
    });
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, []);

  const loadPapers = async () => {
    try {
      const { data } = await api.get("/library/browse");
      setPapers(data);
    } catch {
      toast.error("Could not load papers");
    }
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await api.get(`/library/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(data);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name.replace(".pdf", "").replace(/_/g, " "));
    try {
      const { data } = await api.post("/library/upload", form);
      toast.success("Paper uploaded! Generating reading guide...");
      pollAndNavigate(data.assignment_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
    e.target.value = "";
  };

  const handleFetchCore = async (coreId: string, title: string) => {
    setFetching(coreId);
    try {
      const { data } = await api.post("/library/fetch", { core_id: coreId, title });
      toast.success("Fetching paper... Generating reading guide...");
      pollAndNavigate(data.assignment_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not fetch paper");
      setFetching(null);
    }
  };

  const pollAndNavigate = async (assignmentId: string) => {
    let attempts = 0;
    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const { data } = await api.get(`/library/status/${assignmentId}`);
        if (!mountedRef.current) return;
        if (data.status === "published" || data.status === "draft") {
          setUploading(false);
          setFetching(null);
          await api.post(`/sessions/`, { assignment_id: assignmentId });
          if (!mountedRef.current) return;
          navigate(`/student/read/${assignmentId}`);
          return;
        }
      } catch {
        // Polling — transient errors are expected, retry
      }
      if (!mountedRef.current) return;
      attempts++;
      if (attempts < 90) {
        pollTimeoutRef.current = setTimeout(poll, 2000);
      } else {
        toast.error("Guide generation is taking too long. Check back later.");
        setUploading(false);
        setFetching(null);
      }
    };
    poll();
  };

  const handleStartReading = async (assignment: { id: string } | null) => {
    if (!assignment) {
      toast.error("Reading guide not ready yet");
      return;
    }
    try {
      await api.post(`/sessions/`, { assignment_id: assignment.id });
      navigate(`/student/read/${assignment.id}`);
    } catch {
      toast.error("Could not start reading");
    }
  };

  const displayPapers = searchResults !== null ? searchResults.map((r) => ({ ...r, fromSearch: true })) : papers;

  const startRecommendedPaper = async (assignmentId: string) => {
    setFetching(assignmentId);
    try {
      // The recommendation already points at an existing self-study assignment;
      // we just need to start a reading session for it.
      await api.post("/sessions/", { assignment_id: assignmentId });
      navigate(`/student/read/${assignmentId}`);
    } catch {
      toast.error("Could not start paper");
    } finally {
      setFetching(null);
    }
  };

  const RecommendationPanel = () => {
    if (recommendations.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="label-mono text-accent mb-3">Recommended for You</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {recommendations.map(({ paper, assignment_id, reason }) => (
            <div key={assignment_id} className="card-print p-4 shrink-0 w-64 flex flex-col" data-testid="recommendation-card">
              <div className="flex items-start gap-2 mb-1.5">
                <BookOpen className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p className="font-display text-sm font-semibold leading-snug text-[var(--color-text)]">{paper.title}</p>
              </div>
              <p className="font-display italic text-xs text-[var(--color-text-secondary)] mb-3 flex-1">{reason}</p>
              <button onClick={() => startRecommendedPaper(assignment_id)}
                disabled={fetching === assignment_id}
                data-testid="recommendation-start-button"
                className="btn-accent text-xs disabled:opacity-50">
                {fetching === assignment_id ? "Starting..." : "Start Reading"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="label-mono text-accent">Student · Open Stacks</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Paper Library</h1>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn-primary flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Processing..." : "Upload PDF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleUpload}
        />
      </div>

      <RecommendationPanel />

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search open-access papers..."
            className="input-field pl-9"
            aria-label="Search open-access papers"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !searchQuery.trim()}
          className="btn-secondary disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
        {searchResults !== null && (
          <button
            type="button"
            onClick={() => { setSearchResults(null); setSearchQuery(""); }}
            className="text-[var(--color-text-secondary)] hover:text-accent text-sm px-3 flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </form>

      {/* Results */}
      {displayPapers.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-muted-foreground)] p-10 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-muted-foreground)] mx-auto mb-3" strokeWidth={1.25} />
          <p className="font-display italic text-[var(--color-text-secondary)]">
            {searchResults !== null ? "No papers found. Try a different search." : "No papers in the library yet. Upload one or search above."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayPapers.map((paper) => (
            <div key={paper.id || paper.core_id} className="card-hover p-4 flex flex-col">
              <h3 className="font-display text-sm font-semibold leading-snug text-[var(--color-text)] mb-2">{paper.title}</h3>
              {paper.authors && <p className="font-mono text-[11px] text-[var(--color-text-secondary)] mb-0.5">{paper.authors}</p>}
              {paper.year_published && <p className="font-mono text-[11px] text-[var(--color-text-secondary)] mb-2">{paper.year_published}</p>}

              {paper.fromSearch ? (
                /* CORE search result */
                <button
                  onClick={() => handleFetchCore(paper.core_id!, paper.title)}
                  disabled={fetching === paper.core_id}
                  className="btn-primary w-full mt-auto text-sm disabled:opacity-50"
                >
                  {fetching === paper.core_id ? "Fetching..." : "Add to Library & Read"}
                </button>
              ) : paper.assignment ? (
                /* Already in library */
                <div className="mt-auto">
                  <span className={`inline-block font-mono uppercase tracking-wider ${DIFFICULTY_COLORS[paper.assignment.difficulty] || "badge bg-muted text-[var(--color-text-secondary)]"}`}>
                    {paper.assignment.difficulty || "—"}
                  </span>
                  <button
                    onClick={() => handleStartReading(paper.assignment ?? null)}
                    className="btn-secondary w-full mt-2 text-sm"
                  >
                    {paper.assignment.status === "published" ? "Start Reading" : "Processing..."}
                  </button>
                </div>
              ) : (
                <p className="font-display italic text-xs text-[var(--color-text-secondary)]">No reading guide yet.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload processing overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card-print p-8 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="font-display font-semibold text-[var(--color-text)]">Generating reading guide...</p>
            <p className="font-mono text-xs text-[var(--color-text-secondary)] mt-2">This takes 10-30 seconds.</p>
          </div>
        </div>
      )}
    </div>
  );
}
