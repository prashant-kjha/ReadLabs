import { useState, useEffect } from "react";
import api from "../../lib/api";
import toast from "react-hot-toast";
import { Upload, FileText, RefreshCw } from "lucide-react";

interface Paper {
  id: string;
  title: string;
  text_length?: number;
  figure_count?: number;
  status?: string;
}

const STATUS_BADGES: Record<string, string> = {
  processing: "badge bg-amber-500/10 text-amber-800 dark:text-amber-300",
  ready: "badge bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "badge bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function PapersPage() {
  const [papers, setPapers]     = useState<Paper[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [title, setTitle]       = useState("");

  const loadPapers = async () => {
    try {
      const { data } = await api.get("/papers/");
      setPapers(data);
    } catch {
      toast.error("Could not load papers");
    }
  };

  useEffect(() => {
    loadPapers();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPapers();
    setRefreshing(false);
  };

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
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-heading">Papers</h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

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
        <p className="text-[var(--color-text-secondary)] text-xs mt-2 leading-relaxed">
          By uploading you confirm you have the right to share this paper with your
          enrolled students under classroom-use copyright provisions (e.g. fair use /
          the TEACH Act in the US). PDFs are not made public. See our{" "}
          <a href="/terms" className="text-primary underline" target="_blank" rel="noreferrer">Terms</a>.
        </p>
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
            {paper.status && (
              <span className={`text-xs ${STATUS_BADGES[paper.status] || "badge bg-muted text-[var(--color-text-secondary)]"}`}>
                {paper.status}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
