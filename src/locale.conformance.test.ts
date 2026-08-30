/**
 * Runs EXACTLY the same cases as Go's theme.Localized.Resolve.
 * Shared fixture: testdata/conformance/locale.json
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve, type Localized } from "./locale";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(
  readFileSync(join(ROOT, "testdata/conformance/locale.json"), "utf8"),
) as { name: string; why: string; value: Localized; locale: string; want: string }[];

describe("locale (fixture shared with Go)", () => {
  test("there are cases to run", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    test(c.name, () => {
      expect(resolve(c.value, c.locale), c.why).toBe(c.want);
    });
  }

  test("undefined returns empty and doesn't break", () => {
    expect(resolve(undefined, "es")).toBe("");
  });
});
