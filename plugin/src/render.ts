/**
 * Markdown -> HTML using Obsidian's renderer.
 *
 * Obsidian's own renderer is used on purpose instead of a custom parser: it's
 * the only thing that resolves wikilinks, embeds, callouts and Dataview
 * blocks. A generic parser knows nothing about any of that, and losing those
 * features would mean losing the reason to be a plugin at all.
 *
 * The price is that the pipelines here and in the CLI are different. What
 * guarantees the PDF comes out the same isn't shared code: it's the theme
 * pack plus the STRUCTURE CONTRACT this file enforces.
 */
import { Component, MarkdownRenderer, type App } from "obsidian";
import { WRAPPER } from "./document";

export * from "./document";

/**
 * Obsidian sometimes wraps each block in a div.el-*. If those stay, top-level
 * blocks stop being DIRECT children of the wrapper and the cover page no
 * longer matches. Unwrapping them IS the contract, not tidiness.
 */
function flatten(root: HTMLElement): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of Array.from(root.children)) {
      if (child instanceof HTMLElement && /(^|\s)el-\S+/.test(child.className)) {
        child.replaceWith(...Array.from(child.childNodes));
        changed = true;
      }
    }
  }
}

/**
 * Elements Obsidian adds for the INTERFACE, not for the document.
 *
 * Obsidian's renderer returns the DOM exactly as seen in the app, buttons
 * included. The copy-code one ended up printed inside a code block in a real
 * PDF. None of this makes sense on paper.
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

function stripUI(root: HTMLElement): void {
  root.querySelectorAll(CHROME).forEach((e) => e.remove());

  // Any remaining buttons are interface chrome: markdown never generates any.
  root.querySelectorAll("button").forEach((e) => e.remove());

  // A collapsed callout prints OPEN: nothing stays folded on paper.
  root.querySelectorAll(".callout.is-collapsed").forEach((e) => {
    e.removeClass("is-collapsed");
    e.setAttribute("data-callout-fold", "+");
  });
  root.querySelectorAll(".is-collapsed").forEach((e) => e.removeClass("is-collapsed"));

  // Nothing editable or focusable in a printed document.
  root.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
  root.querySelectorAll("[tabindex]").forEach((e) => e.removeAttribute("tabindex"));
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
  stripUI(el);
  flatten(el);
  return el.innerHTML;
}
