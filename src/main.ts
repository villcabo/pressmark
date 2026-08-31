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
  FileSystemAdapter,
  normalizePath,
} from "obsidian";
import { load, type Resolved, type ThemeFS } from "./theme";
import { embeddedFS, overlay, vaultFS, userThemesFolder, USER_THEMES_SUBFOLDER } from "./sources";
import {
  bandHTML,
  documentHTML,
  mergeVars,
  renderBody,
  splitFrontmatter,
  titleFor,
} from "./render";
import { askWhereToSave, generate, printOptionsFor, writePdf } from "./pdf";
import { applyOptions, ExportModal, type ExportOptions } from "./export-modal";
import { SettingsTab } from "./settings";
import { NameModal } from "./name-modal";
import { buildThemePack, starterCSS } from "./pack";
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

    this.addCommand({
      id: "save-as-format",
      name: t("cmd.saveAsFormat"),
      callback: () => this.promptSaveAsFormat(),
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

  /**
   * Asks for a name and turns the current overrides into a theme pack.
   *
   * This is what makes a customization worth doing: an override lives in one
   * person's data.json, a pack is a folder that can be committed and copied.
   */
  promptSaveAsFormat(): void {
    const base = this.settings.theme;
    const tokens = this.settings.overrides[base] ?? {};
    const vars = this.settings.overridesVars[base] ?? {};

    if (Object.keys(tokens).length === 0 && Object.keys(vars).length === 0) {
      new Notice(t("pack.nothingToSave"));
      return;
    }

    new NameModal(this.app, {
      title: t("pack.title"),
      placeholder: t("pack.placeholder"),
      taken: (id) => this.themeIds.includes(id),
      onSubmit: (name) => void this.saveAsFormat(name, base, tokens, vars),
    }).open();
  }

  private async saveAsFormat(
    name: string,
    base: string,
    tokens: Record<string, string>,
    vars: Record<string, string>,
  ): Promise<void> {
    try {
      const { id, json } = buildThemePack({ name, base, tokens, vars });
      const dir = normalizePath(`${userThemesFolder(this.app.vault)}/${id}`);
      const adapter = this.app.vault.adapter;

      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(
        normalizePath(`${dir}/theme.json`),
        JSON.stringify(json, null, 2) + "\n",
      );
      await adapter.write(normalizePath(`${dir}/theme.css`), starterCSS(name, base));

      // The overrides became the pack: leaving them behind would apply the same
      // changes twice, once in the pack and once on top of it.
      delete this.settings.overrides[base];
      delete this.settings.overridesVars[base];
      this.settings.theme = id;
      await this.saveSettings();

      this.themeIds = await this.availableThemes();
      await this.refreshActiveTheme();
      new Notice(t("pack.saved", { name }));
    } catch (e) {
      console.error("pressmark:", e);
      new Notice(t("pack.saveError", { e: e instanceof Error ? e.message : String(e) }));
    }
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

      // Asked before rendering would leave the user staring at a dialog with
      // nothing behind it; asked after, the document is ready the moment they
      // pick a name.
      const destination = await askWhereToSave(title, this.startDirectory(file));
      if (destination === null) {
        notice.hide();
        return; // cancelled: no file, no notice, nothing half-written
      }

      const pdf = await generate(html, opts, this.app.vault);
      // The Uint8Array goes straight in: fs.writeFile honours byteOffset and
      // byteLength, so a Node Buffer that is a view into a larger shared pool
      // still writes only its own bytes. It is `.buffer` that would hand over
      // the whole pool — the bug that used to need bytesOf() to work around.
      await writePdf(destination, pdf);

      this.settings.lastDirectory = destination.slice(0, destination.lastIndexOf("/"));
      void this.saveSettings();

      notice.hide();
      new Notice(`✓ ${destination}`);
      if (o.open) {
        void this.openExported(destination);
      }
    } catch (e) {
      notice.hide();
      console.error("pressmark:", e);
      new Notice(t("notice.exportError", { e: e instanceof Error ? e.message : String(e) }));
    } finally {
      comp.unload();
    }
  }

  /**
   * Where the save dialog opens.
   *
   * The last place the user saved to, falling back to the note's own folder
   * inside the vault: both are better guesses than the home directory.
   */
  private startDirectory(file: TFile): string {
    if (this.settings.lastDirectory) return this.settings.lastDirectory;
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      const parent = file.parent?.path ?? "";
      return adapter.getFullPath(normalizePath(parent));
    }
    return "";
  }

  /** Hands the file to the system, since it may well be outside the vault. */
  private async openExported(path: string): Promise<void> {
    try {
      const electron = (activeWindow as unknown as { require?: (m: string) => unknown }).require;
      const shell = (electron?.("electron") as { shell?: { openPath(p: string): Promise<string> } })
        ?.shell;
      if (shell) await shell.openPath(path);
    } catch {
      // Opening is a convenience; failing to do it must not look like the
      // export itself failed.
    }
  }
}

export { USER_THEMES_SUBFOLDER };
