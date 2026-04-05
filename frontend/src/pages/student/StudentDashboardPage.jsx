import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

const DIFFICULTY_COLORS = {
  beginner: "bg-green-500/20 text-green-300",
  intermediate: "bg-yellow-500/20 text-yellow-300",
  advanced: "bg-red-500/20 text-red-300",
};

const STATUS_COLORS = {
  not_started: "bg-gray-700 text-gray-400",
  in_progress: "bg-blue-500/20 text-blue-300",
  completed: "bg-green-500/20 text-green-300",
};

export default function StudentDashboardPage() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
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
    } catch (err) {
      toast.error(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!classCode.trim()) return;
    setJoining(true);
    try {
      await api.post("/enrollment/join", { class_code: classCode.trim().toUpperCase() });
      toast.success("Joined class!");
      setShowModal(false);
      setClassCode("");
      loadData();
    } catch (err) {
      toast.error(err.message || "Could not join class");
    } finally {
      setJoining(false);
    }
  };

  const getSessionStatus = (assignmentId) => {
    const session = sessions.find((s) => s.assignment_id === assignmentId);
    return session ? session.status : "not_started";
  };

  const getSessionLabel = (status) => {
    return { not_started: "Not Started", in_progress: "In Progress", completed: "Completed" }[status] || status;
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">My Classes</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Join a Class
        </button>
      </div>

      {/* Join modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-semibold mb-4">Join a Class</h2>
            <form onSubmit={handleJoin} className="space-y-3">
              <input
                type="text"
                placeholder="Class code (e.g. BIO-4X2K)"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 font-mono tracking-widest"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={joining}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {joining ? "Joining..." : "Join"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setClassCode(""); }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm"
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
        <p className="text-gray-500 text-sm">No classes yet. Join one using a class code from your teacher.</p>
      ) : (
        <div className="space-y-6">
          {classes.map((cls) => (
            <div key={cls.class_id} className="bg-gray-900 rounded-xl p-5">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-white font-semibold text-lg">{cls.class_name}</h2>
                <span className="text-xs text-gray-500 font-mono">{cls.class_code}</span>
              </div>
              <p className="text-gray-500 text-sm mb-4">Teacher: {cls.teacher_name}</p>

              {cls.assignments.length === 0 ? (
                <p className="text-gray-600 text-sm">No published assignments yet.</p>
              ) : (
                <div className="space-y-2">
                  {cls.assignments.map((asgn) => {
                    const status = getSessionStatus(asgn.id);
                    return (
                      <button
                        key={asgn.id}
                        onClick={() => navigate(`/student/read/${asgn.id}`)}
                        className="w-full text-left bg-gray-800 hover:bg-gray-750 rounded-lg px-4 py-3 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="text-white text-sm font-medium">{asgn.paper_title}</p>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[asgn.difficulty] || "bg-gray-700 text-gray-400"}`}>
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
