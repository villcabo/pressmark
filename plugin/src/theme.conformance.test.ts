/**
 * Corre EXACTAMENTE los mismos casos que el cargador de Go.
 * Ver testdata/conformance/README.md.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load, type ThemeFS } from "./theme";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const casos = JSON.parse(
  readFileSync(join(RAIZ, "testdata/conformance/cases.json"), "utf8"),
) as Caso[];

interface Caso {
  name: string;
  why: string;
  packs: Record<string, { json: unknown; css: string }>;
  load: string;
  expect?: Record<string, unknown>;
  expectError?: string;
}

function fsDe(packs: Caso["packs"]): ThemeFS {
  const archivos = new Map<string, string>();
  for (const [id, p] of Object.entries(packs)) {
    archivos.set(`${id}/theme.json`, JSON.stringify(p.json));
    archivos.set(`${id}/theme.css`, p.css);
  }
  return { read: async (ruta) => archivos.get(ruta) ?? null };
}

const norm = (s: string) =>
  s.replace(/\/\* ── [^─]* ── \*\//g, " ").replace(/\s+/g, " ").trim();

/** Compara solo las claves presentes en lo esperado, como el runner de Go. */
function parcial(quiere: unknown, obtuvo: unknown, ruta: string): void {
  if (quiere !== null && typeof quiere === "object" && !Array.isArray(quiere)) {
    expect(obtuvo, `${ruta}: esperaba un objeto`).toBeObject();
    for (const [k, v] of Object.entries(quiere)) {
      parcial(v, (obtuvo as Record<string, unknown>)[k], `${ruta}.${k}`);
    }
    return;
  }
  expect(obtuvo, ruta).toEqual(quiere as never);
}

describe("conformidad de herencia (compartida con el cargador de Go)", () => {
  test("hay casos que correr", () => {
    expect(casos.length).toBeGreaterThan(0);
  });

  for (const c of casos) {
    test(c.name, async () => {
      const fs = fsDe(c.packs);

      if (c.expectError) {
        let err: unknown;
        try {
          await load(fs, c.load);
        } catch (e) {
          err = e;
        }
        expect(err, `${c.why}\n  esperaba error con "${c.expectError}"`).toBeDefined();
        expect(String((err as Error).message)).toContain(c.expectError);
        return;
      }

      const got = await load(fs, c.load);
      const esperado = { ...(c.expect ?? {}) };

      if ("css" in esperado) {
        expect(norm(got.css), c.why).toBe(norm(esperado["css"] as string));
        delete esperado["css"];
      }
      if ("chain" in esperado) {
        expect(got.chain, c.why).toEqual(esperado["chain"] as string[]);
        delete esperado["chain"];
      }
      for (const [k, v] of Object.entries(esperado)) {
        parcial(v, (got as unknown as Record<string, unknown>)[k], k);
      }
    });
  }
});
