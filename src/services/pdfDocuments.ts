import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export async function openPdfDocument(blob: Blob, signal: AbortSignal): Promise<PDFDocumentProxy> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  signal.throwIfAborted();
  GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await blob.arrayBuffer());
  signal.throwIfAborted();
  // PDF.js 6 has no eval option. Render pages only: never initialize its scripting or annotation UI.
  const task = getDocument({ data, useSystemFonts: true, useWorkerFetch: false, useWasm: false, enableXfa: false });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const document = await task.promise;
    signal.throwIfAborted();
    return document;
  } catch (error) {
    await task.destroy();
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
