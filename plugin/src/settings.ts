/**
 * Pantalla de ajustes.
 *
 * Los controles NO estan escritos a mano: se generan leyendo el tokenSchema del
 * theme pack. Agregar un token con su entrada de schema hace aparecer su
 * control solo, sin tocar este archivo. Ese es todo el punto de que tokenSchema
 * exista.
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import type PressmarkPlugin from "./main";
import type { Resolved, TokenDef } from "./theme";
import { t, idioma } from "./i18n";
import { resolve } from "./locale";

export interface Ajustes {
  theme: string;
  /** Overrides de tokens por theme: { [themeId]: { [token]: valor } } */
  overrides: Record<string, Record<string, string>>;
  /**
   * Overrides de vars por theme. Separados de los tokens porque no son lo
   * mismo: un token es identidad visual, una var es TEXTO que se imprime, y el
   * frontmatter de una nota puede pisarla. Precedencia final:
   * frontmatter > este override > el valor del theme pack.
   */
  overridesVars: Record<string, Record<string, string>>;
  abrirAlTerminar: boolean;
  carpetaSalida: string;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  theme: "informe",
  overrides: {},
  overridesVars: {},
  abrirAlTerminar: true,
  carpetaSalida: "",
};

const ORDEN_GRUPOS = ["pie", "paleta", "tipografia", "portada"];

/**
 * Los grupos vienen del tokenSchema como identificadores planos ("paleta").
 * Se traducen los conocidos; uno propio de un theck pack del usuario se muestra
 * tal cual, que es mejor que esconderlo.
 */
function nombreGrupo(g: string): string {
  const conocidos = ["pie", "paleta", "tipografia", "portada", "otros"] as const;
  if ((conocidos as readonly string[]).includes(g)) {
    return t(`grupo.${g}` as Parameters<typeof t>[0]);
  }
  return g.charAt(0).toUpperCase() + g.slice(1);
}

export class PantallaAjustes extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: PressmarkPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName(t("set.exportacion")).setHeading();

    void this.seccionGeneral(containerEl);
  }

  private async seccionGeneral(c: HTMLElement): Promise<void> {
    const ids = await this.plugin.themesDisponibles();

    new Setting(c)
      .setName(t("set.themePack"))
      .setDesc(t("set.themePackDesc"))
      .addDropdown((d) => {
        for (const id of ids) d.addOption(id, id);
        d.setValue(this.plugin.ajustes.theme).onChange(async (v) => {
          this.plugin.ajustes.theme = v;
          await this.plugin.guardarAjustes();
          this.display();
        });
      });

    new Setting(c)
      .setName(t("set.abrir"))
      .addToggle((c) =>
        c.setValue(this.plugin.ajustes.abrirAlTerminar).onChange(async (v) => {
          this.plugin.ajustes.abrirAlTerminar = v;
          await this.plugin.guardarAjustes();
        }),
      );

    new Setting(c)
      .setName(t("set.carpeta"))
      .setDesc(t("set.carpetaDesc"))
      .addText((c) =>
        c
          .setPlaceholder("exportados/")
          .setValue(this.plugin.ajustes.carpetaSalida)
          .onChange(async (v) => {
            this.plugin.ajustes.carpetaSalida = v.trim();
            await this.plugin.guardarAjustes();
          }),
      );

    let theme: Resolved;
    try {
      theme = await this.plugin.cargarTheme(this.plugin.ajustes.theme);
    } catch (e) {
      new Setting(c).setName(t("set.noCarga")).setDesc(String(e));
      return;
    }
    this.seccionEditable(c, theme, "tokens");
    this.seccionEditable(c, theme, "vars");
  }

  /**
   * Aca es donde el formulario se dibuja solo.
   *
   * Sirve para tokens y para vars sin duplicar nada: las dos capas declaran su
   * esquema igual (tokenSchema / varSchema), asi que el generador es uno solo.
   */
  private seccionEditable(c: HTMLElement, theme: Resolved, capa: "tokens" | "vars"): void {
    const schema = (capa === "tokens" ? theme.tokenSchema : theme.varSchema) ?? {};
    const valores = ((capa === "tokens" ? theme.tokens : theme.vars) ?? {}) as Record<string, unknown>;
    const nombres = Object.keys(schema).filter((k) => k in valores);
    if (nombres.length === 0) return;

    new Setting(c)
      .setName(t(capa === "tokens" ? "set.personalizacion" : "set.textos"))
      .setHeading();
    c.createEl("p", {
      text:
        capa === "tokens"
          ? t("set.personalizacionDesc", { id: theme.id })
          : t("set.textosDesc"),
      cls: "setting-item-description",
    });

    const porGrupo = new Map<string, string[]>();
    for (const n of nombres) {
      const g = schema[n]!.group ?? "otros";
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), n]);
    }

    const grupos = [...porGrupo.keys()].sort((a, b) => {
      const ia = ORDEN_GRUPOS.indexOf(a);
      const ib = ORDEN_GRUPOS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

    for (const g of grupos) {
      if (grupos.length > 1) new Setting(c).setName(nombreGrupo(g)).setHeading();
      for (const n of porGrupo.get(g)!) {
        this.control(c, theme, capa, n, schema[n]!, resolve(valores[n] as never, idioma()));
      }
    }

    new Setting(c).addButton((b) =>
      b
        .setButtonText(t("set.restablecer"))
        .setWarning()
        .onClick(async () => {
          delete this.mapa(capa)[theme.id];
          await this.plugin.guardarAjustes();
          this.display();
        }),
    );
  }

  private mapa(capa: "tokens" | "vars"): Record<string, Record<string, string>> {
    return capa === "tokens" ? this.plugin.ajustes.overrides : this.plugin.ajustes.overridesVars;
  }

  private control(
    c: HTMLElement,
    theme: Resolved,
    capa: "tokens" | "vars",
    nombre: string,
    def: TokenDef,
    valorTheme: string,
  ): void {
    const overrides = this.mapa(capa)[theme.id] ?? {};
    const actual = overrides[nombre] ?? valorTheme;
    const modificado = nombre in overrides;

    const s = new Setting(c).setName(resolve(def.label, idioma()));
    const desc = resolve(def.description, idioma());
    if (desc) s.setDesc(desc);
    if (modificado) s.nameEl.createSpan({ text: " ·", cls: "mod-warning" });

    const guardar = async (v: string) => {
      const mapa = this.mapa(capa);
      const o = mapa[theme.id] ?? {};
      if (v === valorTheme) delete o[nombre];
      else o[nombre] = v;
      if (Object.keys(o).length === 0) delete mapa[theme.id];
      else mapa[theme.id] = o;
      await this.plugin.guardarAjustes();
    };

    // El tipo del token decide el control. Sin este switch habria que escribir
    // trece controles a mano y volver a tocarlos con cada token nuevo.
    switch (def.type) {
      case "color":
        s.addColorPicker((p) => p.setValue(actual).onChange(guardar));
        break;
      case "number":
        s.addText((c) =>
          c.setValue(actual).setPlaceholder(valorTheme).onChange(guardar).inputEl.setAttr("type", "number"),
        );
        break;
      default:
        s.addText((c) => c.setValue(actual).setPlaceholder(valorTheme).onChange(guardar));
    }

    if (modificado) {
      s.addExtraButton((b) =>
        b
          .setIcon("rotate-ccw")
          .setTooltip(t("set.volverAlTheme"))
          .onClick(() => {
            void guardar(valorTheme).then(() => this.display());
          }),
      );
    }
  }
}
