import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdfDocument } from '../services/pdfDocuments';

export default function PdfAttachmentPreview({ blob, fileName }: { blob: Blob; fileName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let loaded: PDFDocumentProxy | null = null;
    setDocument(null);
    setPage(1);
    setLoading(true);
    setError('');
    void openPdfDocument(blob, controller.signal).then(value => {
      if (controller.signal.aborted) { void value.loadingTask.destroy(); return; }
      loaded = value;
      setDocument(value);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setLoading(false);
      setError(reason?.name === 'PasswordException' ? '此 PDF 已加密，暂不支持在线预览。' : 'PDF 加载失败，文件可能已损坏或使用了不支持的格式。');
    });
    return () => { controller.abort(); if (loaded) void loaded.loadingTask.destroy(); };
  }, [blob]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setWidth(Math.max(180, element.clientWidth - 16));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    setLoading(true);
    setError('');
    void document.getPage(page).then(async pdfPage => {
      if (cancelled || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width / viewport.width, 2);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const rendered = pdfPage.getViewport({ scale: scale * pixelRatio });
      const element = canvas.current;
      element.width = Math.ceil(rendered.width);
      element.height = Math.ceil(rendered.height);
      element.style.width = `${rendered.width / pixelRatio}px`;
      element.style.height = `${rendered.height / pixelRatio}px`;
      const task = pdfPage.render({ canvas: element, viewport: rendered });
      cancelRender = () => task.cancel();
      await task.promise;
      if (!cancelled) setLoading(false);
    }).catch(reason => {
      if (cancelled || reason?.name === 'RenderingCancelledException') return;
      setError('当前 PDF 页渲染失败。');
      setLoading(false);
    });
    return () => { cancelled = true; cancelRender?.(); };
  }, [document, page, width]);

  return (
    <div ref={container} className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-center gap-3">
        <button className="btn btn-ghost btn--sm" type="button" disabled={!document || page <= 1} onClick={() => setPage(value => value - 1)}>上一页 PDF</button>
        <span className="text-sm text-ink-muted" role="status">第 {page} / {document?.numPages ?? '-'} 页</span>
        <button className="btn btn-ghost btn--sm" type="button" disabled={!document || page >= document.numPages} onClick={() => setPage(value => value + 1)}>下一页 PDF</button>
      </div>
      {loading && <p role="status" className="mb-2 shrink-0 text-center text-sm text-ink-muted">PDF 渲染中…</p>}
      {error && <p role="alert" className="mb-2 shrink-0 text-center text-sm text-danger">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain" role="region" aria-label="PDF 页面" tabIndex={0}>
        <canvas ref={canvas} className="mx-auto max-w-full bg-white" aria-label={`${fileName} 第 ${page} 页`} role="img" hidden={!!error || !document} />
      </div>
      <p className="mt-3 shrink-0 text-center text-xs text-ink-muted">PDF 在本地渲染；不执行文档脚本或外部链接。原文件下载需对应权限。</p>
    </div>
  );
}
