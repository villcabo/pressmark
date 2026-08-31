import { describe, expect, test } from "bun:test";
import { buildThemePack, slugify, starterCSS } from "./pack";

describe("slugify", () => {
  test("makes a name into an id the schema accepts", () => {
    expect(slugify("Síntesis Report")).toBe("sintesis-report");
    expect(slugify("  Mi Formato  ")).toBe("mi-formato");
    expect(slugify("A/B — test!")).toBe("a-b-test");
  });

  test("strips accents rather than dropping the letter", () => {
    // "Informe Técnico" losing its é would read as "informe-tcnico".
    expect(slugify("Informe Técnico")).toBe("informe-tecnico");
    expect(slugify("Diseño")).toBe("diseno");
  });

  test("never returns something unusable", () => {
    expect(slugify("!!!")).toBe("custom");
    expect(slugify("")).toBe("custom");
  });

  test("the result matches the schema's id pattern", () => {
    const pattern = /^_?[a-z0-9][a-z0-9-]*$/;
    for (const n of ["Síntesis", "My Format 2", "a", "ÁÉÍ"]) {
      expect(pattern.test(slugify(n)), `${n} -> ${slugify(n)}`).toBe(true);
    }
  });
});

describe("buildThemePack", () => {
  test("stores only what differs and inherits the rest", () => {
    // Copying every token would freeze the base theme's decisions at the moment
    // the pack was created, and stop it benefiting from any later fix.
    const { id, json } = buildThemePack({
      name: "Síntesis",
      base: "report",
      tokens: { accent: "#0a3d62" },
      vars: { confidentiality: "Síntesis · Confidencial" },
    });
    expect(id).toBe("sintesis");
    expect(json.extends).toBe("report");
    expect(json.tokens).toEqual({ accent: "#0a3d62" });
    expect(json.vars).toEqual({ confidentiality: "Síntesis · Confidencial" });
    expect(json.id).toBe("sintesis");
    expect(json.version).toBe("1.0.0");
  });

  test("omits empty sections instead of writing empty objects", () => {
    const { json } = buildThemePack({ name: "Plain", base: "note", tokens: {}, vars: {} });
    expect("tokens" in json).toBe(false);
    expect("vars" in json).toBe(false);
  });

  test("keeps the display name as typed", () => {
    const { json } = buildThemePack({ name: "Informe Técnico", base: "report", tokens: {}, vars: {} });
    expect(json.name).toBe("Informe Técnico");
    expect(json.id).toBe("informe-tecnico");
  });
});

describe("starterCSS", () => {
  test("says what may not go in it", () => {
    // The validator rejects :root and @page here; the file should say so before
    // someone spends an afternoon finding out.
    const css = starterCSS("Síntesis", "report");
    expect(css).toContain(":root");
    expect(css).toContain("@page");
    expect(css).toContain("theme.json");
  });

  test("declares no rules of its own", () => {
    // Stripped of comments there should be nothing left: everything the pack
    // changes lives in theme.json.
    const bare = starterCSS("x", "report").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(bare).toBe("");
  });
});
