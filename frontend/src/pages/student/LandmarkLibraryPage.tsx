import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { libraryApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import { Search, BookOpen } from "lucide-react";
import LandmarkPaperCard from "../../components/landmark/LandmarkPaperCard";
import AssignToClassModal from "../../components/landmark/AssignToClassModal";
import type { LandmarkPaper, LandmarkProgressEntry } from "../../types/landmark";

type PaperStatus = "not_started" | "in_progress" | "completed";
type Filter = "all" | PaperStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "not_started", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

// A paper's rollup status across its started levels: completed beats in-progress
// beats not-started. (A paper can have a session on one difficulty but not another.)
function paperStatus(paper: LandmarkPaper, progress: Map<string, LandmarkProgressEntry>): PaperStatus {
  const statuses = paper.levels
    .map((l) => progress.get(l.assignment_id)?.status)
    .filter((s): s is LandmarkProgressEntry["status"] => Boolean(s));
  if (statuses.includes("completed")) return "completed";
  if (statuses.includes("in_progress")) return "in_progress";
  return "not_started";
}

export default function LandmarkLibraryPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const [papers, setPapers] = useState<LandmarkPaper[]>([]);
  const [progressByAssignment, setProgressByAssignment] = useState<Map<string, LandmarkProgressEntry>>(new Map());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ paper: LandmarkPaper; difficulty: string } | null>(null);

  // Debounced load on query change (also fires once on mount with empty query).
  useEffect(() => {
    const t = setTimeout(() => {
      load(query.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const load = async (q: string) => {
    setLoading(true);
    try {
      // Landmark progress is student-scoped: the endpoint returns only the
      // caller's sessions on landmark assignments. Teachers never read here,
      // so skip the fetch for them.
      const [res, progress] = await Promise.all([
        libraryApi.landmarks({ q: q || undefined, limit: 24, offset: 0 }),
        isTeacher
          ? Promise.resolve({ progress: [] as LandmarkProgressEntry[] })
          : libraryApi.getLandmarkProgress().catch(() => ({ progress: [] as LandmarkProgressEntry[] })),
      ]);
      setPapers(res.items);
      setProgressByAssignment(new Map((progress.progress || []).map((e) => [e.assignment_id, e])));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not load library");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (assignmentId: string) => {
    setStarting(true);
    try {
      await api.post("/sessions/", { assignment_id: assignmentId });
      navigate(`/student/read/${assignmentId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not start reading");
    } finally {
      setStarting(false);
    }
  };

  const handleAssign = (paper: LandmarkPaper, difficulty: string) => {
    setAssignTarget({ paper, difficulty });
  };

  // Progress summary + filters are student-only (teachers don't read here).
  const showProgress = !isTeacher;
  const startedCount = showProgress
    ? papers.filter((p) => paperStatus(p, progressByAssignment) !== "not_started").length
    : 0;
  const completedCount = showProgress
    ? papers.filter((p) => paperStatus(p, progressByAssignment) === "completed").length
    : 0;
  const visible =
    showProgress && filter !== "all"
      ? papers.filter((p) => paperStatus(p, progressByAssignment) === filter)
      : papers;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="label-mono text-accent">{isTeacher ? "Teacher" : "Student"} · Landmark Library</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Landmark Papers</h1>
        {isTeacher && (
          <p className="mt-2 font-mono text-xs text-[var(--color-text-secondary)]">
            Assign a classic paper to a class — students read the pre-built guide, no AI generation needed.
          </p>
        )}
      </div>

      {/* My Progress summary + filter chips (student only). */}
      {showProgress && (
        <div className="mb-6">
          <p data-testid="landmark-progress-summary" className="font-mono text-xs text-[var(--color-text-secondary)] mb-2">
            <span className="text-[var(--color-text)] font-semibold">{startedCount}</span> started ·{" "}
            <span className="text-[var(--color-text)] font-semibold">{completedCount}</span> completed
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by progress">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`font-mono text-xs px-3 py-1 rounded-sm border transition-colors ${
                  filter === f.key
                    ? "bg-primary text-[var(--color-primary-foreground)] border-primary"
                    : "border-border bg-surface-raised text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); load(query.trim()); }} className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search landmark papers..."
            className="input-field pl-9"
            aria-label="Search landmark papers"
          />
        </div>
      </form>

      {loading ? (
        <p className="font-mono text-sm text-[var(--color-text-secondary)]">Loading...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-muted-foreground)] p-10 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-muted-foreground)] mx-auto mb-3" strokeWidth={1.25} />
          <p className="font-display italic text-[var(--color-text-secondary)]">
            {showProgress && filter !== "all" ? "No papers in this category yet." : "No papers found. Try a different search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map((p) => (
            <LandmarkPaperCard
              key={p.paper_id}
              paper={p}
              role={role ?? undefined}
              progressByAssignment={progressByAssignment}
              onStart={handleStart}
              onAssign={handleAssign}
            />
          ))}
        </div>
      )}

      {starting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {assignTarget && (
        <AssignToClassModal
          paper={assignTarget.paper}
          difficulty={assignTarget.difficulty}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
