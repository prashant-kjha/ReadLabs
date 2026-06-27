import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { libraryApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import { Search, BookOpen } from "lucide-react";
import LandmarkPaperCard from "../../components/landmark/LandmarkPaperCard";
import AssignToClassModal from "../../components/landmark/AssignToClassModal";
import type { LandmarkPaper } from "../../types/landmark";

export default function LandmarkLibraryPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isTeacher = role === "teacher";
  const [papers, setPapers] = useState<LandmarkPaper[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
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
      // Sessions are student-scoped (the /sessions/ list is the caller's own).
      // Teachers never start reading here, so skip that fetch for them.
      // NOTE: leave `r.data` untyped — axios infers `any`, which is what makes
      // the `.map((s: { assignment_id: string }) => …)` annotation type-check
      // (matching the proven Phase 1 page). Do not cast it.
      const [res, sessions] = await Promise.all([
        libraryApi.landmarks({ q: q || undefined, limit: 24, offset: 0 }),
        isTeacher ? Promise.resolve([]) : api.get("/sessions/").then((r) => r.data).catch(() => []),
      ]);
      setPapers(res.items);
      setStartedIds(new Set((sessions || []).map((s: { assignment_id: string }) => s.assignment_id)));
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
      ) : papers.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-muted-foreground)] p-10 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-muted-foreground)] mx-auto mb-3" strokeWidth={1.25} />
          <p className="font-display italic text-[var(--color-text-secondary)]">No papers found. Try a different search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {papers.map((p) => (
            <LandmarkPaperCard
              key={p.paper_id}
              paper={p}
              role={role ?? undefined}
              startedAssignmentIds={startedIds}
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
