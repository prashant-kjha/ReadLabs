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
  beginner: "badge bg-emerald-500/10 text-success",
  intermediate: "badge bg-amber-500/10 text-warning",
  advanced: "badge bg-red-500/10 text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "badge bg-muted text-[var(--color-text-secondary)]",
  in_progress: "badge bg-primary-light text-primary",
  completed: "badge bg-emerald-500/10 text-success",
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

  if (loading) return <div className="p-8 text-[var(--color-text-secondary)]">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-heading">My Classes</h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Join a Class
        </button>
      </div>

      {/* Join modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[var(--color-text)] font-semibold">Join a Class</h2>
              <button onClick={() => { setShowModal(false); setClassCode(""); }} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
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
        <div className="card p-8 text-center">
          <BookOpen className="w-10 h-10 text-[var(--color-text-secondary)] mx-auto mb-3" />
          <p className="text-[var(--color-text-secondary)] text-sm">No classes yet. Join one using a class code from your teacher.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {classes.map((cls) => (
            <div key={cls.class_id} className="card p-5">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-[var(--color-text)] font-semibold text-lg">{cls.class_name}</h2>
                <span className="text-xs text-[var(--color-text-secondary)] font-mono">{cls.class_code}</span>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm mb-4">Teacher: {cls.teacher_name}</p>

              {cls.assignments.length === 0 ? (
                <p className="text-[var(--color-text-secondary)] text-sm">No published assignments yet.</p>
              ) : (
                <div className="space-y-2">
                  {cls.assignments.map((asgn) => {
                    const status = getSessionStatus(asgn.id);
                    return (
                      <button
                        key={asgn.id}
                        onClick={() => navigate(`/student/read/${asgn.id}`)}
                        className="w-full text-left bg-muted hover:bg-muted/80 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="text-[var(--color-text)] text-sm font-medium">{asgn.paper_title}</p>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[asgn.difficulty] || "badge bg-muted text-[var(--color-text-secondary)]"}`}>
                            {asgn.difficulty}
                          </span>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[status]}`}>
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
