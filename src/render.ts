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
export function flattenRendered(root: HTMLElement): void {
  const HTMLEl = root.doc.defaultView?.HTMLElement ?? HTMLElement;
  let changed = true;
  while (changed) {
    changed = false;
    for (const child of Array.from(root.children)) {
      // The constructor from THIS element's window, not the bare global: an
      // element rendered in a popout window belongs to that window's class,
      // and a plain instanceof would silently say no.
      if (child.instanceOf(HTMLEl) && /(^|\s)el-\S+/.test(child.className)) {
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

/**
 * Waits for Obsidian to finish drawing diagrams.
 *
 * MarkdownRenderer.render() resolves before Mermaid has drawn: it hands back
 * the container while the diagrams are still being laid out asynchronously.
 * Reading innerHTML at that moment captures empty placeholders, and the PDF
 * comes out with the diagrams missing and no error anywhere.
 *
 * Resolves as soon as every diagram has an <svg>, or gives up after the
 * timeout — a diagram that fails to draw must not stop the export.
 */
async function waitForDiagrams(root: HTMLElement, timeoutMs = 4000): Promise<void> {
  const pending = () =>
    Array.from(root.querySelectorAll(".mermaid")).filter((e) => !e.querySelector("svg")).length;

  if (pending() === 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => window.setTimeout(r, 40));
    if (pending() === 0) return;
  }
}

/**
 * Replaces a diagram that never drew with its own source.
 *
 * Obsidian asks for permission before rendering Mermaid in a vault, and until
 * it is granted the container holds the prompt — "Display Mermaid diagrams in
 * this vault?" — instead of a diagram. That prompt was being printed into the
 * PDF, which is worse than showing nothing.
 *
 * The source is the honest fallback: the reader sees what the diagram was
 * meant to be, and the author sees that something needs enabling.
 */
function replaceUndrawnDiagrams(root: HTMLElement): void {
  // A guarded diagram is a whole subtree, not the .mermaid element: Obsidian
  // wraps it in `.mermaid-wrapper.is-guarded` holding the prompt in
  // `.mermaid-guard-text` and the diagram in `.mermaid-guard-source`. Aiming
  // at `.mermaid` replaced the wrong node and left the prompt on the page —
  // and in the PDF. These names come from Obsidian's own bundle, not a guess.
  for (const wrapper of Array.from(root.querySelectorAll(".mermaid-wrapper.is-guarded"))) {
    const source = wrapper.querySelector(".mermaid-guard-source")?.textContent ?? "";
    wrapper.replaceWith(undrawn(source));
  }

  // Anything else that never got an <svg>: a diagram that failed to draw, or a
  // render that timed out.
  for (const el of Array.from(root.querySelectorAll(".mermaid"))) {
    if (el.querySelector("svg")) continue;
    el.replaceWith(undrawn(el.textContent ?? ""));
  }
}

/**
 * The fallback for a diagram that never drew: its own source.
 *
 * The reader sees what the diagram was meant to be, and the author sees that
 * something needs enabling. Both beat a stray permission prompt, and both beat
 * a silent gap.
 */
function undrawn(source: string): HTMLElement {
  const pre = createEl("pre", { cls: "pressmark-undrawn" });
  pre.createEl("code", { text: source.trim() });
  return pre;
}

export async function renderBody(
  app: App,
  markdown: string,
  sourcePath: string,
  component: Component,
): Promise<string> {
  const el = createDiv({ cls: WRAPPER });

  // Attached, off-screen, on purpose. A detached element never gets laid out,
  // and Obsidian will not draw a diagram it cannot measure — which is why the
  // diagrams were coming out empty. The class also pins the width to A4 at
  // 96dpi, so diagrams size themselves to the page they are headed for.
  el.addClass("pressmark-offscreen");
  document.body.appendChild(el);

  try {
    await MarkdownRenderer.render(app, markdown, el, sourcePath, component);
    await waitForDiagrams(el);
    replaceUndrawnDiagrams(el);
    stripUI(el);
    flattenRendered(el);
    return el.innerHTML;
  } finally {
    el.remove();
  }
}
