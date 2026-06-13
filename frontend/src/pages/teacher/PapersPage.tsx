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
  processing: "badge bg-warning/10 text-warning",
  ready: "badge bg-success/10 text-success",
  failed: "badge bg-danger/10 text-danger",
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
      <div className="flex items-end justify-between gap-4 mb-8 border-b border-[var(--color-border-strong)] pb-6">
        <div>
          <p className="label-mono text-accent">Teacher · Library</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--color-text)]">Papers</h1>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="card-print p-6 mb-10">
        <h2 className="text-[var(--color-text)] text-lg font-medium mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-accent" />
          Upload a Paper
        </h2>
        <input
          type="text"
          placeholder="Paper title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field mb-3"
        />
        <label className={`block w-full text-center py-2.5 rounded cursor-pointer font-medium transition-colors ${
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
        <p className="font-mono text-[11px] text-[var(--color-text-secondary)] mt-3">Max 20 MB. Text and figures are extracted automatically.</p>
        <p className="text-[var(--color-text-secondary)] text-xs mt-2 leading-relaxed border-t border-dotted border-border pt-2">
          By uploading you confirm you have the right to share this paper with your
          enrolled students under classroom-use copyright provisions (e.g. fair use /
          the TEACH Act in the US). PDFs are not made public. See our{" "}
          <a href="/terms" className="text-accent underline underline-offset-4" target="_blank" rel="noreferrer">Terms</a>.
        </p>
      </div>

      {papers.length === 0 ? (
        <div className="rounded-sm border border-dotted border-[var(--color-muted-foreground)] p-10 text-center">
          <FileText className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-3" />
          <p className="font-display italic text-[var(--color-text-secondary)] text-sm">No papers yet. Upload one above.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] pb-2">
            <span className="label-mono">Collection</span>
            <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">{papers.length}</span>
          </div>
          {papers.map((paper: Paper, idx: number) => (
            <div key={paper.id} className="flex items-center justify-between border-b border-border px-1 py-4 transition-colors hover:bg-surface">
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-accent w-7 shrink-0">{String(idx + 1).padStart(2, "0")}.</span>
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-[var(--color-text)] font-medium">{paper.title}</p>
                  {paper.text_length != null && (
                    <p className="font-mono text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                      {paper.text_length.toLocaleString()} chars &middot; {paper.figure_count ?? 0} figures
                    </p>
                  )}
                </div>
              </div>
              {paper.status && (
                <span className={`font-mono text-[10px] uppercase tracking-wider ${STATUS_BADGES[paper.status] || "badge bg-muted text-[var(--color-text-secondary)]"}`}>
                  {paper.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
