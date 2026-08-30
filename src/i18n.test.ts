import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(SRC, "i18n.ts"), "utf8");

/** Pulls the keys out of a translation block in the file itself. */
function keysOf(name: string): string[] {
  const i = source.indexOf(`const ${name}`);
  const end = source.indexOf("\n};", i);
  return [...source.slice(i, end).matchAll(/^\s+"([a-zA-Z.]+)":/gm)].map((m) => m[1]!);
}

describe("i18n", () => {
  const en = keysOf("EN");
  const es = keysOf("ES");

  test("english has keys", () => {
    expect(en.length).toBeGreaterThan(20);
  });

  test("spanish covers every english key", () => {
    // An untranslated key doesn't break anything (it falls back to English),
    // but it shows: if this list grows, the UI ends up mixing two languages.
    const missing = en.filter((k) => !es.includes(k));
    expect(missing, `not translated to spanish: ${missing.join(", ")}`).toEqual([]);
  });

  test("spanish has no orphaned keys", () => {
    // A key that no longer exists in english is dead code masking a botched
    // rename.
    const extra = es.filter((k) => !en.includes(k));
    expect(extra, `don't exist in english: ${extra.join(", ")}`).toEqual([]);
  });
});

describe("every key is used", () => {
  // A key nobody calls is dead weight: it hides a botched rename, and it costs
  // whoever translates the plugin their time on a string no one will read.
  test("no orphan keys", () => {
    const en = keysOf("EN");
    const sources = readdirSync(SRC)
      .filter((n) => n.endsWith(".ts") && !n.includes("test") && n !== "i18n.ts")
      .map((n) => readFileSync(join(SRC, n), "utf8"))
      .join("\n");

    // Some keys are composed at runtime — t(`group.${g}`) — so the literal
    // never appears. Their prefix does, and that is what counts as a use.
    const dynamicPrefixes = [...sources.matchAll(/`([a-z]+)\.\$\{/g)].map((m) => `${m[1]}.`);

    const orphans = en.filter(
      (k) => !sources.includes(`"${k}"`) && !dynamicPrefixes.some((p) => k.startsWith(p)),
    );
    expect(orphans, `defined but never used: ${orphans.join(", ")}`).toEqual([]);
  });
});

describe("no hardcoded text left in the UI", () => {
  // Strings with an accent or ñ inside calls to Obsidian's API: if they
  // appear outside i18n.ts, someone wrote text without going through t().
  const SUSPICIOUS =
    /\.(setName|setDesc|setTitle|setButtonText|setTooltip|setPlaceholder|addOption)\([^)]*["'`][^"'`]*[áéíóúñÁÉÍÓÚÑ¿¡][^"'`]*["'`]/;

  for (const f of readdirSync(SRC).filter((n) => n.endsWith(".ts") && !n.includes("test") && n !== "i18n.ts")) {
    test(f, () => {
      const lines = readFileSync(join(SRC, f), "utf8").split("\n");
      const bad = lines
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => SUSPICIOUS.test(l))
        .map(([n, l]) => `${n}: ${l.trim()}`);
      expect(bad, `untranslated text in ${f}`).toEqual([]);
    });
  }
});
