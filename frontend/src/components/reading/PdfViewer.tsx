import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText } from "lucide-react";
import type { PdfStatus } from "../../hooks/useReadingStore";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfViewer({
  url,
  status = "loading",
  note = null,
  onRetry,
}: {
  url: string | null;
  status?: PdfStatus;
  note?: string | null;
  onRetry?: () => void;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoadError(false);
  }, []);

  // Signed URLs expire after an hour, so a render failure is often a stale URL:
  // ask for a fresh one as well as remounting the document.
  const retry = useCallback(() => {
    setLoadError(false);
    setReloadKey((k) => k + 1);
    onRetry?.();
  }, [onRetry]);

  // The viewer stays mounted when the reader moves to another paper, so a
  // failure on the previous document must not carry over to the new one.
  useEffect(() => {
    setLoadError(false);
    setPageNumber(1);
  }, [url]);

  const goToPage = (n: number) => {
    if (numPages && n >= 1 && n <= numPages) setPageNumber(n);
  };

  if (status === "unavailable") {
    return (
      <div
        data-testid="pdf-unavailable"
        className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center text-[var(--color-text-secondary)]"
      >
        <FileText className="w-6 h-6 opacity-40" />
        <p className="font-mono text-sm text-[var(--color-text)]">No PDF available</p>
        {note && <p className="font-mono text-xs max-w-sm leading-relaxed">{note}</p>}
      </div>
    );
  }

  // One error surface for both failures: we couldn't get a URL, or we got one
  // and the document wouldn't render.
  if (status === "error" || loadError) {
    return (
      <div
        data-testid="pdf-error"
        className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center font-mono text-sm text-[var(--color-text-secondary)]"
      >
        <p>Couldn&apos;t load the PDF.</p>
        <button onClick={retry} className="btn-secondary text-sm">Retry</button>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-[var(--color-text-secondary)]">
        Loading PDF...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border font-mono text-[11px] tracking-wide text-[var(--color-text-secondary)] shrink-0">
        <button onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} className="disabled:opacity-30 hover:text-[var(--color-text)] transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="tabular-nums">{pageNumber} / {numPages || "—"}</span>
        <button onClick={() => goToPage(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages} className="disabled:opacity-30 hover:text-[var(--color-text)] transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))} className="hover:text-[var(--color-text)] transition-colors">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="tabular-nums">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(s + 0.25, 3.0))} className="hover:text-[var(--color-text)] transition-colors">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* PDF pages */}
      <div className="flex-1 overflow-auto flex justify-center py-6" style={{ background: "var(--color-bg)" }}>
        <Document
          key={reloadKey}
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setLoadError(true)}
          loading={
            <div className="flex items-center justify-center h-64 font-mono text-sm text-[var(--color-text-secondary)]">Loading PDF...</div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            loading={<div className="w-[595px] h-[842px] bg-muted animate-pulse rounded-sm" />}
          />
        </Document>
      </div>
    </div>
  );
}
