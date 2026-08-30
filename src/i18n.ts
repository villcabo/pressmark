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
  "modal.outputFolder": "Output folder",
  "modal.outputFolderDesc": "Empty = next to the note.",
  "modal.outputFolderPlaceholder": "next to the note",
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
  "set.outputFolder": "Output folder",
  "set.outputFolderDesc": "Empty = next to the note.",
  "set.outputFolderPlaceholder": "Exports/",
  "set.texts": "Texts",
  "set.textsDesc":
    'Text that the format prints, like the footer notice. A note can override it from its frontmatter with {{fm.<field>}}.',
  "group.footer": "Footer",
  "set.customization": "Customization",
  "set.customizationDesc":
    'These controls come from the tokenSchema of "{id}". Changes are saved as overrides and never touch the theme pack.',
  "set.resetAll": "Reset all",
  "set.backToThemeValue": "Back to the theme value",
  "set.loadError": "Could not load the theme",
  "group.palette": "Palette",
  "group.typography": "Typography",
  "group.cover": "Cover",
  "group.other": "Other",
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
  "modal.outputFolder": "Carpeta de salida",
  "modal.outputFolderDesc": "Vacío = junto a la nota.",
  "modal.outputFolderPlaceholder": "junto a la nota",
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
  "set.outputFolder": "Carpeta de salida",
  "set.outputFolderDesc": "Vacío = junto a la nota.",
  "set.outputFolderPlaceholder": "Exportados/",
  "set.texts": "Textos",
  "set.textsDesc":
    'Textos que el formato imprime, como el aviso del pie. Una nota puede pisarlos desde su frontmatter con {{fm.<campo>}}.',
  "group.footer": "Pie de página",
  "set.customization": "Personalización",
  "set.customizationDesc":
    'Estos controles salen del tokenSchema de "{id}". Los cambios se guardan como overrides y no tocan el theme pack.',
  "set.resetAll": "Restablecer todo",
  "set.backToThemeValue": "Volver al valor del theme",
  "set.loadError": "No pude cargar el theme",
  "group.palette": "Paleta",
  "group.typography": "Tipografía",
  "group.cover": "Portada",
  "group.other": "Otros",
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
