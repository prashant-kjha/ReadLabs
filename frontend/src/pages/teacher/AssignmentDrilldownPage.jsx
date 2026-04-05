import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

function StudentResponseCard({ studentId, studentName, assignmentId }) {
  const [data, setData] = useState(null);
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
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800 transition-colors"
        onClick={() => { setOpen(!open); load(); }}
      >
        <span className="text-white font-medium">{studentName}</span>
        <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && data && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-4">
          {data.checkpoints.length === 0 && (
            <p className="text-gray-500 text-sm">No responses yet.</p>
          )}
          {data.checkpoints.map((cp, i) => (
            <div key={i} className="text-sm">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">
                Section {cp.section_index + 1} response
              </p>
              <p className="text-gray-200 mb-2 bg-gray-800 rounded p-2">{cp.student_text}</p>
              {cp.ai_feedback && (
                <p className="text-indigo-300 text-xs italic">{cp.ai_feedback}</p>
              )}
            </div>
          ))}
          {data.sowhat && (
            <div className="text-sm border-t border-gray-800 pt-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">
                So What? response
              </p>
              <p className="text-gray-200 mb-2 bg-gray-800 rounded p-2">{data.sowhat.student_text}</p>
              {data.sowhat.ai_feedback && (
                <p className="text-indigo-300 text-xs italic">{data.sowhat.ai_feedback}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InsightsPanel({ assignmentId }) {
  const [insights, setInsights] = useState(null);
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
    <div className="bg-gray-900 rounded-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold">Class Insights</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            Common misconceptions and concepts students grasped, generated from all responses.
          </p>
        </div>
        {!insights ? (
          <button
            onClick={generate}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating..." : "Generate Insights"}
          </button>
        ) : (
          <button
            onClick={generate}
            disabled={loading}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            {loading ? "Refreshing..." : "Regenerate"}
          </button>
        )}
      </div>

      {insights && (
        <div className="space-y-4">
          {insights.sections?.map((section, i) => (
            <div key={i} className="border border-gray-800 rounded-lg p-4">
              <p className="text-white font-medium mb-3">{section.title}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-1">
                    Common misconception
                  </p>
                  <p className="text-gray-300 text-sm">{section.common_misconception}</p>
                </div>
                <div>
                  <p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-1">
                    Most commonly grasped
                  </p>
                  <p className="text-gray-300 text-sm">{section.commonly_grasped}</p>
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                Based on {section.student_count} response{section.student_count !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {!insights && !loading && (
        <p className="text-gray-500 text-sm">
          Click "Generate Insights" to analyze all student responses for this assignment.
        </p>
      )}
    </div>
  );
}

export default function AssignmentDrilldownPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);

  useEffect(() => {
    api.get(`/assignments/${assignmentId}`)
      .then(({ data: asn }) =>
        api.get(`/dashboard/classes/${asn.class_id}/progress`)
      )
      .then(({ data }) => setStudents(data.students || []))
      .catch(() => toast.error("Could not load assignment data"));
  }, [assignmentId]);

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="text-gray-400 hover:text-white text-sm mb-6 block transition-colors"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-white mb-6">Assignment Responses</h1>

      <InsightsPanel assignmentId={assignmentId} />

      <h2 className="text-white font-semibold mb-3">Student Responses</h2>
      <div className="space-y-2">
        {students.length === 0 && (
          <p className="text-gray-500 text-sm">No students have started this assignment yet.</p>
        )}
        {students.map((s) => (
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
