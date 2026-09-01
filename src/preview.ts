/**
 * The live document preview.
 *
 * It shows the **actual PDF**, produced by the same `printToPDF` call the
 * export uses, drawn page by page with pdf.js.
 *
 * The previous version simulated pages: it measured the document as one
 * continuous flow and sliced it every page height. That could not work, and
 * the reason is worth keeping. A continuous flow knows nothing about
 * `page-break-inside: avoid`, orphans and widows, or a forced cover break —
 * all of which move whole blocks between pages. The estimate was wrong in both
 * directions: 3 pages where the PDF had 4, and 27 where it had 16.
 *
 * A preview that disagrees with the export is worse than no preview, so the
 * fix was not a better estimate. It was to stop estimating.
 */
import { captionFor } from "./caption";
import { looksLikePdf } from "./pdf-info";
import { closePdf, openPdf, type PdfDocument } from "./pdfjs";
import type { Resolved } from "./theme";
import { t } from "./i18n";

/** Produces the PDF bytes for a theme and an already-rendered body. */
export type PdfMaker = (theme: Resolved, title: string, bodyHTML: string) => Promise<Uint8Array>;

/** "fit" tracks the pane's width; a number is a literal scale factor. */
export type Zoom = "fit" | number;

/**
 * How long to wait before printing again.
 *
 * Every render is a real print, so it is not free. Dragging a colour picker
 * fires continuously; this prints once the hand stops.
 */
const DEBOUNCE_MS = 350;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

/** Gap between sheets, and the padding around them, in CSS pixels. */
const GUTTER = 22;

export class Preview {
  private scroller: HTMLElement;
  private info: HTMLElement;

  private doc: PdfDocument | null = null;
  private zoom: Zoom = "fit";
  /** One placeholder per page, in order; each gets a canvas when it comes near. */
  private slots: HTMLElement[] = [];
  private seen: IntersectionObserver | null = null;

  private timer: number | null = null;
  /** Bumped per print, so a slow render started earlier can never win. */
  private generation = 0;

  constructor(
    parent: HTMLElement,
    private make: PdfMaker,
  ) {
    this.scroller = parent.createDiv({ cls: "pressmark-pdf" });
    this.info = parent.createDiv({ cls: "pressmark-info" });
  }

  get infoEl(): HTMLElement {
    return this.info;
  }

