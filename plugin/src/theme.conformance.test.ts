/**
 * Runs EXACTLY the same cases as Go's loader.
 * See testdata/conformance/README.md.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load, type ThemeFS } from "./theme";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cases = JSON.parse(
  readFileSync(join(ROOT, "testdata/conformance/cases.json"), "utf8"),
) as Case[];

interface Case {
  name: string;
  why: string;
  packs: Record<string, { json: unknown; css: string }>;
  load: string;
  expect?: Record<string, unknown>;
  expectError?: string;
}

function fsFor(packs: Case["packs"]): ThemeFS {
  const files = new Map<string, string>();
  for (const [id, p] of Object.entries(packs)) {
    files.set(`${id}/theme.json`, JSON.stringify(p.json));
    files.set(`${id}/theme.css`, p.css);
  }
  return { read: async (path) => files.get(path) ?? null };
}

const norm = (s: string) =>
  s.replace(/\/\* ── [^─]* ── \*\//g, " ").replace(/\s+/g, " ").trim();

/** Compares only the keys present in what's expected, like Go's runner. */
function partial(want: unknown, got: unknown, path: string): void {
  if (want !== null && typeof want === "object" && !Array.isArray(want)) {
    expect(got, `${path}: expected an object`).toBeObject();
    for (const [k, v] of Object.entries(want)) {
      partial(v, (got as Record<string, unknown>)[k], `${path}.${k}`);
    }
    return;
  }
  expect(got, path).toEqual(want as never);
}

describe("inheritance conformance (shared with Go's loader)", () => {
  test("there are cases to run", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    test(c.name, async () => {
      const fs = fsFor(c.packs);

      if (c.expectError) {
        let err: unknown;
        try {
          await load(fs, c.load);
        } catch (e) {
          err = e;
        }
        expect(err, `${c.why}\n  expected error with "${c.expectError}"`).toBeDefined();
        expect(String((err as Error).message)).toContain(c.expectError);
        return;
      }

      const got = await load(fs, c.load);
      const expected = { ...(c.expect ?? {}) };

      if ("css" in expected) {
        expect(norm(got.css), c.why).toBe(norm(expected["css"] as string));
        delete expected["css"];
      }
      if ("chain" in expected) {
        expect(got.chain, c.why).toEqual(expected["chain"] as string[]);
        delete expected["chain"];
      }
      for (const [k, v] of Object.entries(expected)) {
        partial(v, (got as unknown as Record<string, unknown>)[k], k);
      }
    });
  }
});
