import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function ClassesPage() {
  const [classes, setClasses]   = useState([]);
  const [newName, setNewName]   = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null); // full class detail
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/classes/").then(({ data }) => setClasses(data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/classes/", { name: newName.trim() });
      setClasses((prev) => [data, ...prev]);
      setNewName("");
      toast.success(`Class created — code: ${data.class_code}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create class");
    } finally {
      setCreating(false);
    }
  };

  const loadClass = async (classId) => {
    try {
      const { data } = await api.get(`/classes/${classId}`);
      setSelected(data);
    } catch {
      toast.error("Could not load class");
    }
  };

  const removeStudent = async (classId, studentId) => {
    try {
      await api.delete(`/classes/${classId}/students/${studentId}`);
      setSelected((prev) => ({
        ...prev,
        students: prev.students.filter((s) => s.student_id !== studentId),
      }));
      toast.success("Student removed");
    } catch {
      toast.error("Failed to remove student");
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">Classes</h1>

      {/* Create class */}
      <form onSubmit={handleCreate} className="bg-gray-900 rounded-xl p-6 mb-8 flex gap-3">
        <input
          type="text"
          placeholder="New class name (e.g. Biology 101)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-6">
        {/* Class list */}
        <div className="space-y-3">
          {classes.length === 0 && (
            <p className="text-gray-500 text-sm">No classes yet.</p>
          )}
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => loadClass(cls.id)}
              className={`w-full text-left bg-gray-900 rounded-xl p-4 transition-colors ${
                selected?.id === cls.id ? "ring-2 ring-indigo-500" : "hover:bg-gray-800"
              }`}
            >
              <p className="text-white font-medium">{cls.name}</p>
              <p className="text-gray-500 text-xs mt-0.5 font-mono">Code: {cls.class_code}</p>
            </button>
          ))}
        </div>

        {/* Class detail */}
        {selected && (
          <div className="bg-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">{selected.name}</h2>
              <span className="bg-gray-800 text-gray-300 font-mono text-sm px-3 py-1 rounded-lg">
                {selected.class_code}
              </span>
            </div>

            <p className="text-gray-400 text-xs mb-3">
              {selected.students.length} student{selected.students.length !== 1 ? "s" : ""}
            </p>

            <div className="space-y-2">
              {selected.students.length === 0 && (
                <p className="text-gray-500 text-sm">No students enrolled yet.</p>
              )}
              {selected.students.map((s) => (
                <div key={s.student_id} className="flex items-center justify-between">
                  <span className="text-white text-sm">{s.student_name}</span>
                  <button
                    onClick={() => removeStudent(selected.id, s.student_id)}
                    className="text-red-400 hover:text-red-300 text-xs transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => navigate(`/teacher/classes/${selected.id}/assign`)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Assign Paper
              </button>
              <button
                onClick={() => navigate(`/teacher/classes/${selected.id}/dashboard`)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
