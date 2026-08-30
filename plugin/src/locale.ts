/**
 * Locale-based text resolution.
 *
 * TWIN of theme.Localized in Go (cli/internal/theme/locale.go). Both run
 * testdata/conformance/locale.json.
 */

/** A user-facing text: a plain string, or an object keyed by language. */
export type Localized = string | Record<string, string>;

const base = (s: string): string => {
  const i = s.indexOf("-");
  return i > 0 ? s.slice(0, i) : s;
};

/**
 * Picks the text for a locale. Fallback chain, in order:
 *
 *   1. exact match             (pt-BR asks for pt-BR)
 *   2. the request's base lang (pt-BR falls back to pt)
 *   3. any variant of that language, the FIRST alphabetically
 *   4. en
 *   5. any variant of en
 *   6. the first key alphabetically
 *
 * The alphabetical order isn't a whim: without a stable rule, this
 * implementation and the Go one could pick different texts.
 */
export function resolve(v: Localized | undefined, locale: string): string {
  if (v === undefined) return "";
  if (typeof v === "string") return v;

  const keys = Object.keys(v).sort();
  if (keys.length === 0) return "";

  const l = (locale ?? "").trim() || "en";
  const exact = v[l];
  if (exact !== undefined) return exact;

  for (const candidate of [base(l), "en"]) {
    const direct = v[candidate];
    if (direct !== undefined) return direct;
    const variant = keys.find((k) => base(k) === candidate);
    if (variant !== undefined) return v[variant]!;
  }
  return v[keys[0]!]!;
}

/**
 * Obsidian's language.
 *
 * getLanguage() has been official API since 1.8.7 and the manifest declares
 * 1.4.0, so it can't be called blindly: it doesn't exist on an old version.
 * Falls back to localStorage, which is where the app itself reads it from.
 */
export function obsidianLanguage(): string {
  try {
    const mod = require("obsidian") as { getLanguage?: () => string };
    if (typeof mod.getLanguage === "function") {
      const l = mod.getLanguage();
      if (l) return l;
    }
  } catch {
    /* fall back below */
  }
  try {
    return window.localStorage.getItem("language") || "en";
  } catch {
    return "en";
  }
}
