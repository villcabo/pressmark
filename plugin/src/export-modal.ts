/**
 * Modal de exportacion: elegir formato, ajustar y VER antes de generar.
 *
 * La vista previa no es decorativa. Renderiza el documento con el mismo CSS del
 * theme y a la proporcion real del papel, asi que se ve la portada, la paleta y
 * el desborde de tablas anchas ANTES de escribir el archivo. Cambiar de theme
 * no vuelve a renderizar el markdown: solo se reenvuelve el cuerpo ya
 * renderizado con otro CSS, que es instantaneo.
 */
import { App, Modal, Notice, Setting, type TFile } from "obsidian";
import type { Resolved, Page } from "./theme";
import { documentHTML } from "./render";
import { tamanoPapel } from "./pdf";
import { t, idioma } from "./i18n";
import { resolve } from "./locale";

export interface OpcionesExport {
  theme: string;
  size: string; // "" = el del theme
  orientation: "" | "portrait" | "landscape";
  margen: string; // mm; "" = el del theme
  portada: boolean | null; // null = el del theme
  carpeta: string;
  abrir: boolean;
}

interface Args {
  app: App;
  archivo: TFile;
  titulo: string;
  bodyHTML: string;
  themes: string[];
  inicial: OpcionesExport;
  cargarTheme: (id: string) => Promise<Resolved>;
  onExport: (o: OpcionesExport) => void;
}

/**
 * Aplica lo elegido en el modal sobre el theme, sin tocar el pack en disco.
 *
 * La usan el modal (para la vista previa) y la exportacion (para el PDF). Tiene
 * que ser LA MISMA funcion: si la vista previa y el archivo aplicaran las
 * opciones por caminos distintos, la vista previa dejaria de ser una promesa.
 */
export function aplicarOpciones(tema: Resolved, o: OpcionesExport): Resolved {
  const page: Page = { ...(tema.page ?? {}) };
  if (o.size) page.size = o.size;
  if (o.orientation) page.orientation = o.orientation;
  if (o.margen && MARGEN.test(o.margen)) {
    const m = `${o.margen}mm`;
    page.margin = { top: m, right: m, bottom: m, left: m };
  }
  const cover = o.portada === null ? tema.cover : { ...tema.cover, enabled: o.portada };
  return { ...tema, page, cover };
}

/** Un numero en mm, y nada mas. */
export const MARGEN = /^\d+(\.\d+)?$/;

export class ExportModal extends Modal {
  private o: OpcionesExport;
  private previewEl!: HTMLIFrameElement;
  private lienzoEl!: HTMLElement;
  private escalaEl!: HTMLElement;
  private cortesEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private theme?: Resolved;

  constructor(private a: Args) {
    super(a.app);
    this.o = { ...a.inicial };
  }

  override onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("pressmark-modal");
    contentEl.empty();

    contentEl.createEl("h2", { text: t("modal.titulo") });
    contentEl.createEl("p", {
      text: this.a.archivo.path,
      cls: "pressmark-ruta",
    });

    const cols = contentEl.createDiv({ cls: "pressmark-cols" });
    const form = cols.createDiv({ cls: "pressmark-form" });
    const vista = cols.createDiv({ cls: "pressmark-vista" });

    // El iframe se dibuja al ANCHO REAL del papel y despues se escala. Si se
    // lo dejara al ancho del panel, el documento se maqueta a otro ancho de
    // columna: las lineas cortan distinto y la vista previa miente.
    this.lienzoEl = vista.createDiv({ cls: "pressmark-lienzo" });
    this.escalaEl = this.lienzoEl.createDiv({ cls: "pressmark-escala" });
    this.previewEl = this.escalaEl.createEl("iframe", { cls: "pressmark-preview" });
    this.previewEl.setAttr("sandbox", "allow-same-origin");
    this.cortesEl = this.escalaEl.createDiv({ cls: "pressmark-cortes" });
    this.infoEl = vista.createDiv({ cls: "pressmark-info" });

