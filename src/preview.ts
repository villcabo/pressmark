/**
 * The live document preview.
 *
 * Shared by the export modal and the theme designer: three copies of a
 * renderer would drift, and a preview that stops matching the export is worse
 * than no preview at all.
 *
 * Two things it takes seriously:
 *
 * **Real paper width.** The page is drawn at true paper size and then scaled.
 * Rendering into a narrower box would re-lay-out the document — different
 * column width, different line breaks — and the preview would stop predicting
 * the PDF.
 *
 * **Real sheets.** Each page is its own sheet with a gap between, the way a PDF
 * viewer shows them, rather than one long scroll with a line drawn across it.
 * The header and footer are drawn on every sheet, because in the PDF they are
 * put there by printToPDF and would otherwise never appear in the preview.
 */
import { bandHTML, documentHTML, mergeVars } from "./document";
import { paperSize, toInches } from "./paper";
import type { Resolved } from "./theme";
import { t, language } from "./i18n";

/** CSS pixels per inch: the unit Chromium lays out in. */
const PX_PER_INCH = 96;

/**
 * Sheets rendered at most.
 *
 * Each one parses the document again, so a hundred-page note would cost a
 * hundred layouts. Nobody judges a format past the first few pages.
 */
const MAX_SHEETS = 12;

export interface PreviewParts {
  canvas: HTMLElement;
  info: HTMLElement;
}

export class Preview {
  private canvas: HTMLElement;
  private stage: HTMLElement;
  private sheets: HTMLElement;
  private info: HTMLElement;
  private probe: HTMLIFrameElement;
  private pages = 1;
  private zoom: "fit" | number = "fit";
  private lastWidthPx = 0;
  private contentPx = 1;
  private marginTopPx = 0;

  constructor(parent: HTMLElement) {
    this.canvas = parent.createDiv({ cls: "pressmark-canvas" });
    // Sized to the SCALED pages: transform does not change layout size, so this
    // is what gives them something to be centred as.
    this.stage = this.canvas.createDiv({ cls: "pressmark-stage" });
    // Two elements on purpose: the stage carries the SCALED size so it can be
    // centred, and the inner one carries the transform. Doing both on one
    // element scales it twice and the page vanishes.
    this.sheets = this.stage.createDiv({ cls: "pressmark-sheets" });
    this.info = parent.createDiv({ cls: "pressmark-info" });

    // Measures the document's height off-screen so the page count is known
    // before any sheet is built.
    this.probe = parent.createEl("iframe", { cls: "pressmark-probe" });
    this.probe.setAttr("sandbox", "allow-same-origin");
  }

  get parts(): PreviewParts {
    return { canvas: this.canvas, info: this.info };
  }

