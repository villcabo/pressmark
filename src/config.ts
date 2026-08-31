/**
 * Stored settings shape.
 *
 * Kept apart from settings.ts on purpose: that file imports Obsidian, and
 * anything that imports it cannot be unit tested outside the app. The data
 * shape and its migration are exactly what needs testing, so they live here.
 */

export interface Settings {
  theme: string;
  /** Token overrides by theme: { [themeId]: { [token]: value } } */
  overrides: Record<string, Record<string, string>>;
  /**
   * Var overrides by theme. Kept separate from token overrides because
   * they're not the same thing: a token is visual identity, a var is TEXT
   * that gets printed, and a note's frontmatter can override it. Final
   * precedence: frontmatter > this override > the theme pack's value.
   */
  overridesVars: Record<string, Record<string, string>>;
  openWhenDone: boolean;
  /**
   * Where the last export landed. Remembered so a second export starts in the
   * same place, and NOT exposed as a setting: the save dialog is the place to
   * decide that, once per document.
   */
  lastDirectory: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "report",
  overrides: {},
  overridesVars: {},
  openWhenDone: true,
  lastDirectory: "",
};
