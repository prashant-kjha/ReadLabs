import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { Users, Plus, ArrowRight, LayoutDashboard } from "lucide-react";

interface Student {
  student_id: string;
  student_name: string;
}

interface ClassData {
  id: string;
  name: string;
  class_code: string;
  students: Student[];
}

interface ClassCreated {
  id: string;
  class_code: string;
  [key: string]: unknown;
}

export default function ClassesPage() {
  const [classes, setClasses]   = useState<ClassData[]>([]);
  const [loading, setLoading]   = useState(true);
  const [newName, setNewName]   = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ClassData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/classes/").then(({ data }) => setClasses(data)).catch(() => toast.error("Could not load classes")).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<ClassCreated>("/classes/", { name: newName.trim() });
      setClasses((prev) => [{ id: data.id, name: newName.trim(), class_code: data.class_code, students: [] }, ...prev]);
      setNewName("");
      toast.success(`Class created — code: ${data.class_code}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create class";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const loadClass = async (classId: string) => {
    try {
      const { data } = await api.get<ClassData>(`/classes/${classId}`);
      setSelected(data);
    } catch {
      toast.error("Could not load class");
    }
  };

  const removeStudent = async (classId: string, studentId: string) => {
    try {
      await api.delete(`/classes/${classId}/students/${studentId}`);
      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.filter((s: Student) => s.student_id !== studentId),
        };
      });
      toast.success("Student removed");
    } catch {
      toast.error("Failed to remove student");
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 border-b border-[var(--color-border-strong)] pb-6">
        <p className="label-mono text-accent">Teacher · Roster</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Classes</h1>
      </div>

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
          {loading && <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Loading...</p>}
          {!loading && classes.length === 0 && (
            <div className="rounded-sm border border-dotted border-[var(--color-muted-foreground)] p-10 text-center">
              <Users className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-3" />
              <p className="font-display italic text-[var(--color-text-secondary)] text-sm">No classes yet.</p>
            </div>
          )}
          {classes.map((cls: ClassData) => (
            <button
              key={cls.id}
              onClick={() => loadClass(cls.id)}
              className={`card-hover w-full text-left p-4 ${
                selected?.id === cls.id ? "border-accent ring-1 ring-accent" : ""
              }`}
            >
              <p className="text-[var(--color-text)] font-medium">{cls.name}</p>
              <p className="font-mono text-[11px] tracking-wide text-[var(--color-text-secondary)] mt-1">Code: {cls.class_code}</p>
            </button>
          ))}
        </div>

        {/* Class detail */}
        {selected && (
          <div className="card-print p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">{selected.name}</h2>
              <span className="font-mono text-xs tracking-wider bg-muted text-[var(--color-text)] border border-dashed border-[var(--color-muted-foreground)] px-2.5 py-1 rounded-sm">
                {selected.class_code}
              </span>
            </div>

            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-3 border-b border-dotted border-border pb-2">
              {selected.students.length} student{selected.students.length !== 1 ? "s" : ""}
            </p>

            <div className="space-y-2">
              {selected.students.length === 0 && (
                <p className="font-display italic text-[var(--color-text-secondary)] text-sm">No students enrolled yet.</p>
              )}
              {selected.students.map((s: Student) => (
                <div key={s.student_id} className="flex items-center justify-between py-1.5 border-b border-dotted border-border last:border-0">
                  <span className="text-[var(--color-text)] text-sm">{s.student_name}</span>
                  <button
                    onClick={() => removeStudent(selected.id, s.student_id)}
                    className="text-danger hover:opacity-70 font-mono text-[11px] uppercase tracking-wider transition-opacity"
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
