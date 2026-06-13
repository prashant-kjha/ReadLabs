import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { FileText } from "lucide-react";

interface Paper {
  id: string;
  title: string;
}

interface AssignmentCreated {
  id: string;
  [key: string]: unknown;
}

export default function AssignPaperPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [papers, setPapers]       = useState<Paper[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => toast.error("Could not load papers")).finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selected) return;
    setAssigning(true);
    try {
      const { data } = await api.post<AssignmentCreated>("/assignments/", {
        class_id: classId,
        paper_id: selected,
      });
      toast.success("Assignment created — Gemini is generating the reading guide");
      navigate(`/teacher/assignments/${data.id}/review`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create assignment";
      toast.error(message);
      setAssigning(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8 border-b border-[var(--color-border-strong)] pb-6">
        <p className="label-mono text-accent">Teacher · Assignment</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Assign a Paper</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Select an uploaded paper. Gemini will generate the reading guide automatically.
        </p>
      </div>

      <div className="space-y-2 mb-6">
        {loading && <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Loading papers...</p>}
        {!loading && papers.length === 0 && (
          <div className="rounded-sm border border-dotted border-[var(--color-muted-foreground)] p-10 text-center">
            <FileText className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-3" />
            <p className="font-display italic text-[var(--color-text-secondary)] text-sm">
              No papers uploaded yet.{" "}
              <button
                onClick={() => navigate("/teacher/papers")}
                className="text-accent hover:underline"
              >
                Upload one first.
              </button>
            </p>
          </div>
        )}
        {papers.map((paper: Paper, idx: number) => (
          <button
            key={paper.id}
            onClick={() => setSelected(paper.id)}
            className={`card-hover w-full text-left p-4 flex items-center gap-3 ${
              // "ring-2 ring-primary" is load-bearing: teacher.spec.js asserts it on selection
              selected === paper.id ? "border-primary ring-2 ring-primary" : ""
            }`}
          >
            <span className="font-mono text-xs text-accent shrink-0">{String(idx + 1).padStart(2, "0")}.</span>
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <p className="text-[var(--color-text)] font-medium">{paper.title}</p>
          </button>
        ))}
      </div>

      <button
        onClick={handleAssign}
        disabled={!selected || assigning}
        className="btn-primary disabled:opacity-50"
      >
        {assigning ? "Creating..." : "Assign Paper"}
      </button>
    </div>
  );
}
