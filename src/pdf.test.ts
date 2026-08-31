import { describe, expect, test } from "bun:test";
import { toInches, paperSize } from "./paper";

describe("units", () => {
  test("toInches matches Go's converter", () => {
    expect(toInches("25.4mm")).toBeCloseTo(1, 9);
    expect(toInches("2.54cm")).toBeCloseTo(1, 9);
    expect(toInches("1in")).toBeCloseTo(1, 9);
    expect(toInches("72pt")).toBeCloseTo(1, 9);
    expect(toInches("96px")).toBeCloseTo(1, 9);
    expect(toInches("96")).toBeCloseTo(1, 9);
    expect(toInches(undefined)).toBe(0);
    expect(() => toInches("18 inches")).toThrow();
  });

  test("paperSize returns inches, which is what printToPDF expects", () => {
    expect(paperSize({ size: "A4" })).toEqual([8.27, 11.69]);
    expect(paperSize(undefined)).toEqual([8.27, 11.69]);
    expect(paperSize({ size: "Letter" })).toEqual([8.5, 11]);
    expect(paperSize({ size: { width: "210mm", height: "297mm" } })[0]).toBeCloseTo(8.268, 3);
    expect(() => paperSize({ size: "A9" })).toThrow();
  });
});
