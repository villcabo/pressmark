/**
 * Corre EXACTAMENTE los mismos casos que theme.Localized.Resolve de Go.
 * Fixture compartido: testdata/conformance/locale.json
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve, type Localized } from "./locale";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const casos = JSON.parse(
  readFileSync(join(RAIZ, "testdata/conformance/locale.json"), "utf8"),
) as { name: string; why: string; valor: Localized; locale: string; quiere: string }[];

describe("locale (fixture compartido con Go)", () => {
  test("hay casos que correr", () => {
    expect(casos.length).toBeGreaterThan(0);
  });

  for (const c of casos) {
    test(c.name, () => {
      expect(resolve(c.valor, c.locale), c.why).toBe(c.quiere);
    });
  }

  test("undefined devuelve vacio y no rompe", () => {
    expect(resolve(undefined, "es")).toBe("");
  });
});
