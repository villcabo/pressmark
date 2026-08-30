/**
 * pressmark — exporta notas a PDF usando theme packs portables.
 *
 * El motor de maquetado es Chromium, igual que en el CLI. La diferencia es
 * quien lo maneja: aca es el Electron que Obsidian ya trae. Lo que NO cambia es
 * el theme pack, y por eso el mismo pack da el mismo PDF en los dos lados.
 */
import {
  Component,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from "obsidian";
import { load, type Resolved, type ThemeFS } from "./theme";
import { embeddedFS, overlay, vaultFS, CARPETA_USUARIO } from "./sources";
import { bandHTML, documentHTML, renderBody, tituloDe } from "./render";
import { generar, opcionesDe } from "./pdf";
import {
  AJUSTES_POR_DEFECTO,
  PantallaAjustes,
  type Ajustes,
} from "./settings";

export default class PressmarkPlugin extends Plugin {
  ajustes: Ajustes = { ...AJUSTES_POR_DEFECTO };
  private packs!: ThemeFS;

  override async onload(): Promise<void> {
    await this.cargarAjustes();
    // Los del usuario ganan; los embebidos son el piso. La herencia cruza las
    // dos capas: un theme propio hereda de _base, que viaja en el plugin.
    this.packs = overlay(vaultFS(this.app.vault), embeddedFS());

    this.addSettingTab(new PantallaAjustes(this.app, this));

    this.addRibbonIcon("file-output", "Exportar a PDF", () => {
      void this.exportarActual();
    });

    this.addCommand({
      id: "export-active-note",
      name: "Exportar la nota activa a PDF",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) void this.exportarActual();
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, archivo) => {
        if (!(archivo instanceof TFile) || archivo.extension !== "md") return;
        menu.addItem((i) =>
          i
            .setTitle("Exportar a PDF")
            .setIcon("file-output")
            .onClick(() => void this.exportar(archivo)),
        );
      }),
    );
  }

  async cargarAjustes(): Promise<void> {
    this.ajustes = Object.assign({}, AJUSTES_POR_DEFECTO, await this.loadData());
  }

  async guardarAjustes(): Promise<void> {
    await this.saveData(this.ajustes);
  }

  async themesDisponibles(): Promise<string[]> {
    const ids = (await this.packs.list?.()) ?? [];
    return ids.filter((i) => !i.startsWith("_")).sort();
  }

  /**
   * Carga el theme y le aplica los overrides del usuario.
   *
   * Los overrides pisan tokens, nunca el CSS: por eso personalizar no rompe el
   * theme pack y se puede volver al original en cualquier momento.
   */
  async cargarTheme(id: string): Promise<Resolved> {
    const t = await load(this.packs, id);
    const o = this.ajustes.overrides[id];
    if (o && Object.keys(o).length > 0) {
      t.tokens = { ...(t.tokens ?? {}), ...o };
    }
    return t;
  }

  private async exportarActual(): Promise<void> {
    const f = this.app.workspace.getActiveFile();
    if (!f || f.extension !== "md") {
      new Notice("Abrí una nota de Markdown primero.");
      return;
    }
    await this.exportar(f);
  }

  async exportar(archivo: TFile): Promise<void> {
    const aviso = new Notice(`Exportando ${archivo.basename}…`, 0);
    // Un Component propio para que los child components que crea el renderer
    // de Obsidian se descarguen aunque la exportacion falle.
    const comp = new Component();
    comp.load();

    try {
      const theme = await this.cargarTheme(this.ajustes.theme);
      const md = await this.app.vault.cachedRead(archivo);
      const titulo = tituloDe(md, archivo.basename);

      const body = await renderBody(this.app, md, archivo.path, comp);
      const html = documentHTML(titulo, body, theme);

      const m = theme.page?.margin;
      const opts = opcionesDe(
        theme,
        bandHTML(theme.header, m, theme.vars, titulo),
        bandHTML(theme.footer, m, theme.vars, titulo),
      );

      const pdf = await generar(html, opts);
      const destino = this.rutaSalida(archivo);
      await this.app.vault.adapter.writeBinary(destino, pdf.buffer as ArrayBuffer);

      aviso.hide();
      new Notice(`✓ ${destino}`);
      if (this.ajustes.abrirAlTerminar) {
        this.app.workspace.openLinkText(destino, "", false);
      }
    } catch (e) {
      aviso.hide();
      console.error("pressmark:", e);
      new Notice(`No pude exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      comp.unload();
    }
  }

  private rutaSalida(archivo: TFile): string {
    const nombre = `${archivo.basename}.pdf`;
    const carpeta = this.ajustes.carpetaSalida || archivo.parent?.path || "";
    return normalizePath(carpeta ? `${carpeta}/${nombre}` : nombre);
  }
}

export { CARPETA_USUARIO };
