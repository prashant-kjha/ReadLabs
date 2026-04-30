import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { Users, Plus, ArrowRight, LayoutDashboard } from "lucide-react";

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
      <h1 className="section-heading mb-6">Classes</h1>

      {/* Create class */}
      <form onSubmit={handleCreate} className="card p-6 mb-8 flex gap-3">
        <input
          type="text"
          placeholder="New class name (e.g. Biology 101)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="input-field flex-1"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="btn-primary disabled:opacity-50 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {creating ? "Creating..." : "Create"}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-6">
        {/* Class list */}
        <div className="space-y-3">
          {classes.length === 0 && (
            <div className="card p-8 text-center">
              <Users className="w-10 h-10 text-[var(--color-text-secondary)] mx-auto mb-3" />
              <p className="text-[var(--color-text-secondary)] text-sm">No classes yet.</p>
            </div>
          )}
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => loadClass(cls.id)}
              className={`card-hover w-full text-left p-4 ${
                selected?.id === cls.id ? "ring-2 ring-primary" : ""
              }`}
            >
              <p className="text-[var(--color-text)] font-medium">{cls.name}</p>
              <p className="text-[var(--color-text-secondary)] text-xs mt-0.5 font-mono">Code: {cls.class_code}</p>
            </button>
          ))}
        </div>

        {/* Class detail */}
        {selected && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[var(--color-text)] font-semibold">{selected.name}</h2>
              <span className="bg-muted text-[var(--color-text)] font-mono text-sm px-3 py-1 rounded-lg">
                {selected.class_code}
              </span>
            </div>

            <p className="text-[var(--color-text-secondary)] text-xs mb-3">
              {selected.students.length} student{selected.students.length !== 1 ? "s" : ""}
            </p>

            <div className="space-y-2">
              {selected.students.length === 0 && (
                <p className="text-[var(--color-text-secondary)] text-sm">No students enrolled yet.</p>
              )}
              {selected.students.map((s) => (
                <div key={s.student_id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-[var(--color-text)] text-sm">{s.student_name}</span>
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
                className="btn-secondary flex-1 flex items-center justify-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Assign Paper
              </button>
              <button
                onClick={() => navigate(`/teacher/classes/${selected.id}/dashboard`)}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
