/**
 * Generacion del PDF con Electron.
 *
 * Obsidian ya ES Chromium: no hace falta bajar un navegador ni depender de un
 * binario externo. Se abre una BrowserWindow oculta, se carga el documento y se
 * llama a webContents.printToPDF — la misma API que usa el "Export to PDF"
 * propio de Obsidian.
 *
 * Requiere isDesktopOnly: true en el manifest. La politica del store lo permite
 * con esa bandera declarada, y hay plugins publicados que lo hacen igual.
 */
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, Resolved } from "./theme";

export interface PrintOptions {
  landscape: boolean;
  printBackground: boolean;
  scale?: number;
  paperWidth: number; // pulgadas
  paperHeight: number;
  margins: { top: number; bottom: number; left: number; right: number };
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
}

const PULGADAS_POR: Record<string, number> = {
  mm: 25.4,
  cm: 2.54,
  in: 1,
  pt: 72,
  px: 96,
};

/**
 * printToPDF solo entiende pulgadas.
 *
 * Valida el numero con una expresion regular y NO con parseFloat: parseFloat
 * corta en el primer caracter que no entiende, asi que "18 pulgadas" le da 18 y
 * se traga un valor invalido. El conversor de Go lo rechaza, y los dos tienen
 * que coincidir o el mismo theme pack da margenes distintos en cada lado.
 */
const NUMERO = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export function aPulgadas(v: string | undefined, porDefecto = 0): number {
  if (!v) return porDefecto;
  const s = v.trim().toLowerCase();
  const numero = (txt: string, por: number): number => {
    const t = txt.trim();
    if (!NUMERO.test(t)) throw new Error(`longitud invalida: "${v}"`);
    return Number.parseFloat(t) / por;
  };
  for (const [u, por] of Object.entries(PULGADAS_POR)) {
    if (s.endsWith(u)) return numero(s.slice(0, -u.length), por);
  }
  return numero(s, 96); // numero pelado = px
}

const PAPELES: Record<string, [number, number]> = {
  a3: [11.69, 16.54],
  a4: [8.27, 11.69],
  a5: [5.83, 8.27],
  letter: [8.5, 11],
  legal: [8.5, 14],
  tabloid: [11, 17],
};

export function tamanoPapel(page: Page | undefined): [number, number] {
  const s = page?.size;
  if (s && typeof s === "object") {
    return [aPulgadas(s.width), aPulgadas(s.height)];
  }
  const nombre = (typeof s === "string" ? s : "A4").toLowerCase();
  const d = PAPELES[nombre];
  if (!d) throw new Error(`tamano de papel desconocido: "${s}"`);
  return d;
}

export function opcionesDe(t: Resolved, header: string, footer: string): PrintOptions {
  const [w, h] = tamanoPapel(t.page);
  const m = t.page?.margin;
  return {
    landscape: t.page?.orientation === "landscape",
    printBackground: t.page?.printBackground ?? true,
    scale: t.page?.scale,
    paperWidth: w,
    paperHeight: h,
    margins: {
      top: aPulgadas(m?.top),
      bottom: aPulgadas(m?.bottom),
      left: aPulgadas(m?.left),
      right: aPulgadas(m?.right),
    },
    displayHeaderFooter: Boolean(t.header?.enabled || t.footer?.enabled),
    headerTemplate: header,
    footerTemplate: footer,
  };
}

/**
 * Imprime el HTML a PDF.
 *
 * El documento se escribe a un archivo temporal y se carga con loadFile en vez
 * de pasarlo como data: URL. No es capricho: una data: URL tiene limite de
 * tamano y un documento con imagenes embebidas lo pasa sin esfuerzo.
 */
/**
 * Copia los bytes REALES del resultado.
 *
 * printToPDF devuelve un Buffer de Node, y `buffer.buffer` no devuelve sus
 * bytes: devuelve el pool entero del que Node lo saco, que suele ser mucho mas
 * grande. Escribir eso produce un PDF corrupto. Hay que recortar por
 * byteOffset/byteLength.
 */
export function bytesDe(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export async function generar(html: string, opts: PrintOptions): Promise<Uint8Array> {
  // require dinamico: electron no existe en mobile, y el bundler no debe
  // resolverlo en tiempo de build.
  const remote = requireRemote();

  const dir = await mkdtemp(join(tmpdir(), "pressmark-"));
  const archivo = join(dir, "doc.html");
  await writeFile(archivo, html, "utf8");

  const win = new remote.BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  try {
    await win.loadFile(archivo);
    // Sin esto una tipografia aun sin cargar imprime con la de reemplazo y el
    // documento sale con otra metrica.
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)", true);
    return await win.webContents.printToPDF({
      landscape: opts.landscape,
      printBackground: opts.printBackground,
      pageSize: { width: opts.paperWidth, height: opts.paperHeight },
      // Sin marginType: esa propiedad es de contents.print(), NO de
      // printToPDF. Aca los cuatro lados van en PULGADAS y nada mas.
      margins: opts.margins,
      displayHeaderFooter: opts.displayHeaderFooter,
      headerTemplate: opts.headerTemplate,
      footerTemplate: opts.footerTemplate,
      ...(opts.scale ? { scale: opts.scale } : {}),
      // Falso a proposito: el tamano lo manda theme.json, no un @page que se le
      // haya colado al CSS. Fuente unica de verdad.
      preferCSSPageSize: false,
    });
  } finally {
    win.destroy();
    await unlink(archivo).catch(() => {});
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
 * Obtiene @electron/remote.
 *
 * Obsidian lo trae bundleado e inicializado (verificado en app.asar), pero el
 * modulo se habilita POR webContents. Si no estuviera habilitado para el
 * renderer del plugin, el error de Electron lo dice con esas palabras — por eso
 * se distingue ese caso: sin el mensaje preciso, el fallo es indiagnosticable.
 */
function requireRemote(): Remote {
  const req = (globalThis as { require?: (m: string) => unknown }).require;
  if (!req) {
    throw new Error(
      "no hay acceso a require(): el plugin necesita el escritorio (isDesktopOnly)",
    );
  }
  let mod: Remote | undefined;
  try {
    mod = req("@electron/remote") as Remote;
  } catch (e) {
    try {
      mod = (req("electron") as { remote?: Remote }).remote;
    } catch {
      /* se reporta abajo con el error original */
    }
    if (!mod) {
      throw new Error(`no pude cargar @electron/remote: ${(e as Error).message}`);
    }
  }
  if (!mod?.BrowserWindow) {
    throw new Error("@electron/remote cargo pero no expone BrowserWindow");
  }
  return mod;
}
