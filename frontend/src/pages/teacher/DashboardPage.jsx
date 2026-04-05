import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-gray-400 text-xs w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function TeacherDashboardPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/dashboard/classes/${classId}/progress`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Could not load dashboard"));
  }, [classId]);

  if (!data) return <div className="p-8 text-gray-400">Loading...</div>;

  const { students, assignments } = data;

  const totalSections = (asn) =>
    asn?.reading_guide?.sections?.length ?? 0;

  const sessionFor = (student, asnId) =>
    student.sessions.find((s) => s.assignment_id === asnId);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{data.class?.name}</h1>
        <button
          onClick={() => navigate("/teacher/classes")}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          ← Classes
        </button>
      </div>

      {students.length === 0 && (
        <p className="text-gray-500 text-sm">No students enrolled yet.</p>
      )}

      {assignments.length === 0 && (
        <p className="text-gray-500 text-sm mb-6">No published assignments yet.</p>
      )}

      {assignments.map((asn) => (
        <div key={asn.id} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">
              Assignment
              <span className="text-gray-500 font-normal text-sm ml-2 capitalize">
                · {asn.difficulty}
              </span>
            </h2>
            <button
              onClick={() => navigate(`/teacher/assignments/${asn.id}/drilldown`)}
              className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              View responses →
            </button>
          </div>

          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Student</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Progress</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const session = sessionFor(student, asn.id);
                  const completed = session?.current_section_index ?? 0;
                  const total = totalSections(asn);
                  const status = session?.status ?? "not_started";

                  return (
                    <tr
                      key={student.student_id}
                      className="border-b border-gray-800 last:border-0 hover:bg-gray-800 cursor-pointer"
                      onClick={() =>
                        navigate(`/teacher/assignments/${asn.id}/students/${student.student_id}/responses`)
                      }
                    >
                      <td className="px-4 py-3 text-white">{student.student_name}</td>
                      <td className="px-4 py-3 w-48">
                        <ProgressBar value={completed} max={total || 1} />
                        <span className="text-gray-500 text-xs">{completed}/{total} sections</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          status === "completed"
                            ? "bg-green-900 text-green-300"
                            : status === "in_progress"
                            ? "bg-indigo-900 text-indigo-300"
                            : "bg-gray-800 text-gray-400"
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
