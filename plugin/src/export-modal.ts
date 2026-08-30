/**
 * Export modal: pick a format, adjust it, and SEE it before generating.
 *
 * The preview isn't decorative. It renders the document with the theme's
 * actual CSS and at the paper's real proportions, so the cover page, the
 * palette and wide tables overflowing are visible BEFORE the file gets
 * written. Switching themes doesn't re-render the markdown: it just
 * rewraps the already-rendered body with different CSS, which is instant.
 */
import { App, Modal, Notice, Setting, type TFile } from "obsidian";
import type { Resolved, Page } from "./theme";
import { documentHTML } from "./render";
import { paperSize } from "./paper";
import { t } from "./i18n";

export interface ExportOptions {
  theme: string;
  size: string; // "" = the theme's own
  orientation: "" | "portrait" | "landscape";
  margin: string; // mm; "" = the theme's own
  cover: boolean | null; // null = the theme's own
  folder: string;
  open: boolean;
}

interface Args {
  app: App;
  file: TFile;
  title: string;
  bodyHTML: string;
  themes: string[];
  initial: ExportOptions;
  loadTheme: (id: string) => Promise<Resolved>;
  onExport: (o: ExportOptions) => void;
}

/**
 * Applies what was chosen in the modal onto the theme, without touching the
 * pack on disk.
 *
 * Used by both the modal (for the preview) and the export (for the PDF). It
 * has to be the SAME function: if the preview and the file applied the
 * options through different paths, the preview would stop being a promise.
 */
export function applyOptions(theme: Resolved, o: ExportOptions): Resolved {
  const page: Page = { ...(theme.page ?? {}) };
  if (o.size) page.size = o.size;
  if (o.orientation) page.orientation = o.orientation;
  if (o.margin && MARGIN_RE.test(o.margin)) {
    const m = `${o.margin}mm`;
    page.margin = { top: m, right: m, bottom: m, left: m };
  }
  const cover = o.cover === null ? theme.cover : { ...theme.cover, enabled: o.cover };
  return { ...theme, page, cover };
}

/** A number in mm, and nothing else. */
export const MARGIN_RE = /^\d+(\.\d+)?$/;

export class ExportModal extends Modal {
  private o: ExportOptions;
  private previewEl!: HTMLIFrameElement;
  private canvasEl!: HTMLElement;
  private scaleEl!: HTMLElement;
  private breaksEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private theme?: Resolved;

  constructor(private a: Args) {
    super(a.app);
    this.o = { ...a.initial };
  }

  override onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("pressmark-modal");
    contentEl.empty();

    contentEl.createEl("h2", { text: t("modal.title") });
    contentEl.createEl("p", {
      text: this.a.file.path,
      cls: "pressmark-ruta",
    });

    const cols = contentEl.createDiv({ cls: "pressmark-cols" });
    const form = cols.createDiv({ cls: "pressmark-form" });
    const previewPane = cols.createDiv({ cls: "pressmark-vista" });

    // The iframe is drawn at the paper's REAL width and scaled down after. If
    // it were left at the panel's width, the document would lay out at a
    // different column width: lines would wrap differently and the preview
    // would lie.
    this.canvasEl = previewPane.createDiv({ cls: "pressmark-lienzo" });
    this.scaleEl = this.canvasEl.createDiv({ cls: "pressmark-escala" });
    this.previewEl = this.scaleEl.createEl("iframe", { cls: "pressmark-preview" });
    this.previewEl.setAttr("sandbox", "allow-same-origin");
    this.breaksEl = this.scaleEl.createDiv({ cls: "pressmark-cortes" });
    this.infoEl = previewPane.createDiv({ cls: "pressmark-info" });

