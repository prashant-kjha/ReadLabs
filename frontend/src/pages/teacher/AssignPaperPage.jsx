import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function AssignPaperPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [papers, setPapers]       = useState([]);
  const [selected, setSelected]   = useState(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => {});
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
      <h1 className="text-2xl font-bold text-white mb-2">Assign a Paper</h1>
      <p className="text-gray-400 text-sm mb-6">
        Select an uploaded paper. Gemini will generate the reading guide automatically.
      </p>

      <div className="space-y-2 mb-6">
        {papers.length === 0 && (
          <p className="text-gray-500 text-sm">
            No papers uploaded yet.{" "}
            <button
              onClick={() => navigate("/teacher/papers")}
              className="text-indigo-400 hover:underline"
            >
              Upload one first.
            </button>
          </p>
        )}
        {papers.map((paper) => (
          <button
            key={paper.id}
            onClick={() => setSelected(paper.id)}
            className={`w-full text-left bg-gray-900 rounded-xl p-4 transition-colors ${
              selected === paper.id ? "ring-2 ring-indigo-500" : "hover:bg-gray-800"
            }`}
          >
            <p className="text-white font-medium">{paper.title}</p>
          </button>
        ))}
      </div>

      <button
        onClick={handleAssign}
        disabled={!selected || assigning}
        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
      >
        {assigning ? "Creating…" : "Assign Paper"}
      </button>
    </div>
  );
}
