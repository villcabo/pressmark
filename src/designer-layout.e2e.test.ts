/**
 * Geometric guards on the designer's controls column.
 *
 * This exists because the designer's layout kept regressing, and every round of
 * it was diagnosed by squinting at a screenshot — which is how a row ended up
 * 109px tall to hold a 26px colour swatch, with 300px of nothing beside it, and
 * nobody could say so with a number.
 *
 * So the invariants are measured instead, against Obsidian's REAL stylesheet
 * (pulled out of the installed app) laid under ours. A stub of what we think
 * Obsidian does would only ever confirm our own assumptions; app.css is where
 * `.setting-item` is actually a flex row with card padding, and where the
 * container query that we do not benefit from lives.
 *
 * What is asserted is deliberately about geometry, not looks: the control sits
 * beside its name, nothing collides, nothing spills past the padding box, and
 * the two columns start and end on the same line. A prettier design that keeps
 * all of that is free to happen; one that breaks it will fail here.
 *
 * Skipped, not failed, without Chrome or a local Obsidian: this is the only
 * test that needs both.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));

const CHROMES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const ASARS = [
  process.env.OBSIDIAN_ASAR,
  "/opt/Obsidian/resources/obsidian.asar",
  "/usr/lib/obsidian/resources/obsidian.asar",
  "/Applications/Obsidian.app/Contents/Resources/obsidian.asar",
];

const first = (paths: (string | undefined)[]): string | null =>
  paths.find((p) => p && existsSync(p)) ?? null;

const chrome = first(CHROMES);
const asar = first(ASARS);

/** The rows the designer builds, with the real descriptions from the packs. */
const ROWS = `[
  { heading: true, name: "Palette" },
  { name: "Accent", control: "color",
    desc: "Headings, table rules and emphasis. The color the document is identified by. In _base it is accounting green." },
  { name: "Soft accent", control: "color",
    desc: "Background for quotes and notices. Keep it near white: if it weighs, the document looks like a form." },
  { name: "Footer left", control: "text", desc: "Text on the left of the footer." }
]`;

const SCRIPT = `
const ROWS = ${ROWS};
const host = document.querySelector(".pressmark-designer-controls");
for (const r of ROWS) {
  const item = host.createDiv({ cls: r.heading ? "setting-item setting-item-heading" : "setting-item" });
  const info = item.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: r.name });
  if (r.desc) info.createDiv({ cls: "setting-item-description", text: r.desc });
  const ctrl = item.createDiv({ cls: "setting-item-control" });
  if (r.control === "color") { const i = document.createElement("input"); i.type = "color"; ctrl.appendChild(i); }
  if (r.control === "text") { const i = document.createElement("input"); i.type = "text"; ctrl.appendChild(i); }
}
function measure() {
  const rows = [];
  for (const item of host.querySelectorAll(".setting-item")) {
    const cs = getComputedStyle(item);
    const box = item.getBoundingClientRect();
    const contentL = box.left + parseFloat(cs.paddingLeft);
    const contentR = box.right - parseFloat(cs.paddingRight);
    const nameEl = item.querySelector(".setting-item-name");
    const descEl = item.querySelector(".setting-item-description");
    const ctrlEl = item.querySelector(".setting-item-control");
    // Measured on the real boxes and never on .setting-item-info: that wrapper
    // is display:contents here, so its rect is degenerate and every number
    // derived from it is quietly wrong.
    const n = nameEl.getBoundingClientRect();
    const d = descEl ? descEl.getBoundingClientRect() : null;
    const c = ctrlEl.childElementCount ? ctrlEl.getBoundingClientRect() : null;
    const row = { name: nameEl.textContent, height: Math.round(box.height),
                  heading: item.classList.contains("setting-item-heading") };
    if (c) {
      row.besideName = c.top < n.bottom - 1 && c.bottom > n.top + 1;
      row.collides = n.right > c.left + 1;
      row.deadRight = Math.round(contentR - c.right);
      row.overflowRight = Math.round(c.right - contentR);
    }
    if (d) {
      row.descFullWidth = Math.round(d.width) >= Math.round(contentR - contentL) - 2;
      row.descOverflowRight = Math.round(d.right - contentR);
      row.descBelowControl = c ? d.top >= c.bottom - 1 : true;
    }
    rows.push(row);
  }
  const controls = host.getBoundingClientRect();
  const canvas = document.querySelector(".pressmark-pdf").getBoundingClientRect();
  const caption = document.querySelector(".pressmark-info").getBoundingClientRect();
  return { topGap: Math.round(canvas.top - controls.top),
           bottomGap: Math.round(caption.bottom - controls.bottom), rows };
}
requestAnimationFrame(() => document.body.setAttribute("data-measure", JSON.stringify(measure())));
`;

