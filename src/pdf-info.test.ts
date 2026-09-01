import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { looksLikePdf, pageCount } from "./pdf-info";

// Real PDFs, produced by the CLI from the sample documents. Their page counts
// were taken from pdfinfo, so the expectations come from an outside tool
// rather than from this code agreeing with itself.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "testdata", "pdf");

const EXPECTED: Record<string, number> = {
  "one-page.pdf": 1,
  "note.pdf": 3,
  "report.pdf": 4,
  "technical.pdf": 4,
};

describe("pageCount", () => {
  test("every fixture is covered", () => {
    const onDisk = readdirSync(FIXTURES).filter((f) => f.endsWith(".pdf")).sort();
    expect(onDisk).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [file, pages] of Object.entries(EXPECTED)) {
    test(`${file} → ${pages}`, () => {
      const bytes = new Uint8Array(readFileSync(join(FIXTURES, file)));
      expect(pageCount(bytes)).toBe(pages);
    });
  }

  test("nonsense returns 1 rather than throwing", () => {
    // A caption is not worth failing an export over.
    expect(pageCount(new Uint8Array([1, 2, 3]))).toBe(1);
    expect(pageCount(new Uint8Array())).toBe(1);
  });

  test("does not mistake /Type /Pages for a page", () => {
    const fake = new TextEncoder().encode("%PDF-1.4\n/Type /Pages\n/Type /Pages\n");
    expect(pageCount(fake)).toBe(1);
  });

  test("takes the largest /Count, since the tree nests", () => {
    const fake = new TextEncoder().encode("%PDF-1.4\n/Count 3\n/Count 9\n/Count 2\n");
    expect(pageCount(fake)).toBe(9);
  });
});

describe("looksLikePdf", () => {
  test("accepts the real ones", () => {
    for (const f of Object.keys(EXPECTED)) {
      expect(looksLikePdf(new Uint8Array(readFileSync(join(FIXTURES, f)))), f).toBe(true);
    }
  });

  test("rejects anything else", () => {
    expect(looksLikePdf(new TextEncoder().encode("<html>"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});
