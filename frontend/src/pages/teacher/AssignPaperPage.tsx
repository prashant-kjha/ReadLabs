import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { FileText } from "lucide-react";

export default function AssignPaperPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [papers, setPapers]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => toast.error("Could not load papers")).finally(() => setLoading(false));
  }, []);

  const handleAssign = async () => {
    if (!selected) return;
    setAssigning(true);
    try {
      const { data } = await api.post("/assignments/", {
        class_id: classId,
        paper_id: selected,
      });
      toast.success("Assignment created — Gemini is generating the reading guide");
      navigate(`/teacher/assignments/${data.id}/review`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create assignment");
      setAssigning(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="section-heading mb-2">Assign a Paper</h1>
      <p className="text-[var(--color-text-secondary)] text-sm mb-6">
        Select an uploaded paper. Gemini will generate the reading guide automatically.
      </p>

      <div className="space-y-2 mb-6">
        {loading && <p className="text-[var(--color-text-secondary)] text-sm">Loading papers...</p>}
        {!loading && papers.length === 0 && (
          <div className="card p-8 text-center">
            <FileText className="w-10 h-10 text-[var(--color-text-secondary)] mx-auto mb-3" />
            <p className="text-[var(--color-text-secondary)] text-sm">
              No papers uploaded yet.{" "}
              <button
                onClick={() => navigate("/teacher/papers")}
                className="text-primary hover:underline"
              >
                Upload one first.
              </button>
            </p>
          </div>
        )}
        {papers.map((paper) => (
          <button
            key={paper.id}
            onClick={() => setSelected(paper.id)}
            className={`card-hover w-full text-left p-4 flex items-center gap-3 ${
              selected === paper.id ? "ring-2 ring-primary" : ""
            }`}
          >
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
