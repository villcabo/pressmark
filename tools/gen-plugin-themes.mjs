#!/usr/bin/env bun
/**
 * Genera plugin/src/themes.generated.ts con los theme packs embebidos.
 *
 * Es el equivalente de go:embed para el plugin. Mismo motivo: themes/ es la
 * fuente de verdad, y cada consumidor se lleva su copia al build.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = join(RAIZ, "themes");

const packs = {};
for (const id of readdirSync(T).sort()) {
  const d = join(T, id);
  if (!statSync(d).isDirectory()) continue;
  packs[`${id}/theme.json`] = readFileSync(join(d, "theme.json"), "utf8");
  packs[`${id}/theme.css`] = readFileSync(join(d, "theme.css"), "utf8");
}

const salida = `// GENERADO POR tools/gen-plugin-themes.mjs — NO EDITAR A MANO.
// Fuente: themes/ en la raiz del repo. Regenerar con \`make sync-themes\`.
export const EMBEDDED: Record<string, string> = ${JSON.stringify(packs, null, 2)};
`;
writeFileSync(join(RAIZ, "plugin/src/themes.generated.ts"), salida);
console.log(`themes embebidos -> plugin/src/themes.generated.ts (${Object.keys(packs).length / 2} packs)`);
