#!/usr/bin/env node
/**
 * Validates every theme.json against theme.schema.json and against the token
 * contract. Runs in CI: an invalid theme pack reaches neither the CLI nor the
 * plugin.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const T = join(dirname(fileURLToPath(import.meta.url)), "..", "themes");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const schema = read(join(T, "theme.schema.json"));
const base = read(join(T, "_base", "theme.json"));
const declarados = new Set(Object.keys(base.tokenSchema ?? {}));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const errors = [];
const dirs = readdirSync(T).filter((n) => statSync(join(T, n)).isDirectory()).sort();

for (const name of dirs) {
  const d = join(T, name);
  const fj = join(d, "theme.json");
  const fc = join(d, "theme.css");

  if (!existsSync(fj)) { errors.push(`${name}: missing theme.json`); continue; }
  if (!existsSync(fc)) errors.push(`${name}: missing theme.css`);

  const t = read(fj);

  if (!validate(t)) {
    for (const e of validate.errors) {
      errors.push(`${name}: ${e.instancePath || "(raiz)"} ${e.message}`);
    }
  }

  if (t.id !== name) errors.push(`${name}: id "${t.id}" does not match the folder name`);

  const own = new Set(Object.keys(t.tokenSchema ?? {}));
  const orphans = Object.keys(t.tokens ?? {})
    .filter((k) => !declarados.has(k) && !own.has(k));
  if (orphans.length) {
    errors.push(`${name}: tokens not declared in tokenSchema: ${orphans.join(", ")}`);
  }

  // A varSchema declaring a var that does not exist is a form editing something
  // the footer will never read.
  const declared = Object.keys(t.varSchema ?? {});
  const existing = new Set(Object.keys(t.vars ?? {}));
  const phantom = declared.filter((k) => !existing.has(k));
  if (phantom.length) {
    errors.push(`${name}: varSchema declares vars that do not exist: ${phantom.join(", ")}`);
  }

  const parent = "extends" in t ? t.extends : "_base";
  if (parent !== null && !existsSync(join(T, parent))) {
    errors.push(`${name}: extends "${parent}" does not exist`);
  }

  // Page geometry and the palette live ONLY in theme.json.
  if (existsSync(fc)) {
    for (const [i, linea] of readFileSync(fc, "utf8").split("\n").entries()) {
      const s = linea.trim();
      if (s.startsWith("@page") || s.startsWith(":root")) {
        errors.push(
          `${name}: theme.css:${i + 1} declares "${s.slice(0, 24)}" — that belongs in theme.json`,
        );
      }
      // The modern fragmentation properties belong to the multicolumn module,
      // and Obsidian's CSS lint flags them as only partially supported. The
      // legacy page-break-* aliases do the same thing in paged media and are
      // universally supported, so those are the ones this project uses.
      const modern = /(?<![-\w])(break-(?:after|before|inside))\s*:/.exec(s);
      if (modern) {
        errors.push(
          `${name}: theme.css:${i + 1} uses "${modern[1]}" — use "page-${modern[1]}" instead`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join("\n"));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`✓ ${dirs.length} theme packs valid (schema + token contract)`);
