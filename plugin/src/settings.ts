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

export interface Ajustes {
  theme: string;
  /** Overrides del usuario por theme: { [themeId]: { [token]: valor } } */
  overrides: Record<string, Record<string, string>>;
  abrirAlTerminar: boolean;
  carpetaSalida: string;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  theme: "informe",
  overrides: {},
  abrirAlTerminar: true,
  carpetaSalida: "",
};

const ORDEN_GRUPOS = ["paleta", "tipografia", "portada"];

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

    new Setting(containerEl).setName("Exportación").setHeading();

    void this.seccionGeneral(containerEl);
  }

  private async seccionGeneral(c: HTMLElement): Promise<void> {
    const ids = await this.plugin.themesDisponibles();

    new Setting(c)
      .setName("Theme pack")
      .setDesc("El formato que se aplica al exportar.")
      .addDropdown((d) => {
        for (const id of ids) d.addOption(id, id);
        d.setValue(this.plugin.ajustes.theme).onChange(async (v) => {
          this.plugin.ajustes.theme = v;
          await this.plugin.guardarAjustes();
          this.display();
        });
      });

    new Setting(c)
      .setName("Abrir el PDF al terminar")
      .addToggle((t) =>
        t.setValue(this.plugin.ajustes.abrirAlTerminar).onChange(async (v) => {
          this.plugin.ajustes.abrirAlTerminar = v;
          await this.plugin.guardarAjustes();
        }),
      );

    new Setting(c)
      .setName("Carpeta de salida")
      .setDesc("Vacío = junto a la nota.")
      .addText((t) =>
        t
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
      new Setting(c).setName("No pude cargar el theme").setDesc(String(e));
      return;
    }
    this.seccionTokens(c, theme);
  }

  /** Aca es donde el formulario se dibuja solo. */
  private seccionTokens(c: HTMLElement, theme: Resolved): void {
    const schema = theme.tokenSchema ?? {};
    const tokens = theme.tokens ?? {};
    const nombres = Object.keys(schema).filter((k) => k in tokens);

    if (nombres.length === 0) return;

    new Setting(c).setName("Personalización").setHeading();
    c.createEl("p", {
      text: `Estos controles salen del tokenSchema de "${theme.id}". Los cambios se guardan como overrides y no tocan el theme pack.`,
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
      new Setting(c).setName(g[0]!.toUpperCase() + g.slice(1)).setHeading();
      for (const n of porGrupo.get(g)!) {
        this.control(c, theme, n, schema[n]!, tokens[n]!);
      }
    }

    new Setting(c).addButton((b) =>
      b
        .setButtonText("Restablecer todo")
        .setWarning()
        .onClick(async () => {
          delete this.plugin.ajustes.overrides[theme.id];
          await this.plugin.guardarAjustes();
          this.display();
        }),
    );
  }

  private control(
    c: HTMLElement,
    theme: Resolved,
    nombre: string,
    def: TokenDef,
    valorTheme: string,
  ): void {
    const overrides = this.plugin.ajustes.overrides[theme.id] ?? {};
    const actual = overrides[nombre] ?? valorTheme;
    const modificado = nombre in overrides;

    const s = new Setting(c).setName(def.label);
    if (def.description) s.setDesc(def.description);
    if (modificado) s.nameEl.createSpan({ text: " ·", cls: "mod-warning" });

    const guardar = async (v: string) => {
      const o = this.plugin.ajustes.overrides[theme.id] ?? {};
      if (v === valorTheme) delete o[nombre];
      else o[nombre] = v;
      if (Object.keys(o).length === 0) delete this.plugin.ajustes.overrides[theme.id];
      else this.plugin.ajustes.overrides[theme.id] = o;
      await this.plugin.guardarAjustes();
    };

    // El tipo del token decide el control. Sin este switch habria que escribir
    // trece controles a mano y volver a tocarlos con cada token nuevo.
    switch (def.type) {
      case "color":
        s.addColorPicker((p) => p.setValue(actual).onChange(guardar));
        break;
      case "number":
        s.addText((t) =>
          t.setValue(actual).setPlaceholder(valorTheme).onChange(guardar).inputEl.setAttr("type", "number"),
        );
        break;
      default:
        s.addText((t) => t.setValue(actual).setPlaceholder(valorTheme).onChange(guardar));
    }

    if (modificado) {
      s.addExtraButton((b) =>
        b
          .setIcon("rotate-ccw")
          .setTooltip("Volver al valor del theme")
          .onClick(() => {
            void guardar(valorTheme).then(() => this.display());
          }),
      );
    }
  }
}
