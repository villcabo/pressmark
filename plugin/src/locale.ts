/**
 * Resolucion de textos por idioma.
 *
 * GEMELO de theme.Localized en Go (cli/internal/theme/locale.go). Los dos
 * corren testdata/conformance/locale.json.
 */

/** Un texto para el usuario: cadena suelta, o un objeto por idioma. */
export type Localized = string | Record<string, string>;

const base = (s: string): string => {
  const i = s.indexOf("-");
  return i > 0 ? s.slice(0, i) : s;
};

/**
 * Elige el texto para un idioma. Cadena de respaldo, en orden:
 *
 *   1. coincidencia exacta        (pt-BR pide pt-BR)
 *   2. el idioma base del pedido  (pt-BR cae en pt)
 *   3. cualquier variante de ese idioma, la PRIMERA alfabeticamente
 *   4. en
 *   5. cualquier variante de en
 *   6. la primera clave alfabeticamente
 *
 * El orden alfabetico no es capricho: sin un criterio estable, esta
 * implementacion y la de Go podrian elegir textos distintos.
 */
export function resolve(v: Localized | undefined, locale: string): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;

  const claves = Object.keys(v).sort();
  if (claves.length === 0) return "";

  const l = (locale ?? "").trim() || "en";
  const exacto = v[l];
  if (exacto !== undefined) return exacto;

  for (const cand of [base(l), "en"]) {
    const directo = v[cand];
    if (directo !== undefined) return directo;
    const variante = claves.find((k) => base(k) === cand);
    if (variante !== undefined) return v[variante]!;
  }
  return v[claves[0]!]!;
}

/**
 * El idioma de Obsidian.
 *
 * getLanguage() es API oficial desde 1.8.7 y el manifest declara 1.4.0, asi
 * que no se puede llamar a ciegas: en una version vieja no existe. Se cae a
 * localStorage, que es de donde la lee la propia app.
 */
export function idiomaDeObsidian(): string {
  try {
    const mod = require("obsidian") as { getLanguage?: () => string };
    if (typeof mod.getLanguage === "function") {
      const l = mod.getLanguage();
      if (l) return l;
    }
  } catch {
    /* se intenta el respaldo */
  }
  try {
    return window.localStorage.getItem("language") || "en";
  } catch {
    return "en";
  }
}
