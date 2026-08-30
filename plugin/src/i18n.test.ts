import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(join(SRC, "i18n.ts"), "utf8");

/** Saca las claves de un bloque de traduccion del propio archivo. */
function clavesDe(nombre: string): string[] {
  const i = fuente.indexOf(`const ${nombre}`);
  const fin = fuente.indexOf("\n};", i);
  return [...fuente.slice(i, fin).matchAll(/^\s+"([a-zA-Z.]+)":/gm)].map((m) => m[1]!);
}

describe("i18n", () => {
  const en = clavesDe("EN");
  const es = clavesDe("ES");

  test("el ingles tiene claves", () => {
    expect(en.length).toBeGreaterThan(20);
  });

  test("el español cubre todas las claves del ingles", () => {
    // Una clave sin traducir no rompe (cae al ingles), pero se nota: si esta
    // lista crece, la UI queda mezclada en dos idiomas.
    const faltan = en.filter((k) => !es.includes(k));
    expect(faltan, `sin traducir al español: ${faltan.join(", ")}`).toEqual([]);
  });

  test("el español no tiene claves huerfanas", () => {
    // Una clave que ya no existe en ingles es codigo muerto que enmascara un
    // renombre mal hecho.
    const sobran = es.filter((k) => !en.includes(k));
    expect(sobran, `no existen en ingles: ${sobran.join(", ")}`).toEqual([]);
  });
});

describe("no queda texto en duro en la UI", () => {
  // Cadenas con tilde o ñ dentro de llamadas a la API de Obsidian: si aparecen
  // fuera de i18n.ts, alguien escribio texto sin pasar por t().
  const SOSPECHOSO =
    /\.(setName|setDesc|setTitle|setButtonText|setTooltip|setPlaceholder|addOption)\([^)]*["'`][^"'`]*[áéíóúñÁÉÍÓÚÑ¿¡][^"'`]*["'`]/;

  for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && !n.includes("test") && n !== "i18n.ts")) {
    test(f, () => {
      const lineas = readFileSync(join(SRC, f), "utf8").split("\n");
      const malas = lineas
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => SOSPECHOSO.test(l))
        .map(([n, l]) => `${n}: ${l.trim()}`);
      expect(malas, `texto sin traducir en ${f}`).toEqual([]);
    });
  }
});
