#!/usr/bin/env bun
/**
 * Valida cada theme.json contra theme.schema.json y contra el contrato de tokens.
 * Se ejecuta en CI: un theme pack invalido no llega ni al CLI ni al plugin.
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

  if (!existsSync(fj)) { errores.push(`${nombre}: falta theme.json`); continue; }
  if (!existsSync(fc)) errores.push(`${nombre}: falta theme.css`);

  const t = leer(fj);

  if (!valida(t)) {
    for (const e of valida.errors) {
      errores.push(`${nombre}: ${e.instancePath || "(raiz)"} ${e.message}`);
    }
  }

  if (t.id !== nombre) errores.push(`${nombre}: id "${t.id}" no coincide con la carpeta`);

  const propios = new Set(Object.keys(t.tokenSchema ?? {}));
  const huerfanos = Object.keys(t.tokens ?? {})
    .filter((k) => !declarados.has(k) && !propios.has(k));
  if (huerfanos.length) {
    errores.push(`${nombre}: tokens sin declarar en tokenSchema: ${huerfanos.join(", ")}`);
  }

  // Un varSchema que declara una var inexistente es un formulario que edita
  // algo que el pie nunca va a leer.
  const declaradas = Object.keys(t.varSchema ?? {});
  const existentes = new Set(Object.keys(t.vars ?? {}));
  const fantasma = declaradas.filter((k) => !existentes.has(k));
  if (fantasma.length) {
    errores.push(`${nombre}: varSchema declara vars que no existen: ${fantasma.join(", ")}`);
  }

  const padre = "extends" in t ? t.extends : "_base";
  if (padre !== null && !existsSync(join(T, padre))) {
    errores.push(`${nombre}: extends "${padre}" no existe`);
  }

  // La geometria de pagina y la paleta viven SOLO en theme.json.
  if (existsSync(fc)) {
    for (const [i, linea] of readFileSync(fc, "utf8").split("\n").entries()) {
      const s = linea.trim();
      if (s.startsWith("@page") || s.startsWith(":root")) {
        errores.push(`${nombre}: theme.css:${i + 1} declara "${s.slice(0, 24)}" — eso va en theme.json`);
      }
    }
  }
}

if (errores.length) {
  console.error(errores.map((e) => `  ✗ ${e}`).join("\n"));
  console.error(`\n${errores.length} error(es)`);
  process.exit(1);
}
console.log(`✓ ${dirs.length} theme packs validos (esquema + contrato de tokens)`);
