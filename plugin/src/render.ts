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
import { WRAPPER } from "./document";

export * from "./document";

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

/**
 * Elementos que Obsidian agrega para la INTERFAZ, no para el documento.
 *
 * El renderer de Obsidian devuelve el DOM tal como se ve en la app, botones
 * incluidos. El de copiar codigo termino impreso adentro de un bloque de codigo
 * en un PDF real. Nada de esto tiene sentido en papel.
 */
const CHROME = [
  ".copy-code-button",
  ".edit-block-button",
  ".collapse-indicator",
  ".heading-collapse-indicator",
  ".callout-fold",
  ".markdown-preview-pusher",
  ".metadata-container",
  ".frontmatter",
  ".frontmatter-container",
  ".mod-header",
  ".mod-footer",
  ".embed-buttons",
  ".internal-embed .file-embed-title",
].join(",");

function limpiarUI(raiz: HTMLElement): void {
  raiz.querySelectorAll(CHROME).forEach((e) => e.remove());

  // Los botones que quedan son de la interfaz: el markdown no genera ninguno.
  raiz.querySelectorAll("button").forEach((e) => e.remove());

  // Un callout plegado se imprime ABIERTO: en papel no se despliega nada.
  raiz.querySelectorAll(".callout.is-collapsed").forEach((e) => {
    e.removeClass("is-collapsed");
    e.setAttribute("data-callout-fold", "+");
  });
  raiz.querySelectorAll(".is-collapsed").forEach((e) => e.removeClass("is-collapsed"));

  // Nada editable ni enfocable en un documento impreso.
  raiz.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
  raiz.querySelectorAll("[tabindex]").forEach((e) => e.removeAttribute("tabindex"));
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
  limpiarUI(el);
  aplanar(el);
  return el.innerHTML;
}
