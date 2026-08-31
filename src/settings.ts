/**
 * Settings tab.
 *
 * The controls are NOT written by hand: they are generated from the theme
 * pack's tokenSchema and varSchema. Adding a token with its schema entry makes
 * its control appear on its own, without touching this file. That is the whole
 * point of those schemas existing.
 *
 * Built on the declarative API (`getSettingDefinitions`), so the settings also
 * turn up in Obsidian's settings search.
 */
import {
  PluginSettingTab,
  type App,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type PressmarkPlugin from "./main";
import type { Resolved, TokenDef } from "./theme";
import { t, language } from "./i18n";
import { resolve } from "./locale";

const GROUP_ORDER = ["footer", "palette", "typography", "cover", "other"];

/**
 * Groups come out of the schema as plain identifiers ("palette"). Known ones
 * are translated; a group of the user's own is shown as written, which beats
 * hiding it.
 */
function groupName(g: string): string {
  const known = ["footer", "palette", "typography", "cover", "other"] as const;
  if ((known as readonly string[]).includes(g)) {
    return t(`group.${g}` as Parameters<typeof t>[0]);
  }
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/**
 * Keys for the nested override maps.
 *
 * The declarative API addresses every control by a flat string key, while the
 * overrides are two levels deep: `overrides[themeId][token]`. Encoding the path
 * is what bridges the two, and `/` is safe as a separator because neither theme
 * ids nor token names can contain one.
 */
const OVERRIDE = /^(overrides|overridesVars)\/([^/]+)\/(.+)$/;

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: PressmarkPlugin,
  ) {
    super(app, plugin);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const items: SettingDefinitionItem[] = [
      {
        type: "group",
        heading: t("set.export"),
        items: [
          {
            name: t("set.themePack"),
            desc: t("set.themePackDesc"),
            control: {
              type: "dropdown",
              key: "theme",
              options: Object.fromEntries(this.plugin.themeIds.map((id) => [id, id])),
            },
          },
          {
            name: t("set.saveAsFormat"),
            desc: t("set.saveAsFormatDesc"),
            action: (el) => {
              el.createEl("button", { text: t("pack.save") }).addEventListener("click", () =>
                this.plugin.promptSaveAsFormat(),
              );
            },
          },
          {
            name: t("set.openWhenDone"),
            control: { type: "toggle", key: "openWhenDone" },
          },
        ],
      },
    ];

    // The theme is resolved asynchronously, so the plugin keeps the active one
    // cached: this method has to answer synchronously.
    const theme = this.plugin.activeTheme;
    if (!theme) {
      items.push({ name: t("set.loadError"), desc: this.plugin.settings.theme });
      return items;
    }

    for (const layer of ["tokens", "vars"] as const) {
      items.push(...this.editableGroups(theme, layer));
    }
    return items;
  }

  /** Builds one group per schema group, plus its reset action. */
  private editableGroups(
    theme: Resolved,
    layer: "tokens" | "vars",
  ): SettingDefinitionItem[] {
    const schema = (layer === "tokens" ? theme.tokenSchema : theme.varSchema) ?? {};
    const values = (layer === "tokens" ? theme.tokens : theme.vars) ?? {};
    const names = Object.keys(schema).filter((k) => k in values);
    if (names.length === 0) return [];

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

    const out: SettingDefinitionItem[] = [];
    const single = groups.length === 1;

    for (const [i, g] of groups.entries()) {
      const items: SettingGroupItem[] = [];

      // The section blurb has no control of its own: it explains where these
      // fields come from and how to undo one.
      if (i === 0) {
        items.push({
          name: "",
          desc: `${t(layer === "tokens" ? "set.customizationDesc" : "set.textsDesc", { id: theme.id })} ${t("set.clearToReset")}`,
        });
      }

      items.push(
        ...byGroup
          .get(g)!
          .map((n) => this.control(theme, layer, n, schema[n]!, resolve(values[n], language()))),
      );

      // The reset button hangs off the last group of the section, so a section
      // with several groups does not sprout one reset per group.
      if (i === groups.length - 1) {
        items.push({
          name: t("set.resetAll"),
          action: (el) => {
            el.createEl("button", { text: t("set.resetAll"), cls: "mod-destructive" })
              .addEventListener("click", () => {
                void this.resetLayer(theme.id, layer);
              });
          },
        });
      }

      out.push({
        type: "group",
        heading: single
          ? t(layer === "tokens" ? "set.customization" : "set.texts")
          : `${t(layer === "tokens" ? "set.customization" : "set.texts")} · ${groupName(g)}`,
        items,
      });
    }
    return out;
  }

  /** The token's declared type is what decides the control. */
  private control(
    theme: Resolved,
    layer: "tokens" | "vars",
    name: string,
    def: TokenDef,
    themeValue: string,
  ): SettingGroupItem {
    const key = `${layer === "tokens" ? "overrides" : "overridesVars"}/${theme.id}/${name}`;
    const label = resolve(def.label, language());
    const desc = resolve(def.description, language());

    const base = { name: label, ...(desc ? { desc } : {}) };

    switch (def.type) {
      case "color":
        return { ...base, control: { type: "color", key, defaultValue: themeValue } };
      case "number":
        return {
          ...base,
          control: { type: "number", key, placeholder: themeValue },
        };
      default:
        return {
          ...base,
          control: { type: "text", key, placeholder: themeValue },
        };
    }
  }

  /**
   * Reads a control's value.
   *
   * An override that is not set reports the theme's own value, so the field
   * shows what the document will actually use rather than an empty box.
   */
  override getControlValue(key: string): unknown {
    const m = OVERRIDE.exec(key);
    if (!m) return (this.plugin.settings as unknown as Record<string, unknown>)[key];

    const [, layer, themeId, name] = m;
    const stored = this.plugin.settings[layer as "overrides" | "overridesVars"]?.[themeId!]?.[
      name!
    ];
    if (stored !== undefined) return stored;

    const theme = this.plugin.activeTheme;
    if (!theme || theme.id !== themeId) return "";
    const source = (layer === "overrides" ? theme.tokens : theme.vars) ?? {};
    // A var can be a per-language object, so it has to be resolved rather than
    // stringified: String() on one yields "[object Object]".
    return resolve(source[name!], language());
  }

  /**
   * Writes a control's value.
   *
   * A value equal to the theme's own is stored as no override at all: that is
   * what lets "reset" mean something and keeps data.json free of noise.
   */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    const m = OVERRIDE.exec(key);

    if (!m) {
      (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
      await this.plugin.saveSettings();
      if (key === "theme") {
        await this.plugin.refreshActiveTheme();
        this.update();
      }
      return;
    }

    const [, layerKey, themeId, name] = m;
    const layer = layerKey as "overrides" | "overridesVars";
    const map = this.plugin.settings[layer];
    const theme = this.plugin.activeTheme;
    const source = (layer === "overrides" ? theme?.tokens : theme?.vars) ?? {};
    const themeValue = resolve(source[name!], language());

    const entry = map[themeId!] ?? {};
    const next = String(value);
    // An empty field, or one equal to the theme's own value, means "no
    // override" rather than "override with this". That is what makes the
    // placeholder a working reset affordance.
    if (next === "" || next === themeValue) delete entry[name!];
    else entry[name!] = next;

    if (Object.keys(entry).length === 0) delete map[themeId!];
    else map[themeId!] = entry;

    await this.plugin.saveSettings();
  }

  private async resetLayer(themeId: string, layer: "tokens" | "vars"): Promise<void> {
    const map =
      layer === "tokens" ? this.plugin.settings.overrides : this.plugin.settings.overridesVars;
    delete map[themeId];
    await this.plugin.saveSettings();
    await this.plugin.refreshActiveTheme();
    this.update();
  }
}
