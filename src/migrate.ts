/**
 * Migration of stored settings across renames.
 *
 * 0.2.0 renamed every user-facing identifier from Spanish to English: theme
 * ids, design tokens and vars. Settings saved by 0.1.0 point at names that no
 * longer exist, and without this a user who upgrades gets "could not load the
 * theme" and silently loses every customization they had made.
 *
 * Renames are cheap to do and expensive to get wrong. This module is the price.
 */
import type { Settings } from "./config";

const THEMES: Record<string, string> = {
  informe: "report",
  nota: "note",
  ejecutivo: "executive",
  tecnico: "technical",
  moderno: "modern",
  // `minimal` kept its name.
};

const TOKENS: Record<string, string> = {
  acento: "accent",
  "acento-tenue": "accent-soft",
  "acento-medio": "accent-mid",
  tinta: "ink",
  tenue: "muted",
  regla: "rule",
  "papel-codigo": "code-bg",
  aviso: "notice",
  "aviso-fondo": "notice-bg",
  fuente: "font",
  "fuente-mono": "font-mono",
  "fuente-titulo": "font-heading",
  "portada-offset": "cover-offset",
};

const VARS: Record<string, string> = {
  confidencialidad: "confidentiality",
};

/** Rewrites the keys of an object through a rename map, leaving unknowns alone. */
function renameKeys<V>(
  obj: Record<string, V> | undefined,
  map: Record<string, string>,
): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[map[k] ?? k] = v;
  return out;
}

/**
 * Brings settings saved by an older version up to date.
 *
 * Idempotent on purpose: it runs on every load, and a name that is already
 * current passes through untouched.
 */
export function migrateSettings(s: Settings): Settings {
  // `outputFolder` was a vault-relative path chosen once in settings. The save
  // dialog replaced it, and `lastDirectory` is an absolute path, so the old
  // value cannot be carried over — it is dropped rather than half-converted
  // into something that would point somewhere wrong.
  const { outputFolder: _dropped, ...rest } = s as Settings & { outputFolder?: string };

  const out: Settings = {
    ...rest,
    theme: THEMES[s.theme] ?? s.theme,
    overrides: {},
    overridesVars: {},
  };

  // Two levels: the theme id that keys the map, and the token names inside it.
  for (const [themeId, tokens] of Object.entries(s.overrides ?? {})) {
    out.overrides[THEMES[themeId] ?? themeId] = renameKeys(tokens, TOKENS);
  }
  for (const [themeId, vars] of Object.entries(s.overridesVars ?? {})) {
    out.overridesVars[THEMES[themeId] ?? themeId] = renameKeys(vars, VARS);
  }
  return out;
}
