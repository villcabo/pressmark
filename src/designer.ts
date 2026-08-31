/**
 * Theme designer.
 *
 * A workspace, not a settings pane: controls on one side, the document on the
 * other, updating as a colour is dragged. Settings is a list of fields and a
 * page judged in a narrow column is not judged at all.
 *
 * The controls are generated from the same tokenSchema / varSchema the settings
 * tab uses. One generator, two surfaces — a second one would drift.
 */
import { ItemView, Setting, type WorkspaceLeaf } from "obsidian";
import type PressmarkPlugin from "./main";
import type { Resolved, TokenDef } from "./theme";
import { Preview } from "./preview";
import { renderBody } from "./render";
import { titleFor, splitFrontmatter } from "./document";
import { SAMPLES } from "./themes.generated";
import { resolve } from "./locale";
import { t, language } from "./i18n";

export const DESIGNER_VIEW = "pressmark-designer";

const ZOOM_PRESETS = ["0.5", "0.75", "1", "1.5", "2"];

const GROUP_ORDER = ["footer", "palette", "typography", "cover", "other"];

/** The bundled samples, in the order they are declared. */
export function sampleIds(): string[] {
  return Object.keys(SAMPLES);
}

export class DesignerView extends ItemView {
  private preview!: Preview;
  private controlsEl!: HTMLElement;
  private theme: Resolved | null = null;
  private source = "01-report";
  private bodyHTML = "";
  private title = "";
  private zoomSel!: HTMLSelectElement;
  private customOpt?: HTMLOptionElement;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: PressmarkPlugin,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return DESIGNER_VIEW;
  }

  override getDisplayText(): string {
    return t("designer.title");
  }

  override getIcon(): string {
    return "palette";
  }

  override async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("pressmark-designer");

    const cols = root.createDiv({ cls: "pressmark-designer-cols" });
    this.controlsEl = cols.createDiv({ cls: "pressmark-designer-controls" });

    const right = cols.createDiv({ cls: "pressmark-designer-preview" });
    this.buildPreviewHeader(right);
    this.preview = new Preview(right);
    // Alt + wheel keeps the dropdown honest about the factor in use. The wheel
    // lands on values no preset matches, so rather than blanking the control it
    // grows an option showing the real percentage.
    this.preview.enableWheelZoom((f) => this.showZoom(f));

    await this.reload();
  }

  private buildPreviewHeader(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "pressmark-bar" });

    // Built by hand rather than with Setting: a Setting stretches to the full
    // width, which is what left a desert between each label and its control.
    const field = (labelText: string): HTMLElement => {
      const wrap = bar.createDiv({ cls: "pressmark-field" });
      wrap.createSpan({ cls: "pressmark-field-label", text: labelText });
      return wrap;
    };

    const docSel = field(t("designer.document")).createEl("select", { cls: "dropdown" });
    for (const id of sampleIds()) {
      docSel.createEl("option", { value: id, text: t(`sample.${id}` as never) });
    }
    docSel.createEl("option", { value: "__active", text: t("designer.activeNote") });
    docSel.value = this.source;
    docSel.addEventListener("change", () => {
      this.source = docSel.value;
      void this.reload();
    });

    this.zoomSel = field(t("designer.zoom")).createEl("select", { cls: "dropdown" });
    this.zoomSel.createEl("option", { value: "fit", text: t("designer.zoomFit") });
    for (const z of ZOOM_PRESETS) {
      this.zoomSel.createEl("option", { value: z, text: `${Math.round(Number(z) * 100)}%` });
    }
    this.zoomSel.addEventListener("change", () => {
      const v = this.zoomSel.value;
      this.preview.setZoom(v === "fit" ? "fit" : Number(v));
    });

    bar.createDiv({ cls: "pressmark-bar-spacer" });
    bar.createSpan({ cls: "pressmark-hint", text: t("designer.zoomHint") });

  }

  /** Reflects an arbitrary zoom factor in the dropdown. */
  private showZoom(f: number): void {
    const pct = `${Math.round(f * 100)}%`;
    const preset = ZOOM_PRESETS.find((z) => Math.abs(Number(z) - f) < 0.005);
    if (preset) {
      this.customOpt?.remove();
      this.customOpt = undefined;
      this.zoomSel.value = preset;
      return;
    }
    if (!this.customOpt) {
      this.customOpt = this.zoomSel.createEl("option", { value: "__custom" });
    }
    this.customOpt.value = "__custom";
    this.customOpt.setText(pct);
    this.zoomSel.value = "__custom";
  }

  /** Re-renders the source document, then redraws everything. */
  async reload(): Promise<void> {
    const markdown = await this.sourceMarkdown();
    const { fields, body } = splitFrontmatter(markdown);
    this.title = titleFor(fields, body, t("designer.untitled"));

    // The same renderer the export uses. A second copy here is exactly what
    // left the designer out of the diagram fix.
    this.bodyHTML = await renderBody(this.app, body, "", this);

    this.theme = this.plugin.activeTheme;
    this.buildControls();
    this.redraw();
  }

  private async sourceMarkdown(): Promise<string> {
    if (this.source === "__active") {
      const f = this.app.workspace.getActiveFile();
      if (f && f.extension === "md") return this.app.vault.cachedRead(f);
      return t("designer.noActiveNote");
    }
    return SAMPLES[this.source] ?? "";
  }

  private redraw(): void {
    if (!this.theme) return;
    // Always fill: in a designer the page is the point, and a preview boxed
    // into a fixed height with empty space under it helps nobody.
    this.preview.render(this.theme, this.title, this.bodyHTML, { fill: true });
  }

  private buildControls(): void {
    const c = this.controlsEl;
    c.empty();
    const theme = this.theme;

    new Setting(c).setName(t("designer.basedOn")).addDropdown((d) => {
      for (const id of this.plugin.themeIds) d.addOption(id, id);
      d.setValue(this.plugin.settings.theme).onChange((v) => {
        this.plugin.settings.theme = v;
        void this.plugin.saveSettings().then(async () => {
          await this.plugin.refreshActiveTheme();
          await this.reload();
        });
      });
    });

    if (!theme) {
      new Setting(c).setName(t("set.loadError")).setDesc(this.plugin.settings.theme);
      return;
    }

    for (const layer of ["tokens", "vars"] as const) this.layerControls(c, theme, layer);

    new Setting(c)
      .addButton((b) =>
        b
          .setButtonText(t("set.saveAsFormat"))
          .setCta()
          .setDisabled(!this.hasOverrides())
          .onClick(() => this.plugin.promptSaveAsFormat()),
      )
      // Reset applies wherever there are overrides. On a saved pack the values
      // live in the pack itself, so there is usually nothing to reset and the
      // button says so by being disabled.
      .addButton((b) =>
        b
          .setButtonText(t("set.resetAll"))
          .setDestructive()
          .setDisabled(!this.hasOverrides())
          .onClick(() => void this.resetOverrides()),
      );
  }

  /** Clears every override on the selected theme and redraws. */
  private async resetOverrides(): Promise<void> {
    const id = this.plugin.settings.theme;
    delete this.plugin.settings.overrides[id];
    delete this.plugin.settings.overridesVars[id];
    await this.plugin.saveSettings();
    await this.plugin.refreshActiveTheme();
    this.theme = this.plugin.activeTheme;
    this.buildControls();
    this.redraw();
  }

  private hasOverrides(): boolean {
    const id = this.plugin.settings.theme;
    return (
      Object.keys(this.plugin.settings.overrides[id] ?? {}).length > 0 ||
      Object.keys(this.plugin.settings.overridesVars[id] ?? {}).length > 0
    );
  }

  private layerControls(c: HTMLElement, theme: Resolved, layer: "tokens" | "vars"): void {
    const schema = (layer === "tokens" ? theme.tokenSchema : theme.varSchema) ?? {};
    const values = (layer === "tokens" ? theme.tokens : theme.vars) ?? {};
    const names = Object.keys(schema).filter((k) => k in values);
    if (names.length === 0) return;

    const byGroup = new Map<string, string[]>();
    for (const n of names) {
      const g = schema[n]!.group ?? "other";
      byGroup.set(g, [...(byGroup.get(g) ?? []), n]);
    }
    const groups = [...byGroup.keys()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

    for (const g of groups) {
      new Setting(c).setName(this.groupLabel(g)).setHeading();
      for (const n of byGroup.get(g)!) {
        this.control(c, theme, layer, n, schema[n]!, resolve(values[n], language()));
      }
    }
  }

  private groupLabel(g: string): string {
    const known = ["footer", "palette", "typography", "cover", "other"];
    return known.includes(g)
      ? t(`group.${g}` as never)
      : g.charAt(0).toUpperCase() + g.slice(1);
  }

  private control(
    c: HTMLElement,
    theme: Resolved,
    layer: "tokens" | "vars",
    name: string,
    def: TokenDef,
    themeValue: string,
  ): void {
    const map =
      layer === "tokens" ? this.plugin.settings.overrides : this.plugin.settings.overridesVars;
    const current = map[theme.id]?.[name] ?? themeValue;

    const save = async (v: string) => {
      const entry = map[theme.id] ?? {};
      if (v === "" || v === themeValue) delete entry[name];
      else entry[name] = v;
      if (Object.keys(entry).length === 0) delete map[theme.id];
      else map[theme.id] = entry;
      await this.plugin.saveSettings();
      await this.plugin.refreshActiveTheme();
      this.theme = this.plugin.activeTheme;
      // Only the preview: rebuilding the controls here would steal focus from
      // the field being typed into.
      this.redraw();
    };

    const s = new Setting(c).setName(resolve(def.label, language()));
    const desc = resolve(def.description, language());
    if (desc) s.setDesc(desc);

    if (def.type === "color") s.addColorPicker((p) => p.setValue(current).onChange(save));
    else s.addText((x) => x.setValue(current).setPlaceholder(themeValue).onChange(save));
  }

  override async onClose(): Promise<void> {
    this.contentEl.empty();
  }
}
