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
const leer = (p) => JSON.parse(readFileSync(p, "utf8"));

const schema = leer(join(T, "theme.schema.json"));
const base = leer(join(T, "_base", "theme.json"));
const declarados = new Set(Object.keys(base.tokenSchema ?? {}));

const ajv = new Ajv({ allErrors: true, strict: false });
const valida = ajv.compile(schema);

const errores = [];
const dirs = readdirSync(T).filter((n) => statSync(join(T, n)).isDirectory()).sort();

for (const nombre of dirs) {
  const d = join(T, nombre);
  const fj = join(d, "theme.json");
  const fc = join(d, "theme.css");

  if (!existsSync(fj)) { errores.push(`${nombre}: missing theme.json`); continue; }
  if (!existsSync(fc)) errores.push(`${nombre}: missing theme.css`);

  const t = leer(fj);

  if (!valida(t)) {
    for (const e of valida.errors) {
      errores.push(`${nombre}: ${e.instancePath || "(raiz)"} ${e.message}`);
    }
  }

  if (t.id !== nombre) errores.push(`${nombre}: id "${t.id}" does not match the folder name`);

  const propios = new Set(Object.keys(t.tokenSchema ?? {}));
  const huerfanos = Object.keys(t.tokens ?? {})
    .filter((k) => !declarados.has(k) && !propios.has(k));
  if (huerfanos.length) {
    errores.push(`${nombre}: tokens not declared in tokenSchema: ${huerfanos.join(", ")}`);
  }

  // A varSchema declaring a var that does not exist is a form editing something
  // the footer will never read.
  const declaradas = Object.keys(t.varSchema ?? {});
  const existentes = new Set(Object.keys(t.vars ?? {}));
  const fantasma = declaradas.filter((k) => !existentes.has(k));
  if (fantasma.length) {
    errores.push(`${nombre}: varSchema declares vars that do not exist: ${fantasma.join(", ")}`);
  }

  const padre = "extends" in t ? t.extends : "_base";
  if (padre !== null && !existsSync(join(T, padre))) {
    errores.push(`${nombre}: extends "${padre}" does not exist`);
  }

  // Page geometry and the palette live ONLY in theme.json.
  if (existsSync(fc)) {
    for (const [i, linea] of readFileSync(fc, "utf8").split("\n").entries()) {
      const s = linea.trim();
      if (s.startsWith("@page") || s.startsWith(":root")) {
        errores.push(`${nombre}: theme.css:${i + 1} declara "${s.slice(0, 24)}" — that belongs in theme.json`);
      }
    }
  }
}

if (errores.length) {
  console.error(errores.map((e) => `  ✗ ${e}`).join("\n"));
  console.error(`\n${errores.length} error(s)`);
  process.exit(1);
}
console.log(`✓ ${dirs.length} theme packs valid (schema + token contract)`);