    this.formulario(form);

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t("modal.cancelar")).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t("modal.exportar"))
          .setCta()
          .onClick(() => {
            this.close();
            this.a.onExport(this.o);
          }),
      );

    void this.refrescar();
  }

  private formulario(c: HTMLElement): void {
    new Setting(c)
      .setName(t("modal.formato"))
      .setDesc(t("modal.formatoDesc"))
      .addDropdown((d) => {
        for (const id of this.a.themes) d.addOption(id, id);
        d.setValue(this.o.theme).onChange((v) => {
          this.o.theme = v;
          void this.refrescar();
        });
      });

    new Setting(c).setName(t("modal.papel")).addDropdown((d) => {
      d.addOption("", t("modal.delFormato"));
      for (const s of ["A4", "Letter", "Legal", "A5", "A3", "Tabloid"]) d.addOption(s, s);
      d.setValue(this.o.size).onChange((v) => {
        this.o.size = v;
        void this.refrescar();
      });
    });

    new Setting(c).setName(t("modal.orientacion")).addDropdown((d) => {
      d.addOption("", t("modal.delFormato"));
      d.addOption("portrait", t("modal.vertical"));
      d.addOption("landscape", t("modal.horizontal"));
      d.setValue(this.o.orientation).onChange((v) => {
        this.o.orientation = v as OpcionesExport["orientation"];
        void this.refrescar();
      });
    });

    new Setting(c)
      .setName(t("modal.margen"))
      .setDesc(t("modal.margenDesc"))
      .addText((c) =>
        c
          .setPlaceholder(t("modal.margenPlaceholder"))
          .setValue(this.o.margen)
          .onChange((v) => {
            this.o.margen = v.trim();
            void this.refrescar();
          }),
      );

    new Setting(c)
      .setName(t("modal.portada"))
      .setDesc(t("modal.portadaDesc"))
      .addDropdown((d) => {
        d.addOption("", t("modal.delFormato"));
        d.addOption("si", t("modal.conPortada"));
        d.addOption("no", t("modal.sinPortada"));
        d.setValue(this.o.portada === null ? "" : this.o.portada ? "si" : "no");
        d.onChange((v) => {
          this.o.portada = v === "" ? null : v === "si";
          void this.refrescar();
        });
      });

    new Setting(c)
      .setName(t("modal.carpeta"))
      .setDesc(t("modal.carpetaDesc"))
      .addText((c) =>
        c
          .setPlaceholder(t("modal.carpetaPlaceholder"))
          .setValue(this.o.carpeta)
          .onChange((v) => (this.o.carpeta = v.trim())),
      );

    new Setting(c)
      .setName(t("modal.abrir"))
      .addToggle((c) => c.setValue(this.o.abrir).onChange((v) => (this.o.abrir = v)));
  }

  private async refrescar(): Promise<void> {
    try {
      const base = await this.a.cargarTheme(this.o.theme);
      this.theme = aplicarOpciones(base, this.o);
    } catch (e) {
      this.infoEl.setText(t("modal.errorFormato", { e: String(e) }));
      return;
    }
    const tema = this.theme;

    let w = 8.27,
      h = 11.69;
    try {
      [w, h] = tamanoPapel(tema.page);
    } catch {
      /* se informa mas abajo */
    }
    if (tema.page?.orientation === "landscape") [w, h] = [h, w];

    // 96 px CSS por pulgada: es la unidad en la que Chromium maqueta.
    const anchoPx = w * 96;
    const altoPx = h * 96;

    this.previewEl.style.width = `${anchoPx}px`;
    this.previewEl.srcdoc = documentHTML(this.a.titulo, this.a.bodyHTML, tema, true);

    this.previewEl.onload = () => {
      const doc = this.previewEl.contentDocument;
      if (!doc) return;
      // Alto real del documento, redondeado hacia arriba a paginas enteras:
      // asi la ultima carilla se ve completa y no cortada al medio.
      const alto = Math.max(doc.body.scrollHeight, altoPx);
      const paginas = Math.max(1, Math.ceil(alto / altoPx));
      const altoTotal = paginas * altoPx;

      this.previewEl.style.height = `${altoTotal}px`;
      this.escalaEl.style.width = `${anchoPx}px`;
      this.escalaEl.style.height = `${altoTotal}px`;

      // Lineas donde Chromium va a cortar. Es aproximado —el corte real
      // depende de break-inside— pero alcanza para ver si un titulo o una
      // tabla quedan a caballo entre dos carillas.
      this.cortesEl.empty();
      for (let i = 1; i < paginas; i++) {
        const linea = this.cortesEl.createDiv({ cls: "pressmark-corte" });
        linea.style.top = `${i * altoPx}px`;
        linea.createSpan({ text: t("modal.carilla", { n: i + 1 }) });
      }

      this.ajustarEscala(anchoPx);
      this.actualizarInfo(tema, paginas);
    };

    if (this.o.margen && !MARGEN.test(this.o.margen)) {
      new Notice(t("modal.margenInvalido"));
    }
  }

  /** Escala el lienzo para que la carilla entre a lo ancho del panel. */
  private ajustarEscala(anchoPx: number): void {
    const disponible = this.lienzoEl.clientWidth;
    if (!disponible) return;
    const f = Math.min(1, disponible / anchoPx);
    this.escalaEl.style.transform = `scale(${f})`;
    // Las marcas de corte viven adentro del elemento escalado, asi que se
    // achicarian con el. Se contra-escalan con esta variable para que sigan
    // siendo legibles a cualquier zoom.
    this.escalaEl.style.setProperty("--pm-escala", String(f));
    // El contenedor tiene que reservar el alto YA ESCALADO, si no el scroll
    // queda del largo del documento sin escalar.
    this.lienzoEl.style.height = `${Math.min(520, this.escalaEl.offsetHeight * f)}px`;
  }

  private actualizarInfo(theme: Resolved, paginas: number): void {
    const m = theme.page?.margin;
    const size = typeof theme.page?.size === "string" ? theme.page.size : t("info.propio");
    const orient = theme.page?.orientation === "landscape" ? t("info.horizontal") : t("info.vertical");
    this.infoEl.setText(
      [
        size,
        orient,
        `${t("info.margenes")} ${m?.top ?? "?"} ${m?.right ?? "?"} ${m?.bottom ?? "?"} ${m?.left ?? "?"}`,
        theme.cover?.enabled ? t("info.conPortada") : t("info.sinPortada"),
        ...(theme.footer?.enabled ? [t("info.conPie")] : []),
        t("info.carillas", { n: paginas }),
      ].join(" · "),
    );
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
