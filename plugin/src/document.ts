/**
 * Logica de documento que NO depende de Obsidian.
 *
 * Vive aparte de render.ts a proposito: esto es lo que tiene que coincidir con
 * el lado Go, y separarlo lo hace testeable sin la app. render.ts se queda solo
 * con lo que necesita el renderer de Obsidian.
 */
import type { Resolved, Band, Margin, Localized } from "./theme";
import { resolve } from "./locale";

/** Los themes dependen de `.pm-doc > h1:first-of-type` para armar la portada. */
export const WRAPPER = "pm-doc";

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

/**
 * Margenes simulados para la vista previa.
 *
 * En el PDF los margenes los pone printToPDF, no el CSS. Si la vista previa no
 * los simula, el texto se ve pegado al borde y el ancho de columna es otro: las
 * lineas cortan distinto y el juicio del usuario sobre el resultado no vale.
 */
function paddingPreview(m: Margin | undefined): string {
  if (!m) return "";
  const v = (x: string | undefined) => x ?? "0";
  return `body { padding: ${v(m.top)} ${v(m.right)} ${v(m.bottom)} ${v(m.left)}; box-sizing: border-box; }`;
}

export function documentHTML(
  titulo: string,
  body: string,
  t: Resolved,
  preview = false,
): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapar(titulo)}</title>
<style>
html, body { margin: 0; padding: 0; }
${preview ? paddingPreview(t.page?.margin) : ""}

/* Red de seguridad contra el chrome de la interfaz de Obsidian. El renderer
   devuelve el DOM tal como se ve en la app; limpiarUI() quita lo conocido y
   esto ataja lo que aparezca despues con otra clase. */
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
  locale: string,
): string {
  if (!b?.enabled) return "<span></span>";

  const izq = m?.left ?? "0";
  const der = m?.right ?? "0";
  const size = b.fontSize ?? "7pt";
  const color = b.color ?? "#8a9099";
  const regla = b.rule ? "border-top:0.5pt solid #e4e7ea;padding-top:2mm;" : "";

  const ranuras = [b.left, b.center, b.right]
    .map((s) => `<span>${s ? expandir(resolve(s, locale), vars, titulo) : ""}</span>`)
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

/**
 * Separa el frontmatter YAML del cuerpo. GEMELO de render.SplitFrontmatter en Go.
 *
 * Obsidian ya lo filtra por su cuenta, pero se hace igual y explicitamente: asi
 * el comportamiento es el MISMO en el CLI y en el plugin, y no depende de un
 * detalle interno de Obsidian que puede cambiar. Ademas hace falta para exponer
 * los campos como {{fm.clave}}.
 *
 * Sin esto, el `---` de apertura del frontmatter es el primer <hr> del
 * documento y dispara ahi el salto de portada: sale una carilla en blanco.
 */
export function splitFrontmatter(src: string): {
  campos: Record<string, string> | null;
  cuerpo: string;
} {
  const lineas = src.split("\n");
  if (lineas.length < 2 || (lineas[0] ?? "").trimEnd() !== "---") {
    return { campos: null, cuerpo: src };
  }
  let fin = -1;
  for (let i = 1; i < lineas.length; i++) {
    const l = (lineas[i] ?? "").trimEnd();
    if (l === "---" || l === "...") {
      fin = i;
      break;
    }
  }
  // Sin cierre NO es frontmatter: inventarlo se comeria contenido.
  if (fin < 0) return { campos: null, cuerpo: src };

  const campos: Record<string, string> = {};
  for (const l of lineas.slice(1, fin)) {
    if (!l || l.trimStart().startsWith("#")) continue;
    if (l[0] === " " || l[0] === "\t" || l.trimStart().startsWith("- ")) continue;
    const i = l.indexOf(":");
    if (i < 0) continue;
    const k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1).trim();
    if (k) campos[k] = v;
  }
  return {
    campos: Object.keys(campos).length ? campos : null,
    cuerpo: lineas.slice(fin + 1).join("\n"),
  };
}

/** Junta las vars del theme con el frontmatter, accesible como {{fm.clave}}. */
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

/** Titulo: campo del frontmatter, si no el primer h1, si no el nombre del archivo. */
export function tituloDesde(
  campos: Record<string, string> | null,
  cuerpo: string,
  fallback: string,
): string {
  const t = campos?.["title"] ?? campos?.["titulo"];
  if (t) return t;
  return tituloDe(cuerpo, fallback);
}

/** Titulo del primer h1, para {{title}} y para el <title> del documento. */
export function tituloDe(markdown: string, porDefecto: string): string {
  for (const l of markdown.split("\n")) {
    const t = l.trim();
    if (t.startsWith("# ")) return t.slice(2).trim();
  }
  return porDefecto;
}
