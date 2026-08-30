/**
 * Cadenas de la interfaz del plugin.
 *
 * El ingles es el idioma base y el respaldo: es lo que espera el community
 * store y lo que ve quien no tenga su idioma traducido.
 *
 * Solo se incluyen los idiomas que se pueden revisar de verdad. Meter
 * traducciones automaticas de idiomas que nadie del proyecto lee es peor que no
 * tenerlas: quedan mal y nadie se entera. Agregar uno es agregar una entrada
 * aca; las claves que falten caen solas al ingles.
 */
import { idiomaDeObsidian, resolve } from "./locale";

const EN = {
  "modal.titulo": "Pressmark · Export to PDF",
  "modal.formato": "Format",
  "modal.formatoDesc": "The theme pack to apply.",
  "modal.papel": "Paper size",
  "modal.delFormato": "From the format",
  "modal.orientacion": "Orientation",
  "modal.vertical": "Portrait",
  "modal.horizontal": "Landscape",
  "modal.margen": "Margin",
  "modal.margenDesc": "In millimetres, even on all four sides. Empty = from the format.",
  "modal.margenPlaceholder": "from the format",
  "modal.margenInvalido": "The margin must be a number in millimetres.",
  "modal.portada": "Cover page",
  "modal.portadaDesc": "The first heading and its metadata on their own page.",
  "modal.conPortada": "With cover",
  "modal.sinPortada": "Without cover",
  "modal.carpeta": "Output folder",
  "modal.carpetaDesc": "Empty = next to the note.",
  "modal.carpetaPlaceholder": "next to the note",
  "modal.abrir": "Open when finished",
  "modal.cancelar": "Cancel",
  "modal.exportar": "Export to PDF",
  "modal.carilla": "page {n}",
  "modal.errorFormato": "Could not load the format: {e}",
  "info.vertical": "portrait",
  "info.horizontal": "landscape",
  "info.margenes": "margins",
  "info.conPortada": "with cover",
  "info.sinPortada": "without cover",
  "info.conPie": "with footer",
  "info.carillas": "~{n} page(s)",
  "info.propio": "custom",
  "set.exportacion": "Export",
  "set.themePack": "Theme pack",
  "set.themePackDesc": "The format applied when exporting.",
  "set.abrir": "Open the PDF when finished",
  "set.carpeta": "Output folder",
  "set.carpetaDesc": "Empty = next to the note.",
  "set.textos": "Texts",
  "set.textosDesc": 'Text that the format prints, like the footer notice. A note can override it from its frontmatter with {{fm.<field>}}.',
  "grupo.pie": "Footer",
  "set.personalizacion": "Customization",
  "set.personalizacionDesc":
    'These controls come from the tokenSchema of "{id}". Changes are saved as overrides and never touch the theme pack.',
  "set.restablecer": "Reset all",
  "set.volverAlTheme": "Back to the theme value",
  "set.noCarga": "Could not load the theme",
  "grupo.paleta": "Palette",
  "grupo.tipografia": "Typography",
  "grupo.portada": "Cover",
  "grupo.otros": "Other",
  "cmd.exportar": "Export to PDF",
  "cmd.exportarRapido": "Export to PDF with the last format (no prompt)",
  "ribbon": "Pressmark: export to PDF",
  "menu.exportar": "Pressmark: export to PDF",
  "notice.abriNota": "Open a Markdown note first.",
  "notice.exportando": "Exporting {n}…",
  "notice.noPudeExportar": "Could not export: {e}",
  "notice.noPudePreview": "Could not build the preview: {e}",
};

export type Clave = keyof typeof EN;

