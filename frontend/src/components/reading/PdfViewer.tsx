import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfViewer({ url }: { url: string | null }) {
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

  const retry = useCallback(() => {
    setLoadError(false);
    setReloadKey((k) => k + 1);
  }, []);

  const goToPage = (n: number) => {
    if (numPages && n >= 1 && n <= numPages) setPageNumber(n);
  };

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
        {loadError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-center font-mono text-sm text-[var(--color-text-secondary)]">
            <p>Couldn&apos;t load the PDF.</p>
            <button onClick={retry} className="btn-secondary text-sm">Retry</button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
