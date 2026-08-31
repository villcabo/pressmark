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
  private stage: HTMLElement;
  private scaler: HTMLElement;
  private breaks: HTMLElement;
  private canvas: HTMLElement;
  private info: HTMLElement;
  private pages = 1;
  /** "fit", or an explicit factor such as 0.75. */
  private zoom: "fit" | number = "fit";
  private lastWidthPx = 0;
  private lastOpts: { maxHeight?: number; fill?: boolean } = {};

  constructor(parent: HTMLElement) {
    this.canvas = parent.createDiv({ cls: "pressmark-canvas" });
    // A stage sized to the SCALED page. transform does not change layout size,
    // so without this the page cannot be centred and leaves dead space beside
    // it. The stage occupies the space the page visually takes.
    this.stage = this.canvas.createDiv({ cls: "pressmark-stage" });
    this.scaler = this.stage.createDiv({ cls: "pressmark-scale" });
    this.frame = this.scaler.createEl("iframe", { cls: "pressmark-preview" });
    this.frame.setAttr("sandbox", "allow-same-origin");
    this.breaks = this.scaler.createDiv({ cls: "pressmark-breaks" });
    this.info = parent.createDiv({ cls: "pressmark-info" });
  }

  get parts(): PreviewParts {
    return { canvas: this.canvas, info: this.info };
  }

  /**
   * Redraws with a theme and an already-rendered document body.
   *
   * `fill` lets the canvas take whatever vertical space CSS gives it, instead
   * of a fixed cap. The modal wants the cap — it is one panel among several.
   * The designer wants the space — the page IS the point there.
   */
  render(
    theme: Resolved,
    title: string,
    bodyHTML: string,
    opts: { maxHeight?: number; fill?: boolean } = {},
  ): void {
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
      this.fit(widthPx, opts);
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

  /**
   * Alt + wheel zooms, the way every design tool does.
   *
   * Alt rather than Ctrl: Ctrl+wheel is the browser's own page zoom, and
   * fighting it would break the rest of the app inside the same window.
   */
  enableWheelZoom(onChange?: (factor: number) => void): void {
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        const current = this.currentFactor(this.lastWidthPx);
        const next = Math.max(0.1, Math.min(3, current * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        this.setZoom(next);
        onChange?.(next);
      },
      { passive: false },
    );
  }

  /** Sets the zoom and redraws at the new factor. */
  setZoom(zoom: "fit" | number): void {
    this.zoom = zoom;
    if (this.lastWidthPx) this.fit(this.lastWidthPx, this.lastOpts);
  }

  /** The factor currently applied, for a caller that wants to label it. */
  get scale(): number {
    return this.currentFactor(this.lastWidthPx);
  }

  private currentFactor(widthPx: number): number {
    if (this.zoom !== "fit") return this.zoom;
    const available = this.canvas.clientWidth;
    if (!available || !widthPx) return 1;
    // Fills the pane, enlarging past 100% when there is room: a page shown
    // smaller than it needs to be is the thing "fit" is supposed to fix.
    // Capped so a very wide pane does not blow the page up past legibility.
    return Math.max(0.1, Math.min(3, (available - 24) / widthPx));
  }

  /** Scales the page and centres it. */
  private fit(widthPx: number, opts: { maxHeight?: number; fill?: boolean }): void {
    this.lastWidthPx = widthPx;
    this.lastOpts = opts;
    const available = this.canvas.clientWidth;
    if (!available) return;
    const f = this.currentFactor(widthPx);

    // The break labels live inside the scaled element and would shrink with it;
    // the variable counter-scales them back to a readable size.
    this.canvas.setCssProps({ "--pm-scale": String(f) });
    this.scaler.setCssProps({
      transform: `scale(${f})`,
      "--pm-scale": String(f),
    });

    // The stage takes the page's visual size so it can be centred.
    this.stage.setCssProps({
      width: `${widthPx * f}px`,
      height: `${this.scaler.offsetHeight * f}px`,
    });

    if (opts.fill) {
      // CSS owns the height: the canvas takes the space it is given and the
      // pages scroll inside it.
      this.canvas.addClass("is-filling");
      return;
    }
    this.canvas.removeClass("is-filling");
    this.canvas.setCssProps({
      height: `${Math.min(opts.maxHeight ?? 520, this.scaler.offsetHeight * f)}px`,
    });
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
