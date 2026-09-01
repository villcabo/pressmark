/**
 * Reading facts out of a PDF we just produced.
 *
 * The preview shows the real file, so its page count has to come from the file
 * rather than from an estimate. Estimating it was the bug this replaced: a
 * continuous-flow measurement knows nothing about `page-break-inside`, orphans
 * or a forced cover break, so it was wrong in both directions — 3 where the
 * PDF had 4, 27 where it had 16.
 */

/**
 * Number of pages in a PDF.
 *
 * Reads the page tree's `/Count`, taking the LARGEST one: the tree can nest,
 * and every intermediate node carries a count of its own subtree. The root's
 * is the total, and it is the largest by definition.
 *
 * Falls back to counting `/Type /Page` objects when no `/Count` is present,
 * and to 1 when the bytes make no sense — a preview must not fail over a
 * number in its caption.
 */
export function pageCount(bytes: Uint8Array): number {
  // Latin-1 keeps byte values intact: a PDF is binary and decoding it as UTF-8
  // would mangle the very structure being searched.
  const text = new TextDecoder("latin1").decode(bytes);

  let max = 0;
  for (const m of text.matchAll(/\/Count\s+(\d+)/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  if (max > 0) return max;

  // `/Type /Page` but never `/Type /Pages`: the latter is a tree node, not a
  // page, and counting it inflates the total.
  const pages = text.match(/\/Type\s*\/Page(?![\w])/g);
  return pages ? Math.max(1, pages.length) : 1;
}

/** Whether the bytes even look like a PDF. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //  -
  );
}
