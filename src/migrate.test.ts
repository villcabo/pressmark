import { describe, expect, test } from "bun:test";
import { migrateSettings } from "./migrate";
import { DEFAULT_SETTINGS, type Settings } from "./config";

const base = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe("migrateSettings", () => {
  test("renames the selected theme", () => {
    expect(migrateSettings(base({ theme: "moderno" })).theme).toBe("modern");
    expect(migrateSettings(base({ theme: "tecnico" })).theme).toBe("technical");
    expect(migrateSettings(base({ theme: "informe" })).theme).toBe("report");
  });

  test("leaves a name that never changed alone", () => {
    expect(migrateSettings(base({ theme: "minimal" })).theme).toBe("minimal");
  });

  test("leaves an unknown theme alone instead of losing it", () => {
    // A user's own pack. Rewriting it to something else would be worse than
    // leaving a name the loader will simply not find.
    expect(migrateSettings(base({ theme: "my-own-pack" })).theme).toBe("my-own-pack");
  });

  test("renames both the theme key and the token names inside it", () => {
    const out = migrateSettings(
      base({ overrides: { moderno: { acento: "#ff0000", "portada-offset": "40mm" } } }),
    );
    expect(out.overrides).toEqual({ modern: { accent: "#ff0000", "cover-offset": "40mm" } });
    expect(out.overrides["moderno"]).toBeUndefined();
  });

  test("renames var overrides", () => {
    const out = migrateSettings(
      base({ overridesVars: { informe: { confidencialidad: "Solo interno" } } }),
    );
    expect(out.overridesVars).toEqual({ report: { confidentiality: "Solo interno" } });
  });

  test("keeps the user's own token names", () => {
    const out = migrateSettings(base({ overrides: { minimal: { "mi-token": "x" } } }));
    expect(out.overrides).toEqual({ minimal: { "mi-token": "x" } });
  });

  test("is idempotent: running it twice changes nothing", () => {
    const once = migrateSettings(base({ theme: "tecnico", overrides: { tecnico: { tinta: "#000" } } }));
    expect(migrateSettings(once)).toEqual(once);
  });

  test("survives settings with nothing in them", () => {
    const out = migrateSettings(base());
    expect(out.overrides).toEqual({});
    expect(out.overridesVars).toEqual({});
  });
});
