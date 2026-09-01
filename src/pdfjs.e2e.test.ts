/**
 * Proves pdf.js actually renders inside a bundle like the plugin's.
 *
 * This one is worth the seconds it costs. The whole preview rests on a single
 * unobvious trick — setting `window.pdfjsLib`'s worker global so PDFWorker
 * takes the main-thread path instead of calling `new Worker` — and if a pdf.js
 * upgrade ever changes that internal, nothing else in the suite would notice:
 * the library would quietly try to spawn a Worker it cannot build, the preview
 * would go blank, and every other test would still pass.
 *
 * So the test does the real thing: bundles `pdfjs.ts` the way esbuild bundles
 * the plugin, opens a real PDF in a real Chrome, rasterises the first and last
 * page, and counts dark pixels. Blank pages are the failure being guarded
 * against, so "it rendered" has to mean ink on the canvas, not merely no
 * exception. The page count is checked too, against a fixture whose count came
 * from `pdfinfo` — a second, independent confirmation of `pageCount()`.
 *
 * Skipped, not failed, where there is no Chrome: this is the one test in the
 * suite that needs a browser.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(SRC);

/** The same short list the CLI walks; enough to cover CI and a dev machine. */
const CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findChrome(): string | null {
  for (const c of CANDIDATES) if (c && existsSync(c)) return c;
  return null;
}

const chrome = findChrome();

const PROBE = `
import { closePdf, openPdf } from ${JSON.stringify(join(SRC, "pdfjs"))};
async function main() {
  const bin = atob(document.getElementById("pdf").textContent.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const doc = await openPdf(bytes);
  const out = ["pages=" + doc.numPages];
  for (const n of [1, doc.numPages]) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200) ink++;
    out.push("p" + n + "=" + Math.round(vp.width) + "x" + Math.round(vp.height) + ":" + ink);
  }
  await closePdf(doc);
  return out.join(" ");
}
main().then(
  (r) => document.body.setAttribute("data-result", "OK " + r),
  (e) => document.body.setAttribute("data-result", "FAIL " + (e && e.stack ? e.stack : e)),
);
`;

/** Bundles the probe, runs it in headless Chrome, and returns what it reported. */
function probe(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pressmark-pdfjs-"));
  const entry = join(dir, "probe.ts");
  const bundle = join(dir, "probe.js");
  writeFileSync(entry, PROBE);
  execFileSync("npx", ["esbuild", entry, "--bundle", "--format=iife", "--target=es2022",
    `--outfile=${bundle}`, "--log-level=error"], { cwd: REPO });

  const pdf = readFileSync(join(REPO, "testdata", "pdf", fixture)).toString("base64");
  const page = join(dir, "probe.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset=utf-8><body data-result="pending">` +
      `<script type="text/plain" id="pdf">${pdf}</script>` +
      `<script>${readFileSync(bundle, "utf8")}</script>`,
  );

  const dom = execFileSync(
    chrome!,
    ["--headless", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=30000",
      "--dump-dom", `file://${page}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  return /data-result="([^"]*)"/.exec(dom)?.[1] ?? "no result";
}

describe.skipIf(chrome === null)("pdf.js in a bundle", () => {
  test("renders a real PDF without ever spawning a Worker", () => {
    const r = probe("report.pdf");
    // A thrown error names the failure; assert on the message so a broken
    // worker wiring reports what broke instead of just "expected true".
    expect(r).toStartWith("OK ");
    // report.pdf has 4 pages according to pdfinfo.
    expect(r).toContain("pages=4");
    // Ink, not merely "no exception": a blank canvas is the failure mode.
    for (const page of ["p1", "p4"]) {
      const ink = Number(new RegExp(`${page}=\\d+x\\d+:(\\d+)`).exec(r)?.[1] ?? 0);
      expect(ink).toBeGreaterThan(500);
    }
    // A4 at scale 1, in points.
    expect(r).toContain("p1=596x842");
  }, 120_000);
});