interface Row {
  name: string;
  height: number;
  heading?: boolean;
  besideName?: boolean;
  collides?: boolean;
  deadRight?: number;
  overflowRight?: number;
  descFullWidth?: boolean;
  descOverflowRight?: number;
  descBelowControl?: boolean;
}
interface Measured {
  topGap: number;
  bottomGap: number;
  rows: Row[];
}

function layoutAt(windowWidth: number): Measured {
  const dir = mkdtempSync(join(tmpdir(), "pressmark-layout-"));

  // extract-file, not extract: one 622KB stylesheet instead of the whole app.
  execFileSync("npx", ["--yes", "@electron/asar", "extract-file", asar!, "app.css"], { cwd: dir });

  const page = join(dir, "page.html");
  writeFileSync(
    page,
    `<!doctype html><meta charset=utf-8>` +
      `<style>${readFileSync(join(dir, "app.css"), "utf8")}</style>` +
      `<style>${readFileSync(join(REPO, "styles.css"), "utf8")}</style>` +
      `<body class="theme-dark" data-measure="pending" style="margin:0">` +
      `<div class="pressmark-designer" style="height:900px">` +
      `<div class="pressmark-bar">` +
      `<div class="pressmark-field"><span class="pressmark-field-label">Based on</span><select class="dropdown"><option>executive</option></select></div>` +
      `<div class="pressmark-field"><span class="pressmark-field-label">Document</span><select class="dropdown"><option>Diagrams</option></select></div>` +
      `<div class="pressmark-bar-spacer"></div><span class="pressmark-hint">Alt + scroll to zoom</span></div>` +
      `<div class="pressmark-designer-cols">` +
      `<div class="pressmark-designer-controls"></div>` +
      `<div class="pressmark-designer-preview"><div class="pressmark-pdf"></div><div class="pressmark-info">A4</div></div>` +
      `</div></div>` +
      // Obsidian adds createDiv to HTMLElement; the harness uses it like the plugin does.
      `<script>HTMLElement.prototype.createDiv=function(o){const e=document.createElement("div");` +
      `if(o&&o.cls)e.className=o.cls;if(o&&o.text)e.textContent=o.text;this.appendChild(e);return e;};</script>` +
      `<script>${SCRIPT}</script>`,
  );

  const dom = execFileSync(
    chrome!,
    ["--headless", "--disable-gpu", "--no-sandbox", `--window-size=${windowWidth},1000`,
      "--virtual-time-budget=8000", "--dump-dom", `file://${page}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
  const raw = /data-measure="([^"]*)"/.exec(dom)?.[1];
  if (!raw) throw new Error("the harness never reported; the page did not lay out");
  return JSON.parse(raw.replaceAll("&quot;", '"').replaceAll("&amp;", "&")) as Measured;
}

describe.skipIf(chrome === null || asar === null)("designer controls layout", () => {
  // Three widths: the pane is clamped to 320-400px, so these exercise both ends.
  for (const width of [1500, 1200, 980]) {
    test(`holds its invariants in a ${width}px window`, () => {
      const m = layoutAt(width);

      // The two columns are one view, not two panels: same top, same bottom.
      expect(m.topGap).toBe(0);
      expect(m.bottomGap).toBe(0);

      for (const row of m.rows) {
        if (row.heading) continue;

        // The change this locks in: control beside its name, not stranded on a
        // line of its own. That alone took every row from 109px to 92px.
        expect(row.besideName).toBe(true);
        expect(row.collides).toBe(false);

        // Nothing spills out of the card, and nothing is pinned left with a
        // dead band to its right.
        expect(row.overflowRight).toBeLessThanOrEqual(0);
        expect(row.deadRight).toBe(0);

        // The descriptions explain a decision, so they get the full width —
        // under the control, never squeezed beside it.
        expect(row.descFullWidth).toBe(true);
        expect(row.descOverflowRight).toBeLessThanOrEqual(0);
        expect(row.descBelowControl).toBe(true);

        // A guard against the layout quietly inflating again.
        expect(row.height).toBeLessThan(100);
      }
    }, 120_000);
  }
});
