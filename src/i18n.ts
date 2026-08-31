/**
 * Strings for the plugin's interface.
 *
 * English is the base language and the fallback: it's what the community
 * store expects and what anyone without their language translated sees.
 *
 * Only languages that can genuinely be reviewed are included. Dropping in
 * machine translations of languages nobody on the project reads is worse than
 * not having them: they end up wrong and nobody notices. Adding one means
 * adding an entry here; missing keys fall through to English on their own.
 */
import { getLanguage } from "obsidian";
import { resolve } from "./locale";

const EN = {
  "modal.title": "Pressmark · Export to PDF",
  "modal.format": "Format",
  "modal.formatDesc": "The theme pack to apply.",
  "modal.paperSize": "Paper size",
  "modal.fromFormat": "From the format",
  "modal.orientation": "Orientation",
  "modal.portrait": "Portrait",
  "modal.landscape": "Landscape",
  "modal.margin": "Margin",
  "modal.marginDesc": "In millimetres, even on all four sides. Empty = from the format.",
  "modal.marginPlaceholder": "from the format",
  "modal.marginInvalid": "The margin must be a number in millimetres.",
  "modal.cover": "Cover page",
  "modal.coverDesc": "The first heading and its metadata on their own page.",
  "modal.withCover": "With cover",
  "modal.withoutCover": "Without cover",
  "modal.openWhenDone": "Open when finished",
  "modal.cancel": "Cancel",
  "modal.export": "Export to PDF",
  "modal.page": "page {n}",
  "modal.formatError": "Could not load the format: {e}",
  "info.portrait": "portrait",
  "info.landscape": "landscape",
  "info.margins": "margins",
  "info.withCover": "with cover",
  "info.withoutCover": "without cover",
  "info.withFooter": "with footer",
  "info.pages": "~{n} page(s)",
  "info.custom": "custom",
  "set.export": "Export",
  "set.themePack": "Theme pack",
  "set.themePackDesc": "The format applied when exporting.",
  "set.openWhenDone": "Open the PDF when finished",
  "set.texts": "Texts",
  "set.textsDesc":
    'Text that the format prints, like the footer notice. A note can override it from its frontmatter with {{fm.<field>}}.',
  "group.footer": "Footer",
  "set.customization": "Customization",
  "set.customizationDesc":
    'These controls come from the tokenSchema of "{id}". Changes are saved as overrides and never touch the theme pack.',
  "set.resetAll": "Reset all",
  "set.clearToReset": "Clear a field to go back to the format's own value.",
  "set.loadError": "Could not load the theme",
  "group.palette": "Palette",
  "group.typography": "Typography",
  "group.cover": "Cover",
  "group.other": "Other",
  "pack.save": "Save",
  "pack.title": "Save as a new format",
  "pack.placeholder": "Format name",
  "pack.willBeSavedAs": "Will be saved as {id}",
  "pack.idTaken": "A format called {id} already exists",
  "pack.saved": "Saved as {name}. It is now selected.",
  "pack.nothingToSave": "Change a colour or a text first: there is nothing to save yet.",
  "pack.saveError": "Could not save the format: {e}",
  "cmd.saveAsFormat": "Save current customizations as a new format",
  "set.saveAsFormat": "Save as a new format",
  "set.saveAsFormatDesc": "Turns your changes into a format you can share: a folder you can commit to a repository and copy into someone else's vault.",
  "designer.title": "Theme designer",
  "designer.open": "Open the theme designer",
  "designer.basedOn": "Based on",
  "designer.document": "Document",
  "designer.activeNote": "The note I have open",
  "designer.zoom": "Zoom",
  "designer.zoomFit": "Fit",
  "designer.zoomHint": "Alt + scroll to zoom",
  "designer.untitled": "Untitled",
  "designer.noActiveNote": "# No note open\n\nOpen a Markdown note, or pick one of the samples above.",
  "set.openDesigner": "Theme designer",
  "set.openDesignerDesc": "Build a format with the document in front of you: change a colour and watch the page change.",
  "set.open": "Open",
  "sample.01-report": "Report",
  "sample.02-technical-spec": "Technical spec",
  "sample.03-note": "Short note",
  "sample.04-diagrams": "Diagrams",
  "sample.05-typography": "Typography",
  "cmd.export": "Export to PDF",
  "cmd.exportQuick": "Export to PDF with the last format (no prompt)",
  "ribbon": "Pressmark: export to PDF",
  "menu.export": "Pressmark: export to PDF",
  "notice.openNote": "Open a Markdown note first.",
  "notice.exporting": "Exporting {n}…",
  "notice.exportError": "Could not export: {e}",
  "notice.previewError": "Could not build the preview: {e}",
};

export type Key = keyof typeof EN;

