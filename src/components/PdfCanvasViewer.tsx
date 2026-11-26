import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasViewerProps {
  url: string;
  fileName: string;
  downloadUrl?: string;
  heightClass?: string;
}

function decodeDataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error('Formato de arquivo PDF inválido.');
  }
  const header = dataUrl.slice(0, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const isBase64 = /;base64/i.test(header);
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  zoom: number;
  showPageLabel?: boolean;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  containerWidth,
  zoom,
  showPageLabel = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderPage = async () => {
      const canvas = canvasRef.current;
      if (!canvas || containerWidth <= 0) return;

      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, containerWidth - 32);
        const fitScale = availableWidth / unscaledViewport.width;
        const effectiveScale = fitScale * zoom;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        const viewport = page.getViewport({ scale: effectiveScale });
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform =
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined;

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform,
          canvas,
        });

        await renderTask.promise;
        if (!cancelled) {
          setRendering(false);
        }
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (!cancelled && name !== 'RenderingCancelledException') {
          setRendering(false);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNumber, containerWidth, zoom]);

  return (
    <div className="flex flex-col items-center">
      {showPageLabel && (
        <span className="text-[11px] font-mono-tabular text-slate-500 mb-1.5">
          Página {pageNumber}
        </span>
      )}
      <div className="relative bg-white border border-slate-200 shadow-xs">
        <canvas ref={canvasRef} className="block max-w-none" />
        {rendering && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#1D4ED8] animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  url,
  fileName,
  downloadUrl,
  heightClass = 'h-[480px] sm:h-[560px]',
}) => {
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(640);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewAllPages, setViewAllPages] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mede a largura disponível do container para ajustar o PDF sem overflow horizontal
  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(el.clientWidth);
      if (nextWidth > 0) setContainerWidth(nextWidth);
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Carrega os bytes do PDF (via data URL ou fetch same-origin) e inicializa o PDF.js
  useEffect(() => {
    let cancelled = false;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    const loadPdf = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      setZoom(1);

      try {
        let dataBytes: Uint8Array;
        if (url.startsWith('data:')) {
          dataBytes = decodeDataUrlToUint8Array(url);
        } else {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Não foi possível carregar o PDF (status ${response.status}).`
            );
          }
          const buffer = await response.arrayBuffer();
          dataBytes = new Uint8Array(buffer);
        }

        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({ data: dataBytes });
        const doc = await loadingTask.promise;

        if (cancelled) {
          void doc.cleanup();
          return;
        }

        loadedDoc = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setViewAllPages(doc.numPages <= 12);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Não foi possível renderizar este arquivo PDF.'
          );
          setIsLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      if (loadedDoc) {
        void loadedDoc.cleanup().catch(() => {});
      }
      if (loadingTask) {
        void loadingTask.destroy().catch(() => {});
      }
    };
  }, [url]);

  const handleZoomOut = () =>
    setZoom((prev) => Math.max(0.6, Math.round((prev - 0.15) * 100) / 100));
  const handleZoomIn = () =>
    setZoom((prev) => Math.min(2.2, Math.round((prev + 0.15) * 100) / 100));
  const handleResetZoom = () => setZoom(1);

  const pageNumbersToRender = viewAllPages
    ? Array.from({ length: numPages }, (_, idx) => idx + 1)
    : [currentPage];

  return (
    <div className="flex flex-col h-full">
      {/* Barra de controles do leitor embutido */}
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        {/* Paginação / Modo contínuo */}
        <div className="flex items-center gap-1.5">
          {numPages > 1 && !viewAllPages && (
            <>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-[#0B2545] hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono-tabular text-xs text-[#0B2545] px-1.5">
                {currentPage} / {numPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= numPages}
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                aria-label="Próxima página"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-[#0B2545] hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {numPages > 1 && (
            <button
              type="button"
              onClick={() => setViewAllPages((v) => !v)}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                viewAllPages
                  ? 'bg-blue-50 text-[#1D4ED8] border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:text-[#0B2545]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                {viewAllPages
                  ? `Todas (${numPages} págs.)`
                  : 'Ver todas'}
              </span>
            </button>
          )}

          {numPages === 1 && (
            <span className="font-mono-tabular text-xs text-slate-500">
              1 página
            </span>
          )}
        </div>

        {/* Controles de zoom */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.6}
            aria-label="Diminuir zoom"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-[#0B2545] hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            title="Restaurar ajuste à largura"
            className="min-h-[36px] px-2 rounded-lg border border-slate-200 font-mono-tabular text-xs text-[#0B2545] hover:bg-slate-50 cursor-pointer"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.2}
            aria-label="Aumentar zoom"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-[#0B2545] hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Área de renderização das páginas em Canvas (nunca bloqueada pelo Brave/Chrome) */}
      <div
        ref={viewportContainerRef}
        className={`w-full ${heightClass} overflow-auto bg-slate-100 p-4`}
      >
        {isLoading ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center gap-2.5 text-slate-600">
            <Loader2 className="w-6 h-6 text-[#1D4ED8] animate-spin" />
            <p className="text-xs font-medium">
              Carregando documento PDF...
            </p>
          </div>
        ) : errorMessage || !pdfDoc ? (
          <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 px-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-[#0B2545]">
                Não foi possível pré-visualizar este PDF
              </p>
              <p className="text-xs text-slate-600">
                {errorMessage || 'O arquivo pode estar inacessível ou corrompido.'}
              </p>
            </div>
            {(downloadUrl || url) && (
              <a
                href={downloadUrl || url}
                download={fileName}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-xs font-bold text-[#FACC15] bg-[#0B2545] hover:bg-[#134074] rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Baixar {fileName}</span>
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {pageNumbersToRender.map((pageNum) => (
              <PdfPageCanvas
                key={`${url}-${pageNum}`}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                containerWidth={containerWidth}
                zoom={zoom}
                showPageLabel={viewAllPages && numPages > 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