  /** Schedules a print. Repeated calls collapse into one. */
  render(theme: Resolved, title: string, bodyHTML: string): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.info.setText(t("preview.rendering"));
    this.timer = window.setTimeout(() => {
      void this.print(theme, title, bodyHTML);
    }, DEBOUNCE_MS);
  }

  private async print(theme: Resolved, title: string, bodyHTML: string): Promise<void> {
    const mine = ++this.generation;
    try {
      const bytes = await this.make(theme, title, bodyHTML);
      if (mine !== this.generation) return;

      if (!looksLikePdf(bytes)) {
        this.fail(t("preview.notAPdf"));
        return;
      }

      const doc = await openPdf(bytes);
      if (mine !== this.generation) {
        void closePdf(doc);
        return;
      }

      if (this.doc) void closePdf(this.doc);
      this.doc = doc;
      // The count comes from the document itself, not from arithmetic.
      this.info.setText(captionFor(theme, doc.numPages));
      this.layout();
    } catch (e) {
      if (mine !== this.generation) return;
      console.error("pressmark:", e);
      this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  private fail(reason: string): void {
    this.scroller.empty();
    this.slots = [];
    this.info.setText(t("preview.error", { e: reason }));
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  /**
   * Builds one correctly-sized placeholder per page and lets the observer fill
   * them in as they come into view.
   *
   * Sizing the placeholders up front rather than growing them as pages arrive
   * is what keeps the scrollbar from jumping under the user's hand, and it is
   * cheap: page dimensions come from the PDF without rasterising anything.
   */
  private layout(): void {
    const doc = this.doc;
    if (!doc) return;

    this.seen?.disconnect();
    this.scroller.empty();
    this.slots = [];

    const mine = this.generation;
    this.seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          this.seen?.unobserve(el);
          void this.paint(el, this.slots.indexOf(el) + 1, mine);
        }
      },
      // A screenful of lead time: by the time a page is scrolled to, it is drawn.
      { root: this.scroller, rootMargin: "100% 0px" },
    );

    void this.size(doc, mine);
  }

  /** Measures every page and creates its placeholder at the right size. */
  private async size(doc: PdfDocument, mine: number): Promise<void> {
    const scale = await this.scaleFor(doc);
    if (mine !== this.generation) return;

    for (let n = 1; n <= doc.numPages; n++) {
      const { width, height } = (await doc.getPage(n)).getViewport({ scale });
      if (mine !== this.generation) return;

      const slot = this.scroller.createDiv({ cls: "pressmark-sheet" });
      slot.setCssStyles({ width: `${Math.round(width)}px`, height: `${Math.round(height)}px` });
      this.slots.push(slot);
      this.seen?.observe(slot);
    }
  }

  /**
   * The scale to draw at.
   *
   * "fit" is measured off the first page rather than assumed: a landscape or
   * A3 theme has a different aspect, and a fixed guess would either overflow
   * the pane or leave half of it empty.
   */
  private async scaleFor(doc: PdfDocument): Promise<number> {
    if (this.zoom !== "fit") return this.zoom;
    const natural = (await doc.getPage(1)).getViewport({ scale: 1 }).width;
    const available = this.scroller.clientWidth - GUTTER * 2;
    if (available <= 0 || natural <= 0) return 1;
    return available / natural;
  }

  /** Rasterises one page into its placeholder. */
  private async paint(slot: HTMLElement, pageNumber: number, mine: number): Promise<void> {
    const doc = this.doc;
    if (!doc || mine !== this.generation || pageNumber < 1) return;

    const page = await doc.getPage(pageNumber);
    if (mine !== this.generation) return;

    const viewport = page.getViewport({ scale: await this.scaleFor(doc) });
    // Drawn at device resolution and scaled back down by CSS: on a HiDPI screen
    // a canvas sized in CSS pixels renders the text visibly soft.
    const dpr = window.devicePixelRatio || 1;
    const canvas = slot.createEl("canvas");
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.setCssStyles({ width: `${Math.round(viewport.width)}px`, height: "auto" });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvas, canvasContext: ctx, viewport, transform: [dpr, 0, 0, dpr, 0, 0] })
      .promise;
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────

  setZoom(z: Zoom): void {
    this.zoom = z === "fit" ? "fit" : clamp(z);
    // Re-laid out rather than CSS-scaled: scaling a bitmap up is exactly the
    // blur the user would be zooming in to get rid of.
    this.layout();
  }

  currentZoom(): Zoom {
    return this.zoom;
  }

  /**
   * Alt + wheel zooms.
   *
   * Alt and not Ctrl: Ctrl + wheel is the whole app's zoom in Obsidian, and
   * stealing it inside one pane would surprise anyone who uses it elsewhere.
   * `onChange` reports the factor back so the dropdown can show the real
   * percentage instead of blanking on a value no preset matches.
   */
  enableWheelZoom(onChange: (factor: number) => void): void {
    this.scroller.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (!e.altKey) return;
        e.preventDefault();
        const from = this.zoom === "fit" ? this.fitFactor() : this.zoom;
        const next = clamp(from * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        this.setZoom(next);
        onChange(next);
      },
      { passive: false },
    );
  }

  /** The factor "fit" currently resolves to, so wheel zoom starts from what is on screen. */
  private fitFactor(): number {
    const drawn = this.slots[0]?.clientWidth ?? 0;
    const available = this.scroller.clientWidth - GUTTER * 2;
    return drawn > 0 && available > 0 ? drawn / available : 1;
  }

  /** A preview that outlives its view would hold the whole document open. */
  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.generation++;
    this.seen?.disconnect();
    this.seen = null;
    if (this.doc) void closePdf(this.doc);
    this.doc = null;
    this.slots = [];
  }
}

function clamp(f: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, f));
}
