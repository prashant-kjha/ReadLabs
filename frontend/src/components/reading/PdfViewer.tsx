import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PdfViewer({ url }: { url: string | null }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  }, []);

  const goToPage = (n: number) => {
    if (numPages && n >= 1 && n <= numPages) setPageNumber(n);
  };

  if (!url) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-secondary)]">
        Loading PDF...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border text-xs text-[var(--color-text-secondary)] shrink-0">
        <button onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} className="disabled:opacity-30 hover:text-[var(--color-text)]">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span>{pageNumber} / {numPages || "—"}</span>
        <button onClick={() => goToPage(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages} className="disabled:opacity-30 hover:text-[var(--color-text)]">
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))} className="hover:text-[var(--color-text)]">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(s + 0.25, 3.0))} className="hover:text-[var(--color-text)]">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* PDF pages */}
      <div className="flex-1 overflow-auto flex justify-center py-6" style={{ background: "var(--color-bg)" }}>
        <Document file={url} onLoadSuccess={onDocumentLoadSuccess} loading={
          <div className="flex items-center justify-center h-64 text-[var(--color-text-secondary)]">Loading PDF...</div>
        }>
          <Page
            pageNumber={pageNumber}
            scale={scale}
            loading={<div className="w-[595px] h-[842px] bg-muted animate-pulse rounded" />}
          />
        </Document>
      </div>
    </div>
  );
}