const ES: Partial<Record<Key, string>> = {
  "modal.title": "Pressmark · Exportar a PDF",
  "modal.format": "Formato",
  "modal.formatDesc": "El theme pack que se aplica.",
  "modal.paperSize": "Tamaño de papel",
  "modal.fromFormat": "El del formato",
  "modal.orientation": "Orientación",
  "modal.portrait": "Vertical",
  "modal.landscape": "Horizontal",
  "modal.margin": "Margen",
  "modal.marginDesc": "En milímetros, parejo en los cuatro lados. Vacío = el del formato.",
  "modal.marginPlaceholder": "del formato",
  "modal.marginInvalid": "El margen tiene que ser un número en milímetros.",
  "modal.cover": "Portada",
  "modal.coverDesc": "El primer título y su metadata en carilla aparte.",
  "modal.withCover": "Con portada",
  "modal.withoutCover": "Sin portada",
  "modal.openWhenDone": "Abrir al terminar",
  "modal.cancel": "Cancelar",
  "modal.export": "Exportar a PDF",
  "modal.page": "carilla {n}",
  "modal.formatError": "No pude cargar el formato: {e}",
  "info.portrait": "vertical",
  "info.landscape": "horizontal",
  "info.margins": "márgenes",
  "info.withCover": "con portada",
  "info.withoutCover": "sin portada",
  "info.withFooter": "con pie",
  "info.pages": "~{n} carilla(s)",
  "info.custom": "propio",
  "set.export": "Exportación",
  "set.themePack": "Theme pack",
  "set.themePackDesc": "El formato que se aplica al exportar.",
  "set.openWhenDone": "Abrir el PDF al terminar",
  "set.texts": "Textos",
  "set.textsDesc":
    'Textos que el formato imprime, como el aviso del pie. Una nota puede pisarlos desde su frontmatter con {{fm.<campo>}}.',
  "group.footer": "Pie de página",
  "set.customization": "Personalización",
  "set.customizationDesc":
    'Estos controles salen del tokenSchema de "{id}". Los cambios se guardan como overrides y no tocan el theme pack.',
  "set.resetAll": "Restablecer todo",
  "set.clearToReset": "Vaciá un campo para volver al valor del formato.",
  "set.loadError": "No pude cargar el theme",
  "group.palette": "Paleta",
  "group.typography": "Tipografía",
  "group.cover": "Portada",
  "group.other": "Otros",
  "pack.save": "Guardar",
  "pack.title": "Guardar como formato nuevo",
  "pack.placeholder": "Nombre del formato",
  "pack.willBeSavedAs": "Se va a guardar como {id}",
  "pack.idTaken": "Ya existe un formato llamado {id}",
  "pack.saved": "Guardado como {name}. Ya quedó seleccionado.",
  "pack.nothingToSave": "Cambiá un color o un texto primero: todavía no hay nada que guardar.",
  "pack.saveError": "No pude guardar el formato: {e}",
  "cmd.saveAsFormat": "Guardar la personalización actual como formato nuevo",
  "set.saveAsFormat": "Guardar como formato nuevo",
  "set.saveAsFormatDesc": "Convierte tus cambios en un formato compartible: una carpeta que podés versionar en un repositorio y copiar al vault de otra persona.",
  "designer.title": "Diseñador de formatos",
  "designer.open": "Abrir el diseñador de formatos",
  "designer.basedOn": "Basado en",
  "designer.document": "Documento",
  "designer.activeNote": "La nota que tengo abierta",
  "designer.zoom": "Zoom",
  "designer.zoomFit": "Ajustar",
  "designer.zoomHint": "Alt + rueda para acercar",
  "designer.untitled": "Sin título",
  "designer.noActiveNote": "# No hay ninguna nota abierta\n\nAbrí una nota de Markdown, o elegí uno de los ejemplos de arriba.",
  "set.openDesigner": "Diseñador de formatos",
  "set.openDesignerDesc": "Armá un formato con el documento delante: cambiá un color y mirá cómo cambia la página.",
  "set.open": "Abrir",
  "sample.01-report": "Informe",
  "sample.02-technical-spec": "Especificación técnica",
  "sample.03-note": "Nota breve",
  "sample.04-diagrams": "Diagramas",
  "sample.05-typography": "Tipografía",
  "cmd.export": "Exportar a PDF",
  "cmd.exportQuick": "Exportar a PDF con el último formato (sin preguntar)",
  "ribbon": "Pressmark: exportar a PDF",
  "menu.export": "Pressmark: exportar a PDF",
  "notice.openNote": "Abrí una nota de Markdown primero.",
  "notice.exporting": "Exportando {n}…",
  "notice.exportError": "No pude exportar: {e}",
  "notice.previewError": "No pude preparar la vista previa: {e}",
};

const LANGUAGES: Record<string, Partial<Record<Key, string>>> = { en: EN, es: ES };

let current: Partial<Record<Key, string>> = EN;
let locale = "en";

/** Called once when the plugin loads. */
export function initLanguage(): string {
  // getLanguage() is official API as of 1.8.7, which the manifest requires.
  // Reading the app's own private storage would work too, but it reaches into
  // internals for something the API already exposes.
  locale = getLanguage() || "en";
  // Reuses the same fallback chain as the theme packs, so the UI and the
  // document never end up in different languages.
  const available: Record<string, string> = {};
  for (const k of Object.keys(LANGUAGES)) available[k] = k;
  current = LANGUAGES[resolve(available, locale)] ?? EN;
  return locale;
}

/** The resolved language, to pass along to the theme packs. */
export function language(): string {
  return locale;
}

/** Translates. An untranslated key falls back to English, never to the raw key. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s = current[key] ?? EN[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
