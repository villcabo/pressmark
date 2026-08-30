/**
 * Markdown -> HTML usando el renderer de Obsidian.
 *
 * Se usa el de Obsidian y no un parser propio a proposito: es lo unico que
 * resuelve wikilinks, embeds, callouts y bloques de Dataview. Un parser
 * generico no conoce nada de eso, y perder esas features seria perder la razon
 * de ser un plugin.
 *
 * El precio es que hay pipelines distintos aca y en el CLI. Lo que garantiza
 * que el PDF salga igual no es compartir codigo: es el theme pack mas el
 * CONTRATO DE ESTRUCTURA que impone este archivo.
 */
import { Component, MarkdownRenderer, type App } from "obsidian";
import type { Resolved, Band, Margin } from "./theme";

/** Los themes dependen de `.m2p-doc > h1:first-of-type` para armar la portada. */
export const WRAPPER = "m2p-doc";

/**
 * Obsidian a veces envuelve cada bloque en un div.el-*. Si eso queda, los
 * bloques de primer nivel dejan de ser hijos DIRECTOS del envoltorio y la
 * portada no matchea. Desenvolverlos ES el contrato, no una prolijidad.
 */
function aplanar(raiz: HTMLElement): void {
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const hijo of Array.from(raiz.children)) {
      if (hijo instanceof HTMLElement && /(^|\s)el-\S+/.test(hijo.className)) {
        hijo.replaceWith(...Array.from(hijo.childNodes));
        cambio = true;
      }
    }
  }
}

export async function renderBody(
  app: App,
  markdown: string,
  sourcePath: string,
  component: Component,
): Promise<string> {
  const el = document.createElement("div");
  el.addClass(WRAPPER);
  await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
  aplanar(el);
  return el.innerHTML;
}

/** Emite los design tokens como variables CSS. Ordenados: salida estable. */
export function tokensCSS(tokens: Record<string, string> | undefined): string {
  if (!tokens || Object.keys(tokens).length === 0) return "";
  const filas = Object.keys(tokens)
    .sort()
    .map((k) => `  --${k}: ${tokens[k]};`)
    .join("\n");
  return `:root {\n${filas}\n}\n`;
}

export function coverCSS(t: Resolved): string {
  if (!t.cover?.enabled) return "";
  if (t.cover.break === "none") return "";
  return `.${WRAPPER} > hr:first-of-type { break-after: page; border: none; margin: 0; height: 0; }\n`;
}

export function documentHTML(titulo: string, body: string, t: Resolved): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapar(titulo)}</title>
<style>
html, body { margin: 0; padding: 0; }
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
 * Banda de encabezado o pie para printToPDF.
 *
 * Chrome las renderiza en un contexto APARTE: no ven el CSS de la pagina ni
 * heredan tamano de fuente. Todo va inline, y el margen lateral lo inyectamos
 * desde page.margin — escribirlo a mano fue lo que dejo el pie 1mm corrido del
 * cuerpo en el formato viejo.
 */
export function bandHTML(
  b: Band | undefined,
  m: Margin | undefined,
  vars: Record<string, string> | undefined,
  titulo: string,
): string {
  if (!b?.enabled) return "<span></span>";

  const izq = m?.left ?? "0";
  const der = m?.right ?? "0";
  const size = b.fontSize ?? "7pt";
  const color = b.color ?? "#8a9099";
  const regla = b.rule ? "border-top:0.5pt solid #e4e7ea;padding-top:2mm;" : "";

  const ranuras = [b.left, b.center, b.right]
    .map((s) => `<span>${s ? expandir(s, vars, titulo) : ""}</span>`)
    .join("");

  return (
    `<div style="width:100%;box-sizing:border-box;` +
    `font-family:'Inter','Segoe UI',sans-serif;font-size:${size};color:${color};` +
    `padding:0 ${der} 0 ${izq};display:flex;justify-content:space-between;` +
    `align-items:center;${regla}">${ranuras}</div>`
  );
}

function expandir(
  s: string,
  vars: Record<string, string> | undefined,
  titulo: string,
): string {
  let out = s
    .replaceAll("{{page}}", '<span class="pageNumber"></span>')
    .replaceAll("{{pages}}", '<span class="totalPages"></span>')
    .replaceAll("{{date}}", '<span class="date"></span>')
    .replaceAll("{{file}}", '<span class="url"></span>')
    .replaceAll("{{title}}", escapar(titulo));
  for (const [k, v] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{{vars.${k}}}`, escapar(v));
  }
  return out;
}

function escapar(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Titulo del primer h1, para {{title}} y para el <title> del documento. */
export function tituloDe(markdown: string, porDefecto: string): string {
  for (const l of markdown.split("\n")) {
    const t = l.trim();
    if (t.startsWith("# ")) return t.slice(2).trim();
  }
  return porDefecto;
}
