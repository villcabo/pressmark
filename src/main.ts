/**
 * pressmark — exports notes to PDF using portable theme packs.
 *
 * The layout engine is Chromium, same as in the CLI. What's different is who
 * drives it: here it's the Electron that Obsidian already ships with. What
 * does NOT change is the theme pack, and that's why the same pack gives the
 * same PDF on both sides.
 */
import {
  Component,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from "obsidian";
import { load, type Resolved, type ThemeFS } from "./theme";
import { embeddedFS, overlay, vaultFS, USER_THEMES_SUBFOLDER } from "./sources";
import {
  bandHTML,
  documentHTML,
  mergeVars,
  renderBody,
  splitFrontmatter,
  titleFor,
} from "./render";
import { bytesOf, generate, printOptionsFor } from "./pdf";
import { applyOptions, ExportModal, type ExportOptions } from "./export-modal";
import { SettingsTab } from "./settings";
import { DEFAULT_SETTINGS, type Settings } from "./config";
import { migrateSettings } from "./migrate";
import { initLanguage, language, t } from "./i18n";

export default class PressmarkPlugin extends Plugin {
  override settings: Settings = { ...DEFAULT_SETTINGS };
  private packs!: ThemeFS;
  /** Frontmatter of the note open in the modal, for {{fm.field}} in the bands. */
  private fm: Record<string, string> | null = null;

  /**
   * The selected theme, already resolved and with overrides applied.
   *
   * getSettingDefinitions() has to answer synchronously, and resolving a theme
   * reads files. So it is cached here and refreshed whenever the selection or
   * an override changes.
   */
  activeTheme: Resolved | null = null;

  /** Selectable theme ids, for the settings dropdown. */
  themeIds: string[] = [];

  override async onload(): Promise<void> {
    // Resolved once: the UI and the theme packs HAVE to use the SAME
    // language, or the modal comes out in one and the PDF footer in another.
    initLanguage();
    await this.loadSettings();
    // The user's own packs win; the embedded ones are the floor.
    // Inheritance crosses both layers: a user's own theme extends _base,
    // which ships inside the plugin.
    this.packs = overlay(vaultFS(this.app.vault), embeddedFS());

    this.themeIds = await this.availableThemes();
    await this.refreshActiveTheme();
    this.addSettingTab(new SettingsTab(this.app, this));

    this.addRibbonIcon("file-output", t("ribbon"), () => {
      void this.exportActive();
    });

    this.addCommand({
      id: "export-pdf",
      name: t("cmd.export"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) void this.exportActive();
        return true;
      },
    });

    // For whoever already knows what they want and doesn't need to see the
    // modal every time.
    this.addCommand({
      id: "export-pdf-quick",
      name: t("cmd.exportQuick"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) void this.export(f, this.savedOptions());
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((i) =>
          i
            .setTitle(t("menu.export"))
            .setIcon("file-output")
            .onClick(() => void this.openModal(file)),
        );
      }),
    );
  }

  async loadSettings(): Promise<void> {
    // loadData() is typed `any`: whatever is on disk was written by an older
    // version, so it gets narrowed here and repaired by migrateSettings.
    const stored = (await this.loadData()) as Partial<Settings> | null;
    this.settings = migrateSettings({ ...DEFAULT_SETTINGS, ...(stored ?? {}) });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Reloads the cached theme. Cheap: the packs are embedded or in the vault. */
  async refreshActiveTheme(): Promise<void> {
    try {
      this.activeTheme = await this.loadTheme(this.settings.theme);
    } catch {
      // A theme that no longer exists must not break the settings tab; the
      // dropdown still lets the user pick a working one.
      this.activeTheme = null;
    }
  }

  async availableThemes(): Promise<string[]> {
    const ids = (await this.packs.list?.()) ?? [];
    return ids.filter((i) => !i.startsWith("_")).sort();
  }

  /**
   * Loads the theme and applies the user's overrides to it.
   *
   * Overrides override tokens and vars, never the CSS: that's why
   * customizing doesn't break the theme pack and you can always go back to
   * the original.
   *
   * A var override replaces the localized value with a plain string, and
   * that's the right call: if the user wrote their own text, that text is
   * what they want to see, not a translation.
   *
   * Final precedence of a var's value, highest to lowest:
   *   the note's frontmatter  >  this override  >  the theme pack
   */
  async loadTheme(id: string): Promise<Resolved> {
    const t = await load(this.packs, id);

    const ot = this.settings.overrides[id];
    if (ot && Object.keys(ot).length > 0) {
      t.tokens = { ...(t.tokens ?? {}), ...ot };
    }
    const ov = this.settings.overridesVars[id];
    if (ov && Object.keys(ov).length > 0) {
      t.vars = { ...(t.vars ?? {}), ...ov };
    }
    return t;
  }

  private async exportActive(): Promise<void> {
    const f = this.app.workspace.getActiveFile();
    if (!f || f.extension !== "md") {
      new Notice(t("notice.openNote"));
      return;
    }
    await this.openModal(f);
  }

  private savedOptions(): ExportOptions {
    return {
      theme: this.settings.theme,
      size: "",
      orientation: "",
      margin: "",
      cover: null,
      folder: this.settings.outputFolder,
      open: this.settings.openWhenDone,
    };
  }

  /**
   * Opens the export modal.
   *
   * The body is rendered ONCE and handed to the modal already built:
   * switching formats there just rewraps that same HTML with different CSS.
   * Asking Obsidian's renderer to redo the markdown on every change would
   * make the preview feel slow for no reason.
   */
  async openModal(file: TFile): Promise<void> {
    const comp = new Component();
    comp.load();
    try {
      const raw = await this.app.vault.cachedRead(file);
      const { fields, body: body } = splitFrontmatter(raw);
      const title = titleFor(fields, body, file.basename);
      const bodyHTML = await renderBody(this.app, body, file.path, comp);
      this.fm = fields;

      new ExportModal({
        app: this.app,
        file,
        title,
        bodyHTML,
        themes: await this.availableThemes(),
        initial: this.savedOptions(),
        loadTheme: (id) => this.loadTheme(id),
        onExport: (o) => {
          // Whatever gets chosen becomes the next default: nobody wants to
          // re-pick the format on every export.
          this.settings.theme = o.theme;
          this.settings.outputFolder = o.folder;
          this.settings.openWhenDone = o.open;
          void this.saveSettings();
          void this.export(file, o, bodyHTML, title);
        },
      }).open();
    } catch (e) {
      console.error("pressmark:", e);
      new Notice(t("notice.previewError", { e: e instanceof Error ? e.message : String(e) }));
    } finally {
      comp.unload();
    }
  }

  async export(
    file: TFile,
    o: ExportOptions,
    prerenderedBody?: string,
    prerenderedTitle?: string,
  ): Promise<void> {
    const notice = new Notice(t("notice.exporting", { n: file.basename }), 0);
    // A dedicated Component so the child components created by Obsidian's
    // renderer get unloaded even if the export fails.
    const comp = new Component();
    comp.load();

    try {
      const theme = applyOptions(await this.loadTheme(o.theme), o);

      let title = prerenderedTitle;
      let body = prerenderedBody;
      let fm = this.fm;
      if (body === undefined || title === undefined) {
        const raw = await this.app.vault.cachedRead(file);
        const sep = splitFrontmatter(raw);
        fm = sep.fields;
        title = titleFor(sep.fields, sep.body, file.basename);
        body = await renderBody(this.app, sep.body, file.path, comp);
      }
      const html = documentHTML(title, body, theme);

      const m = theme.page?.margin;
      const vars = mergeVars(theme.vars, fm, language());
      const opts = printOptionsFor(
        theme,
        bandHTML(theme.header, m, vars, title, language()),
        bandHTML(theme.footer, m, vars, title, language()),
      );

      const pdf = await generate(html, opts, this.app.vault);
      const destination = this.outputPath(file, o.folder);
      await this.app.vault.adapter.writeBinary(destination, bytesOf(pdf));

      notice.hide();
      new Notice(`✓ ${destination}`);
      if (o.open) {
        void this.app.workspace.openLinkText(destination, "", false);
      }
    } catch (e) {
      notice.hide();
      console.error("pressmark:", e);
      new Notice(t("notice.exportError", { e: e instanceof Error ? e.message : String(e) }));
    } finally {
      comp.unload();
    }
  }

  private outputPath(file: TFile, chosenFolder: string): string {
    const name = `${file.basename}.pdf`;
    const folder = chosenFolder || file.parent?.path || "";
    return normalizePath(folder ? `${folder}/${name}` : name);
  }
}

export { USER_THEMES_SUBFOLDER };
