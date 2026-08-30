/**
 * PDF generation via Electron.
 *
 * Obsidian already IS Chromium: no need to download a browser or depend on an
 * external binary. A hidden BrowserWindow is opened, the document is loaded,
 * and webContents.printToPDF is called — the same API Obsidian's own
 * "Export to PDF" uses.
 *
 * Requires isDesktopOnly: true in the manifest. The store's policy allows it
 * with that flag declared, and there are published plugins that do the same.
 */
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, Resolved } from "./theme";

export interface PrintOptions {
  landscape: boolean;
  printBackground: boolean;
  scale?: number;
  paperWidth: number; // inches
  paperHeight: number;
  margins: { top: number; bottom: number; left: number; right: number };
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
}

const PER_INCH: Record<string, number> = {
  mm: 25.4,
  cm: 2.54,
  in: 1,
  pt: 72,
  px: 96,
};

/**
 * printToPDF only understands inches.
 *
 * Validates the number with a regular expression and NOT with parseFloat:
 * parseFloat stops at the first character it doesn't understand, so
 * "18 inches" gives it 18 and swallows an invalid value. Go's converter
 * rejects it, and the two have to agree or the same theme pack gives
 * different margins on each side.
 */
const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function toInches(v: string | undefined, fallback = 0): number {
  if (!v) return fallback;
  const s = v.trim().toLowerCase();
  const num = (txt: string, per: number): number => {
    const t = txt.trim();
    if (!NUMBER_RE.test(t)) throw new Error(`invalid length: "${v}"`);
    return Number.parseFloat(t) / per;
  };
  for (const [u, per] of Object.entries(PER_INCH)) {
    if (s.endsWith(u)) return num(s.slice(0, -u.length), per);
  }
  return num(s, 96); // bare number = px
}

const PAPERS: Record<string, [number, number]> = {
  a3: [11.69, 16.54],
  a4: [8.27, 11.69],
  a5: [5.83, 8.27],
  letter: [8.5, 11],
  legal: [8.5, 14],
  tabloid: [11, 17],
};

export function paperSize(page: Page | undefined): [number, number] {
  const s = page?.size;
  if (s && typeof s === "object") {
    return [toInches(s.width), toInches(s.height)];
  }
  const name = (typeof s === "string" ? s : "A4").toLowerCase();
  const d = PAPERS[name];
  if (!d) throw new Error(`unknown paper size: "${s}"`);
  return d;
}

export function printOptionsFor(t: Resolved, header: string, footer: string): PrintOptions {
  const [w, h] = paperSize(t.page);
  const m = t.page?.margin;
  return {
    landscape: t.page?.orientation === "landscape",
    printBackground: t.page?.printBackground ?? true,
    scale: t.page?.scale,
    paperWidth: w,
    paperHeight: h,
    margins: {
      top: toInches(m?.top),
      bottom: toInches(m?.bottom),
      left: toInches(m?.left),
      right: toInches(m?.right),
    },
    displayHeaderFooter: Boolean(t.header?.enabled || t.footer?.enabled),
    headerTemplate: header,
    footerTemplate: footer,
  };
}

/**
 * Prints the HTML to PDF.
 *
 * The document is written to a temp file and loaded with loadFile instead of
 * being passed as a data: URL. That's not a whim: a data: URL has a size
 * limit and a document with embedded images blows past it with no effort.
 */
/**
 * Copies the REAL bytes of the result.
 *
 * printToPDF returns a Node Buffer, and `buffer.buffer` doesn't return its
 * own bytes: it returns the entire pool it was carved from, which is usually
 * much bigger. Writing that out produces a corrupt PDF. Has to be sliced by
 * byteOffset/byteLength.
 */
export function bytesOf(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export async function generate(html: string, opts: PrintOptions): Promise<Uint8Array> {
  // Dynamic require: electron doesn't exist on mobile, and the bundler must
  // not resolve it at build time.
  const remote = requireRemote();

  const dir = await mkdtemp(join(tmpdir(), "pressmark-"));
  const file = join(dir, "doc.html");
  await writeFile(file, html, "utf8");

  const win = new remote.BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  try {
    await win.loadFile(file);
    // Without this, a font that hasn't loaded yet prints with the fallback
    // and the document comes out with different metrics.
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)", true);
    return await win.webContents.printToPDF({
      landscape: opts.landscape,
      printBackground: opts.printBackground,
      pageSize: { width: opts.paperWidth, height: opts.paperHeight },
      // No marginType: that property belongs to contents.print(), NOT to
      // printToPDF. Here all four sides go in INCHES and nothing else.
      margins: opts.margins,
      displayHeaderFooter: opts.displayHeaderFooter,
      headerTemplate: opts.headerTemplate,
      footerTemplate: opts.footerTemplate,
      ...(opts.scale ? { scale: opts.scale } : {}),
      // False on purpose: the size comes from theme.json, not from an @page
      // that slipped into the CSS. Single source of truth.
      preferCSSPageSize: false,
    });
  } finally {
    win.destroy();
    await unlink(file).catch(() => {});
  }
}

interface Remote {
  BrowserWindow: new (o: unknown) => {
    loadFile(p: string): Promise<void>;
    webContents: {
      executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
      printToPDF(o: unknown): Promise<Uint8Array>;
    };
    destroy(): void;
  };
}

/**
 * Gets @electron/remote.
 *
 * Obsidian ships it bundled and initialized (verified in app.asar), but the
 * module is enabled PER webContents. If it weren't enabled for the plugin's
 * renderer, Electron's error says so in those exact words — that's why this
 * case is singled out: without the precise message, the failure is
 * undiagnosable.
 */
function requireRemote(): Remote {
  const req = (globalThis as { require?: (m: string) => unknown }).require;
  if (!req) {
    throw new Error(
      "no access to require(): the plugin needs the desktop app (isDesktopOnly)",
    );
  }
  let mod: Remote | undefined;
  try {
    mod = req("@electron/remote") as Remote;
  } catch (e) {
    try {
      mod = (req("electron") as { remote?: Remote }).remote;
    } catch {
      /* reported below with the original error */
    }
    if (!mod) {
      throw new Error(`could not load @electron/remote: ${(e as Error).message}`);
    }
  }
  if (!mod?.BrowserWindow) {
    throw new Error("@electron/remote loaded but doesn't expose BrowserWindow");
  }
  return mod;
}
