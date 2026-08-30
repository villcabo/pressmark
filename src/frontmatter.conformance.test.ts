/**
 * Runs EXACTLY the same cases as Go's frontmatter splitter.
 * Shared fixture: testdata/conformance/frontmatter.json
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeVars, splitFrontmatter, titleFor } from "./document";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(
  readFileSync(join(ROOT, "testdata/conformance/frontmatter.json"), "utf8"),
) as Case[];

interface Case {
  name: string;
  why: string;
  in: string;
  fields: Record<string, string> | null;
  body: string;
}

describe("frontmatter (fixture shared with Go)", () => {
  test("there are cases to run", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const c of cases) {
    test(c.name, () => {
      const { fields, body } = splitFrontmatter(c.in);
      expect(body, `${c.why} | body`).toBe(c.body);
      expect(fields, `${c.why} | fields`).toEqual(c.fields);
    });
  }
});

describe("title and vars", () => {
  test("frontmatter wins over the h1", () => {
    expect(titleFor({ title: "From the frontmatter" }, "# From the h1", "x")).toBe("From the frontmatter");
    expect(titleFor(null, "# From the h1", "x")).toBe("From the h1");
    expect(titleFor(null, "no title", "from the file")).toBe("from the file");
  });

  test("fields are accessible as fm.field", () => {
    expect(mergeVars({ a: "1" }, { sistema: "PGW" }, "es")).toEqual({ a: "1", "fm.sistema": "PGW" });
    expect(mergeVars({ a: "1" }, null, "es")).toEqual({ a: "1" });
    expect(mergeVars(undefined, null, "es")).toEqual({});
  });
});
