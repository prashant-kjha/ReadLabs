import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { Plus, BookOpen, X } from "lucide-react";

interface EnrolledClass {
  class_id: string;
  class_name: string;
  class_code: string;
  teacher_name: string;
  assignments: { id: string; paper_title: string; difficulty: string }[];
}

interface SessionInfo {
  assignment_id: string;
  status: "not_started" | "in_progress" | "completed";
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "badge border border-border bg-surface-raised text-success",
  intermediate: "badge border border-border bg-surface-raised text-warning",
  advanced: "badge border border-border bg-surface-raised text-danger",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "badge bg-muted text-[var(--color-text-secondary)]",
  in_progress: "badge bg-primary-light text-primary",
  completed: "badge bg-primary text-[var(--color-primary-foreground)]",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function StudentDashboardPage() {
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [classCode, setClassCode] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [classRes, sessionRes] = await Promise.all([
        api.get("/enrollment/classes"),
        api.get("/sessions/"),
      ]);
      setClasses(classRes.data);
      setSessions(sessionRes.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!classCode.trim()) return;
    setJoining(true);
    try {
      await api.post("/enrollment/join", { class_code: classCode.trim().toUpperCase() });
      toast.success("Joined class!");
      setShowModal(false);
      setClassCode("");
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not join class");
    } finally {
      setJoining(false);
    }
  };

  const getSessionStatus = (assignmentId: string): string => {
    const session = sessions.find((s) => s.assignment_id === assignmentId);
    return session ? session.status : "not_started";
  };

  const getSessionLabel = (status: string): string => {
    return STATUS_LABELS[status] || status;
  };

  if (loading) return <div className="p-8 font-mono text-sm text-[var(--color-text-secondary)]">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="label-mono text-accent">Student · Reading Desk</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">My Classes</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Join a Class
        </button>
      </div>

      {/* Join modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm rounded-sm bg-surface-raised border-[var(--color-border-strong)] shadow-print">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">Join a Class</h2>
              <button onClick={() => { setShowModal(false); setClassCode(""); }} className="text-[var(--color-text-secondary)] hover:text-accent transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                placeholder="Class code (e.g. BIO-4X2K)"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                className="input-field font-mono tracking-widest"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={joining}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {joining ? "Joining..." : "Join"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setClassCode(""); }}
                  className="btn-outline flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Classes list */}
      {classes.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[var(--color-muted-foreground)] p-10 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-muted-foreground)] mx-auto mb-3" strokeWidth={1.25} />
          <p className="font-display italic text-[var(--color-text-secondary)]">No classes yet. Join one using a class code from your teacher.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {classes.map((cls) => (
            <div key={cls.class_id} className="card p-0 overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-dashed border-border">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">{cls.class_name}</h2>
                  <span className="font-mono text-xs text-accent shrink-0">{cls.class_code}</span>
                </div>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Teacher: {cls.teacher_name}</p>
              </div>

              {cls.assignments.length === 0 ? (
                <p className="px-5 py-4 font-display italic text-sm text-[var(--color-text-secondary)]">No published assignments yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {cls.assignments.map((asgn, idx) => {
                    const status = getSessionStatus(asgn.id);
                    return (
                      <button
                        key={asgn.id}
                        onClick={() => navigate(`/student/read/${asgn.id}`)}
                        className="group w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 transition-colors hover:bg-muted"
                      >
                        <div className="flex items-baseline gap-3 min-w-0">
                          <span aria-hidden="true" className="font-mono text-[10px] text-[var(--color-muted-foreground)] shrink-0">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          <div className="min-w-0">
                            <p className="font-display text-sm font-medium text-[var(--color-text)] group-hover:text-primary transition-colors">{asgn.paper_title}</p>
                            <span className={`inline-block mt-1.5 font-mono uppercase tracking-wider ${DIFFICULTY_COLORS[asgn.difficulty] || "badge bg-muted text-[var(--color-text-secondary)]"}`}>
                              {asgn.difficulty}
                            </span>
                          </div>
                        </div>
                        <span className={`shrink-0 font-mono uppercase tracking-wide ${STATUS_COLORS[status]}`}>
                          {getSessionLabel(status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
