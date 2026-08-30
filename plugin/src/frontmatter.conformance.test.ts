/**
 * Corre EXACTAMENTE los mismos casos que el separador de frontmatter de Go.
 * Fixture compartido: testdata/conformance/frontmatter.json
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeVars, splitFrontmatter, tituloDesde } from "./document";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const casos = JSON.parse(
  readFileSync(join(RAIZ, "testdata/conformance/frontmatter.json"), "utf8"),
) as Caso[];

interface Caso {
  name: string;
  why: string;
  in: string;
  campos: Record<string, string> | null;
  cuerpo: string;
}

describe("frontmatter (fixture compartido con Go)", () => {
  test("hay casos que correr", () => {
    expect(casos.length).toBeGreaterThan(0);
  });

  for (const c of casos) {
    test(c.name, () => {
      const { campos, cuerpo } = splitFrontmatter(c.in);
      expect(cuerpo, `${c.why} | cuerpo`).toBe(c.cuerpo);
      expect(campos, `${c.why} | campos`).toEqual(c.campos);
    });
  }
});

describe("titulo y vars", () => {
  test("el frontmatter le gana al h1", () => {
    expect(tituloDesde({ title: "Del frontmatter" }, "# Del h1", "x")).toBe("Del frontmatter");
    expect(tituloDesde(null, "# Del h1", "x")).toBe("Del h1");
    expect(tituloDesde(null, "sin titulo", "del archivo")).toBe("del archivo");
  });

  test("los campos quedan accesibles como fm.clave", () => {
    expect(mergeVars({ a: "1" }, { sistema: "PGW" }, "es")).toEqual({ a: "1", "fm.sistema": "PGW" });
    expect(mergeVars({ a: "1" }, null, "es")).toEqual({ a: "1" });
    expect(mergeVars(undefined, null, "es")).toEqual({});
  });
});
