/**
 * Turning customizations into a theme pack.
 *
 * The pure half of "save as format": deciding what the new pack should contain.
 * Writing it to disk needs the Vault API and lives in main.ts.
 */
import type { Theme } from "./theme";

/** Turns a display name into an id a folder and the schema both accept. */
export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents rather than drop the letter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // A leading underscore marks an internal pack, and a leading digit is fine
  // for the schema but reads oddly; an empty result needs *something*.
  return s || "custom";
}

export interface PackInput {
  name: string;
  /** The theme this one starts from. */
  base: string;
  /** Token overrides the user made, already keyed by token name. */
  tokens: Record<string, string>;
  /** Var overrides the user made. */
  vars: Record<string, string>;
}

/**
 * Builds the theme.json for a new pack.
 *
 * It stores ONLY what differs and inherits the rest. A pack that copied every
 * token would freeze the base theme's decisions at the moment it was created,
 * and stop benefiting from any later fix to them.
 */
export function buildThemePack(input: PackInput): { id: string; json: Theme } {
  const id = slugify(input.name);
  const json: Theme = {
    $schema: "../theme.schema.json",
    id,
    name: input.name.trim() || id,
    version: "1.0.0",
    extends: input.base,
  };

  if (Object.keys(input.tokens).length > 0) json.tokens = { ...input.tokens };
  if (Object.keys(input.vars).length > 0) json.vars = { ...input.vars };
  return { id, json };
}

/**
 * The stylesheet a new pack starts with.
 *
 * Empty of rules on purpose: everything the pack changes lives in theme.json,
 * and the file is here so there is an obvious place to go further.
 */
export function starterCSS(name: string, base: string): string {
  return `/* ${name} — layers on top of ${base}/theme.css.

   The palette, page geometry and footer text live in theme.json. This file is
   for anything CSS can do that tokens cannot: a different cover layout, a rule
   under headings, a table that reads differently.

   Note: theme.css may NOT declare :root or @page. Those come from theme.json,
   and the validator rejects them here. See docs/theme-format.md.
*/
`;
}
