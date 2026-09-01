/**
 * pdf.js, wired for a bundled Obsidian plugin.
 *
 * Why the library is here at all: Obsidian's window is created WITHOUT
 * `plugins: true` (verified in obsidian.asar/main.js), so Chromium's built-in
 * PDF viewer is off. An `<iframe>`, `<embed>` or `<object>` pointed at a PDF
 * shows nothing, and `will-attach-webview` forces `plugins = false` on
 * `<webview>` too. Obsidian ships its own copy of pdf.js for exactly this
 * reason — but it loads it lazily and only exposes it once a PDF has been
 * opened, so reaching for `window.pdfjsLib` would work on some machines and
 * silently not on others.
 *
 * Why the worker runs on the main thread: pdf.js normally spawns a Worker from
 * a URL, which a single-file bundle has no way to hand it without minting a
 * blob: URL — and that runs straight into the app's CSP. Setting
 * `globalThis.pdfjsWorker` short-circuits that: PDFWorker sees a main-thread
 * message handler and skips `new Worker` entirely (pdf.mjs, `#initialize`).
 * Pages are parsed lazily one at a time, so the main thread is never busy for
 * long enough to matter in a preview.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// `window`, deliberately, and not `activeWindow`: pdf.js reads exactly
// `globalThis.pdfjsWorker` from inside its own bundled module, and that module
// was loaded in the main window along with the rest of the plugin, so the main
// window's global IS the object its code will look at. Setting this on a popout
// would leave pdf.js reading an empty slot and falling back to spawning a real
// Worker — the one thing being avoided here.
(window as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker;

export type PdfDocument = pdfjs.PDFDocumentProxy;
export type PdfPage = pdfjs.PDFPageProxy;

/** Parses PDF bytes. The array is copied: pdf.js takes ownership of what it gets. */
export function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
}

/**
 * Releases a document.
 *
 * Teardown lives on the loading task, not on the document: `PDFDocumentProxy`
 * has `cleanup()`, which only drops cached resources and keeps the document
 * open. Destroying the task is what actually frees it.
 */
export function closePdf(doc: PdfDocument): Promise<void> {
  return doc.loadingTask.destroy();
}
