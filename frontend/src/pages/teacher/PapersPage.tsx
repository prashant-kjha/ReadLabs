import { useState, useEffect } from "react";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { Upload, FileText } from "lucide-react";

interface Paper {
  id: string;
  title: string;
  text_length?: number;
  figure_count?: number;
}

export default function PapersPage() {
  const [papers, setPapers]     = useState<Paper[]>([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle]       = useState("");

  useEffect(() => {
    api.get("/papers/").then(({ data }) => setPapers(data)).catch(() => toast.error("Could not load papers"));
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title || file.name.replace(".pdf", ""));
    try {
      const { data } = await api.post<Paper>("/papers/upload", form, {
        headers: { "Content-Type": undefined },
      });
      setPapers((prev) => [data, ...prev]);
      setTitle("");
      toast.success(`Uploaded: ${data.title}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="section-heading mb-6">Papers</h1>

      <div className="card p-6 mb-8">
        <h2 className="text-[var(--color-text)] font-medium mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-primary" />
          Upload a Paper
        </h2>
        <input
          type="text"
          placeholder="Paper title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field mb-3"
        />
        <label className={`block w-full text-center py-2.5 rounded-lg cursor-pointer font-medium transition-colors ${
          uploading
            ? "bg-muted text-[var(--color-text-secondary)] cursor-not-allowed"
            : "btn-primary cursor-pointer"
        }`}>
          {uploading ? "Processing…" : "Choose PDF"}
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        <p className="text-[var(--color-text-secondary)] text-xs mt-2">Max 20 MB. Text and figures are extracted automatically.</p>
      </div>

      <div className="space-y-3">
        {papers.length === 0 && (
          <div className="card p-8 text-center">
            <FileText className="w-10 h-10 text-[var(--color-text-secondary)] mx-auto mb-3" />
            <p className="text-[var(--color-text-secondary)] text-sm">No papers yet. Upload one above.</p>
          </div>
        )}
        {papers.map((paper: Paper) => (
          <div key={paper.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-[var(--color-text)] font-medium">{paper.title}</p>
                {paper.text_length != null && (
                  <p className="text-[var(--color-text-secondary)] text-xs mt-0.5">
                    {paper.text_length.toLocaleString()} chars &middot; {paper.figure_count ?? 0} figures
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
