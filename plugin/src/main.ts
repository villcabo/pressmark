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
import {
  bandHTML,
  documentHTML,
  mergeVars,
  renderBody,
  splitFrontmatter,
  tituloDesde,
} from "./render";
import { bytesDe, generar, opcionesDe } from "./pdf";
import { aplicarOpciones, ExportModal, type OpcionesExport } from "./export-modal";
import {
  AJUSTES_POR_DEFECTO,
  PantallaAjustes,
  type Ajustes,
} from "./settings";
import { iniciarIdioma, idioma, t } from "./i18n";

export default class PressmarkPlugin extends Plugin {
  ajustes: Ajustes = { ...AJUSTES_POR_DEFECTO };
  private packs!: ThemeFS;
  /** Frontmatter de la nota que esta en el modal, para {{fm.clave}} en las bandas. */
  private fm: Record<string, string> | null = null;

  override async onload(): Promise<void> {
    // Se resuelve una sola vez: la UI y los theme packs tienen que usar el
    // MISMO idioma, o el modal sale en uno y el pie del PDF en otro.
    iniciarIdioma();
    await this.cargarAjustes();
    // Los del usuario ganan; los embebidos son el piso. La herencia cruza las
    // dos capas: un theme propio hereda de _base, que viaja en el plugin.
    this.packs = overlay(vaultFS(this.app.vault), embeddedFS());

    this.addSettingTab(new PantallaAjustes(this.app, this));

    this.addRibbonIcon("file-output", t("ribbon"), () => {
      void this.exportarActual();
    });

    this.addCommand({
      id: "export-pdf",
      name: t("cmd.exportar"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) void this.exportarActual();
        return true;
      },
    });

    // Para quien ya sabe lo que quiere y no necesita ver el modal cada vez.
    this.addCommand({
      id: "export-pdf-quick",
      name: t("cmd.exportarRapido"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) void this.exportar(f, this.opcionesGuardadas());
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, archivo) => {
        if (!(archivo instanceof TFile) || archivo.extension !== "md") return;
        menu.addItem((i) =>
          i
            .setTitle(t("menu.exportar"))
            .setIcon("file-output")
            .onClick(() => void this.abrirModal(archivo)),
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
   * Los overrides pisan tokens y vars, nunca el CSS: por eso personalizar no
   * rompe el theme pack y siempre se puede volver al original.
   *
   * Un override de var reemplaza el valor localizado por una cadena suelta, y
   * esta bien que asi sea: si el usuario escribio su propio texto, ese texto es
   * el que quiere ver, no una traduccion.
   *
   * Precedencia final del valor de una var, de mayor a menor:
   *   frontmatter de la nota  >  este override  >  el theme pack
   */
  async cargarTheme(id: string): Promise<Resolved> {
    const t = await load(this.packs, id);

    const ot = this.ajustes.overrides[id];
    if (ot && Object.keys(ot).length > 0) {
      t.tokens = { ...(t.tokens ?? {}), ...ot };
    }
    const ov = this.ajustes.overridesVars[id];
    if (ov && Object.keys(ov).length > 0) {
      t.vars = { ...(t.vars ?? {}), ...ov };
    }
    return t;
  }

  private async exportarActual(): Promise<void> {
    const f = this.app.workspace.getActiveFile();
    if (!f || f.extension !== "md") {
      new Notice(t("notice.abriNota"));
      return;
    }
    await this.abrirModal(f);
  }

  private opcionesGuardadas(): OpcionesExport {
    return {
      theme: this.ajustes.theme,
      size: "",
      orientation: "",
      margen: "",
      portada: null,
      carpeta: this.ajustes.carpetaSalida,
      abrir: this.ajustes.abrirAlTerminar,
    };
  }

  /**
   * Abre el modal de exportacion.
   *
   * El cuerpo se renderiza UNA vez y se le pasa al modal ya hecho: cambiar de
   * formato ahi solo reenvuelve ese HTML con otro CSS. Volver a pedirle al
   * renderer de Obsidian que rehaga el markdown en cada cambio haria que la
   * vista previa se sienta lenta sin ninguna razon.
   */
  async abrirModal(archivo: TFile): Promise<void> {
    const comp = new Component();
    comp.load();
    try {
      const crudo = await this.app.vault.cachedRead(archivo);
      const { campos, cuerpo: md } = splitFrontmatter(crudo);
      const titulo = tituloDesde(campos, md, archivo.basename);
      const bodyHTML = await renderBody(this.app, md, archivo.path, comp);
      this.fm = campos;

      new ExportModal({
        app: this.app,
        archivo,
        titulo,
        bodyHTML,
        themes: await this.themesDisponibles(),
        inicial: this.opcionesGuardadas(),
        cargarTheme: (id) => this.cargarTheme(id),
        onExport: (o) => {
          // Lo elegido se vuelve el proximo default: nadie quiere reelegir el
          // formato en cada exportacion.
          this.ajustes.theme = o.theme;
          this.ajustes.carpetaSalida = o.carpeta;
          this.ajustes.abrirAlTerminar = o.abrir;
          void this.guardarAjustes();
          void this.exportar(archivo, o, bodyHTML, titulo);
        },
      }).open();
    } catch (e) {
      console.error("pressmark:", e);
      new Notice(t("notice.noPudePreview", { e: e instanceof Error ? e.message : String(e) }));
    } finally {
      comp.unload();
    }
  }

  async exportar(
    archivo: TFile,
    o: OpcionesExport,
    bodyPrerenderizado?: string,
    tituloPrerenderizado?: string,
  ): Promise<void> {
    const aviso = new Notice(t("notice.exportando", { n: archivo.basename }), 0);
    // Un Component propio para que los child components que crea el renderer
    // de Obsidian se descarguen aunque la exportacion falle.
    const comp = new Component();
    comp.load();

    try {
      const theme = aplicarOpciones(await this.cargarTheme(o.theme), o);

      let titulo = tituloPrerenderizado;
      let body = bodyPrerenderizado;
      let fm = this.fm;
      if (body === undefined || titulo === undefined) {
        const crudo = await this.app.vault.cachedRead(archivo);
        const sep = splitFrontmatter(crudo);
        fm = sep.campos;
        titulo = tituloDesde(sep.campos, sep.cuerpo, archivo.basename);
        body = await renderBody(this.app, sep.cuerpo, archivo.path, comp);
      }
      const html = documentHTML(titulo, body, theme);

      const m = theme.page?.margin;
      const vars = mergeVars(theme.vars, fm, idioma());
      const opts = opcionesDe(
        theme,
        bandHTML(theme.header, m, vars, titulo, idioma()),
        bandHTML(theme.footer, m, vars, titulo, idioma()),
      );

      const pdf = await generar(html, opts);
      const destino = this.rutaSalida(archivo, o.carpeta);
      await this.app.vault.adapter.writeBinary(destino, bytesDe(pdf));

      aviso.hide();
      new Notice(`✓ ${destino}`);
      if (o.abrir) {
        this.app.workspace.openLinkText(destino, "", false);
      }
    } catch (e) {
      aviso.hide();
      console.error("pressmark:", e);
      new Notice(t("notice.noPudeExportar", { e: e instanceof Error ? e.message : String(e) }));
    } finally {
      comp.unload();
    }
  }

  private rutaSalida(archivo: TFile, carpetaElegida: string): string {
    const nombre = `${archivo.basename}.pdf`;
    const carpeta = carpetaElegida || archivo.parent?.path || "";
    return normalizePath(carpeta ? `${carpeta}/${nombre}` : nombre);
  }
}

export { CARPETA_USUARIO };