    this.buildForm(form);

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t("modal.cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modal.export"))
          .setCta()
          .onClick(() => {
            this.close();
            this.a.onExport(this.o);
          }),
      );

    void this.refresh();
  }

  private buildForm(c: HTMLElement): void {
    new Setting(c)
      .setName(t("modal.format"))
      .setDesc(t("modal.formatDesc"))
      .addDropdown((d) => {
        for (const id of this.a.themes) d.addOption(id, id);
        d.setValue(this.o.theme).onChange((v) => {
          this.o.theme = v;
          void this.refresh();
        });
      });

    new Setting(c).setName(t("modal.paperSize")).addDropdown((d) => {
      d.addOption("", t("modal.fromFormat"));
      for (const s of ["A4", "Letter", "Legal", "A5", "A3", "Tabloid"]) d.addOption(s, s);
      d.setValue(this.o.size).onChange((v) => {
        this.o.size = v;
        void this.refresh();
      });
    });

    new Setting(c).setName(t("modal.orientation")).addDropdown((d) => {
      d.addOption("", t("modal.fromFormat"));
      d.addOption("portrait", t("modal.portrait"));
      d.addOption("landscape", t("modal.landscape"));
      d.setValue(this.o.orientation).onChange((v) => {
        this.o.orientation = v as ExportOptions["orientation"];
        void this.refresh();
      });
    });

    new Setting(c)
      .setName(t("modal.margin"))
      .setDesc(t("modal.marginDesc"))
      .addText((c) =>
        c
          .setPlaceholder(t("modal.marginPlaceholder"))
          .setValue(this.o.margin)
          .onChange((v) => {
            this.o.margin = v.trim();
            void this.refresh();
          }),
      );

    new Setting(c)
      .setName(t("modal.cover"))
      .setDesc(t("modal.coverDesc"))
      .addDropdown((d) => {
        d.addOption("", t("modal.fromFormat"));
        d.addOption("yes", t("modal.withCover"));
        d.addOption("no", t("modal.withoutCover"));
        d.setValue(this.o.cover === null ? "" : this.o.cover ? "yes" : "no");
        d.onChange((v) => {
          this.o.cover = v === "" ? null : v === "yes";
          void this.refresh();
        });
      });

    new Setting(c)
      .setName(t("modal.outputFolder"))
      .setDesc(t("modal.outputFolderDesc"))
      .addText((c) =>
        c
          .setPlaceholder(t("modal.outputFolderPlaceholder"))
          .setValue(this.o.folder)
          .onChange((v) => (this.o.folder = v.trim())),
      );

    new Setting(c)
      .setName(t("modal.openWhenDone"))
      .addToggle((c) => c.setValue(this.o.open).onChange((v) => (this.o.open = v)));
  }

  private async refresh(): Promise<void> {
    try {
      const base = await this.a.loadTheme(this.o.theme);
      this.theme = applyOptions(base, this.o);
    } catch (e) {
      this.infoEl.setText(t("modal.formatError", { e: String(e) }));
      return;
    }
    const theme = this.theme;

    let w = 8.27,
      h = 11.69;
    try {
      [w, h] = paperSize(theme.page);
    } catch {
      /* reported further below */
    }
    if (theme.page?.orientation === "landscape") [w, h] = [h, w];

    // 96 CSS px per inch: the unit Chromium lays out in.
    const widthPx = w * 96;
    const heightPx = h * 96;

    this.previewEl.style.width = `${widthPx}px`;
    this.previewEl.srcdoc = documentHTML(this.a.title, this.a.bodyHTML, theme, true);

    this.previewEl.onload = () => {
      const doc = this.previewEl.contentDocument;
      if (!doc) return;
      // Real document height, rounded up to whole pages: so the last page
      // shows complete and isn't cut in half.
      const height = Math.max(doc.body.scrollHeight, heightPx);
      const pages = Math.max(1, Math.ceil(height / heightPx));
      const totalHeight = pages * heightPx;

      this.previewEl.style.height = `${totalHeight}px`;
      this.scaleEl.style.width = `${widthPx}px`;
      this.scaleEl.style.height = `${totalHeight}px`;

      // Lines where Chromium is going to break the page. It's approximate —
      // the real break depends on break-inside — but it's enough to see
      // whether a heading or a wide table ends up straddling two pages.
      this.breaksEl.empty();
      for (let i = 1; i < pages; i++) {
        const line = this.breaksEl.createDiv({ cls: "pressmark-corte" });
        line.style.top = `${i * heightPx}px`;
        line.createSpan({ text: t("modal.page", { n: i + 1 }) });
      }

      this.fitScale(widthPx);
      this.updateInfo(theme, pages);
    };

    if (this.o.margin && !MARGIN_RE.test(this.o.margin)) {
      new Notice(t("modal.marginInvalid"));
    }
  }

  /** Scales the canvas so the page fits the panel's width. */
  private fitScale(widthPx: number): void {
    const available = this.canvasEl.clientWidth;
    if (!available) return;
    const f = Math.min(1, available / widthPx);
    this.scaleEl.style.transform = `scale(${f})`;
    // The page-break marks live inside the scaled element, so they'd shrink
    // along with it. They're counter-scaled with this variable so they stay
    // legible at any zoom.
    this.scaleEl.style.setProperty("--pm-escala", String(f));
    // The container has to reserve the height ALREADY SCALED, otherwise the
    // scrollbar ends up as long as the unscaled document.
    this.canvasEl.style.height = `${Math.min(520, this.scaleEl.offsetHeight * f)}px`;
  }

  private updateInfo(theme: Resolved, pages: number): void {
    const m = theme.page?.margin;
    const size = typeof theme.page?.size === "string" ? theme.page.size : t("info.custom");
    const orient = theme.page?.orientation === "landscape" ? t("info.landscape") : t("info.portrait");
    this.infoEl.setText(
      [
        size,
        orient,
        `${t("info.margins")} ${m?.top ?? "?"} ${m?.right ?? "?"} ${m?.bottom ?? "?"} ${m?.left ?? "?"}`,
        theme.cover?.enabled ? t("info.withCover") : t("info.withoutCover"),
        ...(theme.footer?.enabled ? [t("info.withFooter")] : []),
        t("info.pages", { n: pages }),
      ].join(" · "),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
