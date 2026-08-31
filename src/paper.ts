/**
 * Paper geometry and unit conversion.
 *
 * Pure by design, and kept apart from pdf.ts for the same reason config.ts is
 * kept apart from settings.ts and document.ts from render.ts: anything that
 * imports "obsidian" cannot be unit tested outside the app. Whatever needs a
 * test goes in a module that does not touch Obsidian.
 */
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

