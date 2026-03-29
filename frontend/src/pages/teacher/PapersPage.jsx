import { useState, useEffect } from "react";
import api from "../../lib/api";
import toast from "react-hot-toast";

export default function PapersPage() {
  const [papers, setPapers]     = useState([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle]       = useState("");

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => {});
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title || file.name.replace(".pdf", ""));
    try {
      const { data } = await api.post("/papers/upload", form);
      setPapers((prev) => [data, ...prev]);
      setTitle("");
      toast.success(`Uploaded: ${data.title}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">Papers</h1>

      <div className="bg-gray-900 rounded-xl p-6 mb-8">
        <h2 className="text-white font-medium mb-4">Upload a Paper</h2>
        <input
          type="text"
          placeholder="Paper title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
        />
        <label className={`block w-full text-center py-2.5 rounded-lg cursor-pointer font-medium transition-colors ${
          uploading
            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 text-white"
        }`}>
          {uploading ? "Processing\u2026" : "Choose PDF"}
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        <p className="text-gray-500 text-xs mt-2">Max 20 MB. Text and figures are extracted automatically.</p>
      </div>

      <div className="space-y-3">
        {papers.length === 0 && (
          <p className="text-gray-500 text-sm">No papers yet. Upload one above.</p>
        )}
        {papers.map((paper) => (
          <div key={paper.id} className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{paper.title}</p>
              {paper.text_length != null && (
                <p className="text-gray-500 text-xs mt-0.5">
                  {paper.text_length.toLocaleString()} chars &middot; {paper.figure_count ?? 0} figures
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
