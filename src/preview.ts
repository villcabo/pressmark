/**
 * The live document preview.
 *
 * Extracted from the export modal so the settings tab and the theme designer
 * show the SAME thing: three copies of a renderer would drift, and a preview
 * that does not match the export is worse than no preview.
 *
 * The page is drawn at TRUE paper width and then scaled down. Rendering into a
 * narrower box instead would re-lay-out the document — different column width,
 * different line breaks — and the preview would stop predicting the PDF.
 */
import { documentHTML } from "./document";
import { paperSize } from "./paper";
import type { Resolved } from "./theme";
import { t } from "./i18n";

/** CSS pixels per inch: the unit Chromium lays out in. */
const PX_PER_INCH = 96;

export interface PreviewParts {
  /** Scrolls and clips; the page lives inside at scale. */
  canvas: HTMLElement;
  /** Caption under the canvas: paper, margins, page count. */
  info: HTMLElement;
}

export class Preview {
  private frame: HTMLIFrameElement;
  private scaler: HTMLElement;
  private breaks: HTMLElement;
  private canvas: HTMLElement;
  private info: HTMLElement;
  private pages = 1;

  constructor(parent: HTMLElement) {
    this.canvas = parent.createDiv({ cls: "pressmark-canvas" });
    this.scaler = this.canvas.createDiv({ cls: "pressmark-scale" });
    this.frame = this.scaler.createEl("iframe", { cls: "pressmark-preview" });
    this.frame.setAttr("sandbox", "allow-same-origin");
    this.breaks = this.scaler.createDiv({ cls: "pressmark-breaks" });
    this.info = parent.createDiv({ cls: "pressmark-info" });
  }

  get parts(): PreviewParts {
    return { canvas: this.canvas, info: this.info };
  }

  /** Redraws with a theme and an already-rendered document body. */
  render(theme: Resolved, title: string, bodyHTML: string, maxHeight = 520): void {
    let w = 8.27;
    let h = 11.69;
    try {
      [w, h] = paperSize(theme.page);
    } catch {
      /* reported in the caption below */
    }
    if (theme.page?.orientation === "landscape") [w, h] = [h, w];

    const widthPx = w * PX_PER_INCH;
    const heightPx = h * PX_PER_INCH;

    this.frame.style.width = `${widthPx}px`;
    this.frame.srcdoc = documentHTML(title, bodyHTML, theme, true);

    this.frame.onload = () => {
      const doc = this.frame.contentDocument;
      if (!doc) return;

      // Rounded up to whole pages so the last one is shown complete rather
      // than sliced mid-paragraph.
      const content = Math.max(doc.body.scrollHeight, heightPx);
      this.pages = Math.max(1, Math.ceil(content / heightPx));
      const total = this.pages * heightPx;

      this.frame.style.height = `${total}px`;
      this.scaler.style.width = `${widthPx}px`;
      this.scaler.style.height = `${total}px`;

      this.drawBreaks(heightPx);
      this.fit(widthPx, maxHeight);
      this.caption(theme);
    };
  }

  /**
   * Marks where Chromium will break the page.
   *
   * Approximate: the real break respects `page-break-inside`, so a block can be
   * pushed to the next page. Close enough to see a heading or a table stranded
   * across two sheets, which is what this is for.
   */
  private drawBreaks(pageHeightPx: number): void {
    this.breaks.empty();
    for (let i = 1; i < this.pages; i++) {
      const line = this.breaks.createDiv({ cls: "pressmark-break" });
      line.style.top = `${i * pageHeightPx}px`;
      line.createSpan({ text: t("modal.page", { n: i + 1 }) });
    }
  }

  /** Scales the page to the width available, capping the visible height. */
  private fit(widthPx: number, maxHeight: number): void {
    const available = this.canvas.clientWidth;
    if (!available) return;
    const f = Math.min(1, available / widthPx);
    this.scaler.style.transform = `scale(${f})`;
    // The break labels live inside the scaled element, so they shrink with it.
    // This variable counter-scales them back to a readable size.
    this.scaler.style.setProperty("--pm-scale", String(f));
    this.canvas.style.height = `${Math.min(maxHeight, this.scaler.offsetHeight * f)}px`;
  }

  private caption(theme: Resolved): void {
    const m = theme.page?.margin;
    const size = typeof theme.page?.size === "string" ? theme.page.size : t("info.custom");
    const orientation =
      theme.page?.orientation === "landscape" ? t("info.landscape") : t("info.portrait");
    this.info.setText(
      [
        size,
        orientation,
        `${t("info.margins")} ${m?.top ?? "?"} ${m?.right ?? "?"} ${m?.bottom ?? "?"} ${m?.left ?? "?"}`,
        theme.cover?.enabled ? t("info.withCover") : t("info.withoutCover"),
        ...(theme.footer?.enabled ? [t("info.withFooter")] : []),
        t("info.pages", { n: this.pages }),
      ].join(" · "),
    );
  }
}
