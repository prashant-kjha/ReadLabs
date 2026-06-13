import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, ChevronRight } from "lucide-react";

interface Session {
  assignment_id: string;
  current_section_index: number;
  status: string;
}

interface Student {
  student_id: string;
  student_name: string;
  sessions: Session[];
}

interface GuideSection {
  title?: string;
  [key: string]: unknown;
}

interface ReadingGuide {
  sections?: GuideSection[];
  [key: string]: unknown;
}

interface Assignment {
  id: string;
  difficulty: string;
  reading_guide?: ReadingGuide;
  [key: string]: unknown;
}

interface DashboardData {
  class?: { name: string };
  students: Student[];
  assignments: Assignment[];
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-[var(--color-text-secondary)] w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function TeacherDashboardPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get(`/dashboard/classes/${classId}/progress`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Could not load dashboard"));
  }, [classId]);

  if (!data) return <div className="p-8 font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Loading...</div>;

  const { students, assignments } = data;

  const totalSections = (asn: Assignment) =>
    asn?.reading_guide?.sections?.length ?? 0;

  const sessionFor = (student: Student, asnId: string) =>
    student.sessions.find((s: Session) => s.assignment_id === asnId);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-end justify-between mb-8 border-b border-[var(--color-border-strong)] pb-6">
        <div>
          <p className="label-mono text-accent">Teacher · Analytics</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">{data.class?.name}</h1>
        </div>
        <button
          onClick={() => navigate("/teacher/classes")}
          className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] font-mono text-xs uppercase tracking-wider transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Classes
        </button>
      </div>

      {students.length === 0 && (
        <p className="font-display italic text-[var(--color-text-secondary)] text-sm">No students enrolled yet.</p>
      )}

      {assignments.length === 0 && (
        <p className="font-display italic text-[var(--color-text-secondary)] text-sm mb-6">No published assignments yet.</p>
      )}

      {assignments.map((asn: Assignment) => (
        <div key={asn.id} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">
              Assignment
              <span className="font-mono font-normal text-xs tracking-wide text-[var(--color-text-secondary)] ml-2 capitalize">
                · {asn.difficulty}
              </span>
            </h2>
            <button
              onClick={() => navigate(`/teacher/assignments/${asn.id}/drilldown`)}
              className="text-accent hover:text-primary font-mono text-xs uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              View responses
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-strong)]">
                  <th className="text-left font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)] px-4 py-3">Student</th>
                  <th className="text-left font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)] px-4 py-3">Progress</th>
                  <th className="text-left font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-secondary)] px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student: Student) => {
                  const session = sessionFor(student, asn.id);
                  const completed = session?.current_section_index ?? 0;
                  const total = totalSections(asn);
                  const status = session?.status ?? "not_started";

                  return (
                    <tr
                      key={student.student_id}
                      className="border-b border-border last:border-0 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() =>
                        navigate(`/teacher/assignments/${asn.id}/students/${student.student_id}/responses`)
                      }
                    >
                      <td className="px-4 py-3 text-[var(--color-text)]">{student.student_name}</td>
                      <td className="px-4 py-3 w-48">
                        <ProgressBar value={completed} max={total || 1} />
                        <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">{completed}/{total} sections</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                          status === "completed"
                            ? "bg-success/10 text-success"
                            : status === "in_progress"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-[var(--color-text-secondary)]"
                        }`}>
                          {status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