const ES: Partial<Record<Clave, string>> = {
  "modal.titulo": "Pressmark · Exportar a PDF",
  "modal.formato": "Formato",
  "modal.formatoDesc": "El theme pack que se aplica.",
  "modal.papel": "Tamaño de papel",
  "modal.delFormato": "El del formato",
  "modal.orientacion": "Orientación",
  "modal.vertical": "Vertical",
  "modal.horizontal": "Horizontal",
  "modal.margen": "Margen",
  "modal.margenDesc": "En milímetros, parejo en los cuatro lados. Vacío = el del formato.",
  "modal.margenPlaceholder": "del formato",
  "modal.margenInvalido": "El margen tiene que ser un número en milímetros.",
  "modal.portada": "Portada",
  "modal.portadaDesc": "El primer título y su metadata en carilla aparte.",
  "modal.conPortada": "Con portada",
  "modal.sinPortada": "Sin portada",
  "modal.carpeta": "Carpeta de salida",
  "modal.carpetaDesc": "Vacío = junto a la nota.",
  "modal.carpetaPlaceholder": "junto a la nota",
  "modal.abrir": "Abrir al terminar",
  "modal.cancelar": "Cancelar",
  "modal.exportar": "Exportar a PDF",
  "modal.carilla": "carilla {n}",
  "modal.errorFormato": "No pude cargar el formato: {e}",
  "info.vertical": "vertical",
  "info.horizontal": "horizontal",
  "info.margenes": "márgenes",
  "info.conPortada": "con portada",
  "info.sinPortada": "sin portada",
  "info.conPie": "con pie",
  "info.carillas": "~{n} carilla(s)",
  "info.propio": "propio",
  "set.exportacion": "Exportación",
  "set.themePack": "Theme pack",
  "set.themePackDesc": "El formato que se aplica al exportar.",
  "set.abrir": "Abrir el PDF al terminar",
  "set.carpeta": "Carpeta de salida",
  "set.carpetaDesc": "Vacío = junto a la nota.",
  "set.textos": "Textos",
  "set.textosDesc": 'Textos que el formato imprime, como el aviso del pie. Una nota puede pisarlos desde su frontmatter con {{fm.<campo>}}.',
  "grupo.pie": "Pie de página",
  "set.personalizacion": "Personalización",
  "set.personalizacionDesc":
    'Estos controles salen del tokenSchema de "{id}". Los cambios se guardan como overrides y no tocan el theme pack.',
  "set.restablecer": "Restablecer todo",
  "set.volverAlTheme": "Volver al valor del theme",
  "set.noCarga": "No pude cargar el theme",
  "grupo.paleta": "Paleta",
  "grupo.tipografia": "Tipografía",
  "grupo.portada": "Portada",
  "grupo.otros": "Otros",
  "cmd.exportar": "Exportar a PDF",
  "cmd.exportarRapido": "Exportar a PDF con el último formato (sin preguntar)",
  "ribbon": "Pressmark: exportar a PDF",
  "menu.exportar": "Pressmark: exportar a PDF",
  "notice.abriNota": "Abrí una nota de Markdown primero.",
  "notice.exportando": "Exportando {n}…",
  "notice.noPudeExportar": "No pude exportar: {e}",
  "notice.noPudePreview": "No pude preparar la vista previa: {e}",
};

const IDIOMAS: Record<string, Partial<Record<Clave, string>>> = { en: EN, es: ES };

let actual: Partial<Record<Clave, string>> = EN;
let locale = "en";

/** Se llama una vez al cargar el plugin. */
export function iniciarIdioma(): string {
  locale = idiomaDeObsidian();
  // Se reusa la misma cadena de respaldo que los theme packs, para que la UI y
  // el documento nunca queden en idiomas distintos.
  const disponibles: Record<string, string> = {};
  for (const k of Object.keys(IDIOMAS)) disponibles[k] = k;
  actual = IDIOMAS[resolve(disponibles, locale)] ?? EN;
  return locale;
}

/** El idioma resuelto, para pasarselo a los theme packs. */
export function idioma(): string {
  return locale;
}

/** Traduce. Una clave sin traducir cae al ingles, nunca a la clave cruda. */
export function t(clave: Clave, params?: Record<string, string | number>): string {
  let s = actual[clave] ?? EN[clave];
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
