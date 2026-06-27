import { useEffect, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { classesApi, libraryApi } from "../../lib/api";
import type { ClassItem } from "../../types/classes";
import type { LandmarkPaper } from "../../types/landmark";

interface Props {
  paper: LandmarkPaper | null;
  difficulty: string;
  onClose: () => void;
}

export default function AssignToClassModal({ paper, difficulty, onClose }: Props) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [saving, setSaving] = useState(false);

  // Load the teacher's classes once when the modal mounts; default-select the first.
  useEffect(() => {
    let active = true;
    classesApi
      .list()
      .then((c) => {
        if (!active) return;
        setClasses(c);
        setClassId(c[0]?.id ?? "");
      })
      .catch(() => toast.error("Could not load your classes"));
    return () => {
      active = false;
    };
  }, []);

  if (!paper) return null;

  const submit = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      await libraryApi.assignLandmark({ class_id: classId, paper_id: paper.paper_id, difficulty });
      const name = classes.find((c) => c.id === classId)?.name ?? "class";
      toast.success(`Assigned to ${name}`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not assign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Assign to class"
    >
      <div className="card p-6 w-full max-w-sm rounded-sm bg-surface-raised border-[var(--color-border-strong)] shadow-print">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">Assign to class</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)] mt-1 truncate">
              {paper.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-accent transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="font-mono text-xs text-[var(--color-text-secondary)] mb-4">
          Level: <span className="text-[var(--color-text)] uppercase">{difficulty || "—"}</span>
        </p>

        {classes.length === 0 ? (
          <p className="font-display italic text-sm text-[var(--color-text-secondary)] py-4 text-center">
            You have no classes yet.
          </p>
        ) : (
          <label className="block mb-5">
            <span className="label-mono text-[var(--color-text-secondary)]">Class</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="input-field mt-1"
              aria-label="Select a class"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!classId || saving}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