  /**
   * Alt + wheel zooms, the way every design tool does.
   *
   * Alt rather than Ctrl: Ctrl+wheel is the browser's own page zoom, and
   * fighting it would break the rest of the app in the same window.
   */
  enableWheelZoom(onChange?: (factor: number) => void): void {
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!e.altKey) return;
        e.preventDefault();
        const next = clamp(this.factor() * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        this.setZoom(next);
        onChange?.(next);
      },
      { passive: false },
    );
  }

  setZoom(zoom: "fit" | number): void {
    this.zoom = zoom;
    this.applyScale();
  }

  render(theme: Resolved, title: string, bodyHTML: string, opts: { fill?: boolean } = {}): void {
    let w = 8.27;
    let h = 11.69;
    try {
      [w, h] = paperSize(theme.page);
    } catch {
      /* surfaced in the caption */
    }
    if (theme.page?.orientation === "landscape") [w, h] = [h, w];

    const widthPx = w * PX_PER_INCH;
    const heightPx = h * PX_PER_INCH;
    this.lastWidthPx = widthPx;
    this.canvas.toggleClass("is-filling", opts.fill === true);

    const html = documentHTML(title, bodyHTML, theme, true);

    // What actually fits on a page: the sheet minus the margins the PDF puts
    // on EVERY page. Slicing at the full page height is what let text run
    // through where the margins belong and the footer land on top of it.
    const mt = inchesOf(theme.page?.margin?.top) * PX_PER_INCH;
    const mb = inchesOf(theme.page?.margin?.bottom) * PX_PER_INCH;
    this.contentPx = Math.max(120, heightPx - mt - mb);
    this.marginTopPx = mt;

    this.probe.setCssProps({ width: `${widthPx}px` });
    this.probe.srcdoc = html;
    this.probe.onload = () => {
      const doc = this.probe.contentDocument;
      const content = Math.max(doc?.body.scrollHeight ?? 0, 1);
      this.pages = Math.max(1, Math.ceil(content / this.contentPx));
      this.buildSheets(theme, title, html, widthPx, heightPx);
      this.applyScale();
      this.caption(theme);
    };
  }

  /** One sheet per page, each showing its slice of the same document. */
  private buildSheets(
    theme: Resolved,
    title: string,
    html: string,
    widthPx: number,
    heightPx: number,
  ): void {
    this.sheets.empty();
    const shown = Math.min(this.pages, MAX_SHEETS);
    const vars = mergeVars(theme.vars, null, language());
    const margin = theme.page?.margin;

    for (let i = 0; i < shown; i++) {
      const sheet = this.sheets.createDiv({ cls: "pressmark-sheet" });
      sheet.setCssProps({ width: `${widthPx}px`, height: `${heightPx}px` });

      const frame = sheet.createEl("iframe", { cls: "pressmark-preview" });
      frame.setAttr("sandbox", "allow-same-origin");
      frame.srcdoc = html;
      // The same document in every sheet, shifted so each shows its own page.
      frame.setCssProps({
        width: `${widthPx}px`,
        height: `${this.contentPx * this.pages + this.marginTopPx}px`,
        // Page i starts at its own top margin, and each page shows one content
        // height's worth: the same arithmetic the print engine does.
        top: `${this.marginTopPx - i * this.contentPx}px`,
      });

      this.band(sheet, "header", theme, title, vars, margin, i + 1);
      this.band(sheet, "footer", theme, title, vars, margin, i + 1);
    }

    if (this.pages > shown) {
      this.sheets.createDiv({
        cls: "pressmark-more",
        text: t("preview.morePages", { n: this.pages - shown }),
      });
    }
  }

  /**
   * Draws a header or footer onto a sheet.
   *
   * In the PDF these are put there by printToPDF, outside the document, which
   * is why they never showed up in the preview. Here the page placeholders are
   * filled with real numbers rather than the spans Chrome fills in itself.
   */
  private band(
    sheet: HTMLElement,
    which: "header" | "footer",
    theme: Resolved,
    title: string,
    vars: Record<string, string>,
    margin: Resolved["page"] extends undefined ? never : NonNullable<Resolved["page"]>["margin"],
    page: number,
  ): void {
    const band = which === "header" ? theme.header : theme.footer;
    if (!band?.enabled) return;

    const html = bandHTML(band, margin, vars, title, language())
      .replace(/<span class="pageNumber"><\/span>/g, String(page))
      .replace(/<span class="totalPages"><\/span>/g, String(this.pages))
      .replace(/<span class="date"><\/span>/g, new Date().toLocaleDateString())
      .replace(/<span class="url"><\/span>/g, "");

    // Parsed rather than assigned to innerHTML. bandHTML() escapes the values
    // it interpolates, but "it is safe because I wrote it" is exactly the
    // assumption the rule exists to stop, and parsing says so explicitly.
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const el = sheet.createDiv({ cls: `pressmark-band is-${which}` });
    for (const node of Array.from(parsed.body.childNodes)) {
      el.appendChild(document.importNode(node, true));
    }
  }

  private factor(): number {
    if (this.zoom !== "fit") return this.zoom;
    const available = this.canvas.clientWidth;
    if (!available || !this.lastWidthPx) return 1;
    // Room for the scrollbar, so fitting does not itself cause one.
    return clamp((available - 28) / this.lastWidthPx);
  }

  private applyScale(): void {
    if (!this.lastWidthPx) return;
    const f = this.factor();
    this.sheets.setCssProps({ transform: `scale(${f})`, "--pm-scale": String(f) });
    this.stage.setCssProps({
      width: `${this.lastWidthPx * f}px`,
      height: `${this.sheets.scrollHeight * f}px`,
      "--pm-scale": String(f),
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

function clamp(f: number): number {
  return Math.max(0.1, Math.min(3, f));
}

/** A margin as inches, tolerating a missing or malformed value. */
function inchesOf(v: string | undefined): number {
  try {
    return toInches(v);
  } catch {
    return 0;
  }
}
