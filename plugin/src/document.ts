/**
 * Document logic that does NOT depend on Obsidian.
 *
 * Lives apart from render.ts on purpose: this is what has to match the Go
 * side, and separating it makes it testable without the app. render.ts is
 * left with only what Obsidian's renderer needs.
 */
import type { Resolved, Band, Margin, Localized } from "./theme";
import { resolve } from "./locale";

/** Themes rely on `.pm-doc > h1:first-of-type` to build the cover page. */
export const WRAPPER = "pm-doc";

/** Emits the design tokens as CSS variables. Sorted: stable output. */
export function tokensCSS(tokens: Record<string, string> | undefined): string {
  if (!tokens || Object.keys(tokens).length === 0) return "";
  const rows = Object.keys(tokens)
    .sort()
    .map((k) => `  --${k}: ${tokens[k]};`)
    .join("\n");
  return `:root {\n${rows}\n}\n`;
}

export function coverCSS(t: Resolved): string {
  if (!t.cover?.enabled) return "";
  if (t.cover.break === "none") return "";
  return `.${WRAPPER} > hr:first-of-type { break-after: page; border: none; margin: 0; height: 0; }\n`;
}

/**
 * Simulated margins for the preview.
 *
 * In the PDF the margins are set by printToPDF, not by CSS. If the preview
 * doesn't simulate them, the text looks glued to the edge and the column
 * width is different: lines wrap differently and the user's judgment about
 * the result isn't worth anything.
 */
function paddingPreview(m: Margin | undefined): string {
  if (!m) return "";
  const v = (x: string | undefined) => x ?? "0";
  return `body { padding: ${v(m.top)} ${v(m.right)} ${v(m.bottom)} ${v(m.left)}; box-sizing: border-box; }`;
}

export function documentHTML(
  title: string,
  body: string,
  t: Resolved,
  preview = false,
): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
html, body { margin: 0; padding: 0; }
${preview ? paddingPreview(t.page?.margin) : ""}

/* Safety net against Obsidian's interface chrome. The renderer returns the
   DOM exactly as seen in the app; stripUI() removes what's known and this
   catches whatever shows up later under another class. */
button,
.copy-code-button,
.edit-block-button,
.collapse-indicator,
.heading-collapse-indicator,
.callout-fold,
.metadata-container,
.frontmatter,
.frontmatter-container { display: none !important; }
</style>
<style>
${tokensCSS(t.tokens)}</style>
<style>
${t.css}
${coverCSS(t)}</style>
</head>
<body>
<article class="${WRAPPER}">
${body}
</article>
</body>
</html>
`;
}

/**
 * Header or footer band for printToPDF.
 *
 * Chrome renders these in a SEPARATE context: they don't see the page's CSS
 * and don't inherit font size. Everything goes inline, and the side margin is
 * injected from page.margin — writing it by hand was what left the footer
 * 1mm off from the body in the old format.
 */
export function bandHTML(
  b: Band | undefined,
  m: Margin | undefined,
  vars: Record<string, string> | undefined,
  title: string,
  locale: string,
): string {
  if (!b?.enabled) return "<span></span>";

  const left = m?.left ?? "0";
  const right = m?.right ?? "0";
  const size = b.fontSize ?? "7pt";
  const color = b.color ?? "#8a9099";
  const rule = b.rule ? "border-top:0.5pt solid #e4e7ea;padding-top:2mm;" : "";

  const slots = [b.left, b.center, b.right]
    .map((s) => `<span>${s ? expand(resolve(s, locale), vars, title) : ""}</span>`)
    .join("");

  return (
    `<div style="width:100%;box-sizing:border-box;` +
    `font-family:'Inter','Segoe UI',sans-serif;font-size:${size};color:${color};` +
    `padding:0 ${right} 0 ${left};display:flex;justify-content:space-between;` +
    `align-items:center;${rule}">${slots}</div>`
  );
}

function expand(
  s: string,
  vars: Record<string, string> | undefined,
  title: string,
): string {
  let out = s
    .replaceAll("{{page}}", '<span class="pageNumber"></span>')
    .replaceAll("{{pages}}", '<span class="totalPages"></span>')
    .replaceAll("{{date}}", '<span class="date"></span>')
    .replaceAll("{{file}}", '<span class="url"></span>')
    .replaceAll("{{title}}", escape(title));
  for (const [k, v] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{{vars.${k}}}`, escape(v));
  }
  return out;
}

function escape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Splits the YAML frontmatter from the body. TWIN of render.SplitFrontmatter in Go.
 *
 * Obsidian already filters it out on its own, but this does it anyway,
 * explicitly: that way the behavior is the SAME in the CLI and in the plugin,
 * and doesn't depend on an internal Obsidian detail that could change. It's
 * also needed to expose the fields as {{fm.field}}.
 *
 * Without this, the frontmatter's opening `---` is the document's first <hr>
 * and triggers the cover-page break right there: a blank page comes out.
 */
export function splitFrontmatter(src: string): {
  fields: Record<string, string> | null;
  body: string;
} {
  const lines = src.split("\n");
  if (lines.length < 2 || (lines[0] ?? "").trimEnd() !== "---") {
    return { fields: null, body: src };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const l = (lines[i] ?? "").trimEnd();
    if (l === "---" || l === "...") {
      end = i;
      break;
    }
  }
  // No closing marker means it's NOT frontmatter: inventing one would eat content.
  if (end < 0) return { fields: null, body: src };

  const fields: Record<string, string> = {};
  for (const l of lines.slice(1, end)) {
    if (!l || l.trimStart().startsWith("#")) continue;
    if (l[0] === " " || l[0] === "\t" || l.trimStart().startsWith("- ")) continue;
    const i = l.indexOf(":");
    if (i < 0) continue;
    const k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1).trim();
    if (k) fields[k] = v;
  }
  return {
    fields: Object.keys(fields).length ? fields : null,
    body: lines.slice(end + 1).join("\n"),
  };
}

/** Joins the theme's vars with the frontmatter, accessible as {{fm.field}}. */
export function mergeVars(
  vars: Record<string, Localized> | undefined,
  fm: Record<string, string> | null,
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars ?? {})) out[k] = resolve(v, locale);
  for (const [k, v] of Object.entries(fm ?? {})) out[`fm.${k}`] = v;
  return out;
}

/** Title: frontmatter field, if not the first h1, if not the file name. */
export function titleFor(
  fields: Record<string, string> | null,
  body: string,
  fallback: string,
): string {
  const t = fields?.["title"];
  if (t) return t;
  return titleFrom(body, fallback);
}

/** Title from the first h1, for {{title}} and for the document's <title>. */
export function titleFrom(markdown: string, fallback: string): string {
  for (const l of markdown.split("\n")) {
    const t = l.trim();
    if (t.startsWith("# ")) return t.slice(2).trim();
  }
  return fallback;
}
