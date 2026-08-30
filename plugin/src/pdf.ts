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
import { FileSystemAdapter, normalizePath, type Vault } from "obsidian";
import type { PrintOptions } from "./paper";

export * from "./paper";

/**
 * Prints the HTML to PDF.
 *
 * The document is written to a temp file and loaded with loadFile instead of
 * being passed as a data: URL. That's not a whim: a data: URL has a size
 * limit and a document with embedded images blows past it with no effort.
 */

/**
 * Prints the HTML to PDF.
 *
 * The document is written to a temporary file and loaded with loadFile rather
 * than passed as a data: URL. That is not fussiness: a data: URL has a size
 * limit and a document with embedded images sails past it.
 *
 * The temp file is written through the Vault API into the plugin's own config
 * folder, NOT through Node's fs into the OS temp directory. Both work, but the
 * fs route means the plugin can read and write anywhere on the machine, and no
 * user should have to take that on trust for something this small.
 */
export async function generate(
  html: string,
  opts: PrintOptions,
  vault: Vault,
): Promise<Uint8Array> {
  // Dynamic require: electron doesn't exist on mobile, and the bundler must
  // not resolve it at build time.
  const remote = requireRemote();

  const adapter = vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("Pressmark needs a local vault to render the document");
  }

  const dir = normalizePath(`${vault.configDir}/pressmark`);
  if (!(await adapter.exists(dir))) await adapter.mkdir(dir);

  // A unique name so two exports at once cannot clobber each other.
  const rel = normalizePath(`${dir}/render-${Date.now()}.html`);
  await adapter.write(rel, html);
  const file = adapter.getFullPath(rel);

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
    await adapter.remove(rel).catch(() => {});
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
  // activeWindow, not globalThis: in a popout window the Node bridge lives on
  // that window, and globalThis would reach the wrong one.
  const win = typeof activeWindow !== "undefined" ? activeWindow : window;
  const req = (win as unknown as { require?: (m: string) => unknown }).require;
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
