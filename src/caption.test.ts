/**
 * The caption under the preview.
 *
 * Worth testing for one reason: this line is where the user reads how many
 * pages they are about to get, and for several releases that number was an
 * estimate that disagreed with the file — 3 against 4, 27 against 16. The
 * count now comes from the PDF (see pdf-info.test.ts), so what is left to
 * guard here is that the number actually reaches the sentence, and that the
 * optional parts appear only when they should.
 */
import { describe, expect, test } from "bun:test";
import { captionFor } from "./caption";
import type { Resolved } from "./theme";

function theme(over: Partial<Resolved> = {}): Resolved {
  return {
    id: "t",
    page: {
      size: "A4",
      orientation: "portrait",
      margin: { top: "19mm", right: "18mm", bottom: "22mm", left: "18mm" },
    },
    ...over,
  } as Resolved;
}

describe("captionFor", () => {
  test("reports the page count it is given, verbatim", () => {
    expect(captionFor(theme(), 16)).toContain("16 page(s)");
    expect(captionFor(theme(), 1)).toContain("1 page(s)");
  });

  test("no longer hedges the count with a tilde", () => {
    // The `~` was honest while the number was estimated. Now it would be a lie
    // in the other direction: it is the exact count out of the PDF.
    expect(captionFor(theme(), 4)).not.toContain("~");
  });

  test("lists paper, orientation and all four margins", () => {
    const c = captionFor(theme(), 2);
    expect(c).toContain("A4");
    expect(c).toContain("portrait");
    expect(c).toContain("19mm 18mm 22mm 18mm");
  });

  test("says landscape only when the page is landscape", () => {
    const land = theme({ page: { ...theme().page!, orientation: "landscape" } });
    expect(captionFor(land, 1)).toContain("landscape");
    expect(captionFor(theme(), 1)).toContain("portrait");
  });

  test("calls a non-string paper size custom rather than printing an object", () => {
    const custom = theme({ page: { ...theme().page!, size: { width: "10cm", height: "15cm" } } });
    const c = captionFor(custom, 1);
    expect(c).toContain("custom");
    expect(c).not.toContain("[object");
  });

  test("states the cover either way, because its absence is also a choice", () => {
    expect(captionFor(theme({ cover: { enabled: true } }), 1)).toContain("with cover");
    expect(captionFor(theme({ cover: { enabled: false } }), 1)).toContain("without cover");
    expect(captionFor(theme(), 1)).toContain("without cover");
  });

  test("mentions the footer only when there is one", () => {
    expect(captionFor(theme({ footer: { enabled: true } }), 1)).toContain("with footer");
    expect(captionFor(theme(), 1)).not.toContain("with footer");
  });

  test("survives a theme with no page block at all", () => {
    const bare = { id: "t" } as Resolved;
    const c = captionFor(bare, 3);
    expect(c).toContain("3 page(s)");
    expect(c).toContain("? ? ? ?");
  });
});
