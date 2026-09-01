/**
 * Export modal: pick a format, adjust it, and SEE it before generating.
 *
 * The preview isn't an approximation of the export: it IS the export. The same
 * printToPDF call runs, and Chromium's own viewer shows the result, so the
 * cover page, the palette, a wide table overflowing and the real page count are
 * all visible BEFORE the file gets written.
 *
 * Switching formats does not re-render the markdown — that body is rendered
 * once and handed in — but it does reprint, because page breaks are decided by
 * the print, not by the markdown.
 */
import { App, Modal, Notice, Setting, type TFile } from "obsidian";
import type { Resolved, Page } from "./theme";
import { Preview, type PdfMaker } from "./preview";
import { t } from "./i18n";

export interface ExportOptions {
  theme: string;
  size: string; // "" = the theme's own
  orientation: "" | "portrait" | "landscape";
  margin: string; // mm; "" = the theme's own
  cover: boolean | null; // null = the theme's own
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
  makePdf: PdfMaker;
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
  private preview!: Preview;
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
    const previewPane = cols.createDiv({ cls: "pressmark-view" });

    this.preview = new Preview(previewPane, this.a.makePdf);

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
      .setName(t("modal.openWhenDone"))
      .addToggle((c) => c.setValue(this.o.open).onChange((v) => (this.o.open = v)));
  }

  private async refresh(): Promise<void> {
    let theme: Resolved;
    try {
      theme = applyOptions(await this.a.loadTheme(this.o.theme), this.o);
      this.theme = theme;
    } catch (e) {
      this.preview.infoEl.setText(t("modal.formatError", { e: String(e) }));
      return;
    }

    // The drawing itself belongs to Preview, shared with the theme designer:
    // two renderers would drift, and a preview that stops matching the export
    // is worse than none.
    this.preview.render(theme, this.a.title, this.a.bodyHTML);

    if (this.o.margin && !MARGIN_RE.test(this.o.margin)) {
      new Notice(t("modal.marginInvalid"));
    }
  }

  override onClose(): void {
    this.preview.destroy();
    this.contentEl.empty();
  }
}
