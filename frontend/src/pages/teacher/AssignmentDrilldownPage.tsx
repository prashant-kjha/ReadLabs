import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, ChevronDown, ChevronUp, Sparkles, RefreshCw } from "lucide-react";

interface CheckpointResponse {
  section_index: number;
  student_text: string;
  ai_feedback?: string;
}

interface SoWhatResponse {
  student_text: string;
  ai_feedback?: string;
}

interface StudentResponseData {
  checkpoints: CheckpointResponse[];
  sowhat?: SoWhatResponse;
}

interface InsightSection {
  title: string;
  common_misconception: string;
  commonly_grasped: string;
  student_count: number;
}

interface InsightsData {
  sections?: InsightSection[];
  [key: string]: unknown;
}

interface StudentProgress {
  student_id: string;
  student_name: string;
}

function StudentResponseCard({ studentId, studentName, assignmentId }: { studentId: string; studentName: string; assignmentId: string | undefined }) {
  const [data, setData] = useState<StudentResponseData | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (data) return;
    try {
      const { data: res } = await api.get(
        `/dashboard/assignments/${assignmentId}/students/${studentId}/responses`
      );
      setData(res);
    } catch {
      toast.error("Could not load responses");
    }
  };

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted transition-colors"
        onClick={() => { setOpen(!open); load(); }}
      >
        <span className="text-[var(--color-text)] font-medium">{studentName}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--color-text-secondary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--color-text-secondary)]" />}
      </button>

      {open && data && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {data.checkpoints.length === 0 && (
            <p className="text-[var(--color-text-secondary)] text-sm">No responses yet.</p>
          )}
          {data.checkpoints.map((cp: CheckpointResponse, i: number) => (
            <div key={i} className="text-sm">
              <p className="text-[var(--color-text-secondary)] text-xs font-semibold uppercase tracking-wide mb-1">
                Section {cp.section_index + 1} response
              </p>
              <p className="text-[var(--color-text)] mb-2 bg-muted rounded p-2">{cp.student_text}</p>
              {cp.ai_feedback && (
                <p className="text-primary text-xs italic">{cp.ai_feedback}</p>
              )}
            </div>
          ))}
          {data.sowhat && (
            <div className="text-sm border-t border-border pt-4">
              <p className="text-[var(--color-text-secondary)] text-xs font-semibold uppercase tracking-wide mb-1">
                So What? response
              </p>
              <p className="text-[var(--color-text)] mb-2 bg-muted rounded p-2">{data.sowhat.student_text}</p>
              {data.sowhat.ai_feedback && (
                <p className="text-primary text-xs italic">{data.sowhat.ai_feedback}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InsightsPanel({ assignmentId }: { assignmentId: string | undefined }) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/dashboard/assignments/${assignmentId}/insights`);
      setInsights(data.insights || data);
    } catch {
      toast.error("Could not generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[var(--color-text)] font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Class Insights
          </h2>
          <p className="text-[var(--color-text-secondary)] text-xs mt-0.5">
            Common misconceptions and concepts students grasped, generated from all responses.
          </p>
        </div>
        {!insights ? (
          <button
            onClick={generate}
            disabled={loading}
            className="btn-primary text-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loading ? "Generating..." : "Generate Insights"}
          </button>
        ) : (
          <button
            onClick={generate}
            disabled={loading}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-xs transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            {loading ? "Refreshing..." : "Regenerate"}
          </button>
        )}
      </div>

      {insights && (
        <div className="space-y-4">
          {insights.sections?.map((section: InsightSection, i: number) => (
            <div key={i} className="border border-border rounded-lg p-4">
              <p className="text-[var(--color-text)] font-medium mb-3">{section.title}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-1">
                    Common misconception
                  </p>
                  <p className="text-[var(--color-text)] text-sm">{section.common_misconception}</p>
                </div>
                <div>
                  <p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-1">
                    Most commonly grasped
                  </p>
                  <p className="text-[var(--color-text)] text-sm">{section.commonly_grasped}</p>
                </div>
              </div>
              <p className="text-[var(--color-text-secondary)] text-xs mt-2">
                Based on {section.student_count} response{section.student_count !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {!insights && !loading && (
        <p className="text-[var(--color-text-secondary)] text-sm">
          Click "Generate Insights" to analyze all student responses for this assignment.
        </p>
      )}
    </div>
  );
}

export default function AssignmentDrilldownPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentProgress[]>([]);

  useEffect(() => {
    api.get(`/assignments/${assignmentId}`)
      .then(({ data: asn }) =>
        api.get(`/dashboard/classes/${asn.class_id}/progress`)
      )
      .then(({ data }) => setStudents(data.students || []))
      .catch(() => toast.error("Could not load assignment data"));
  }, [assignmentId]);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] text-sm mb-6 block transition-colors flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="section-heading mb-6">Assignment Responses</h1>

      <InsightsPanel assignmentId={assignmentId} />

      <h2 className="section-subheading mb-3">Student Responses</h2>
      <div className="space-y-2">
        {students.length === 0 && (
          <p className="text-[var(--color-text-secondary)] text-sm">No students have started this assignment yet.</p>
        )}
        {students.map((s: StudentProgress) => (
          <StudentResponseCard
            key={s.student_id}
            studentId={s.student_id}
            studentName={s.student_name}
            assignmentId={assignmentId}
          />
        ))}
      </div>
    </div>
  );
}
