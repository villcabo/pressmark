import { describe, expect, test } from "bun:test";
import { toInches, bytesOf, paperSize } from "./paper";

describe("bytesOf", () => {
  test("trims a view with an offset inside a larger pool", () => {
    // This is how Node hands over a Buffer: a VIEW over a shared pool. Using
    // .buffer directly would return the pool's full 100 bytes and the PDF
    // would come out corrupt. This test exists so that bug doesn't come back.
    const pool = new ArrayBuffer(100);
    new Uint8Array(pool).fill(0xff);
    const view = new Uint8Array(pool, 30, 4);
    view.set([1, 2, 3, 4]);

    expect(view.buffer.byteLength).toBe(100); // the whole pool
    const out = bytesOf(view);
    expect(out.byteLength).toBe(4); // just ours
    expect([...new Uint8Array(out)]).toEqual([1, 2, 3, 4]);
  });

  test("a plain array passes through untouched", () => {
    const b = new Uint8Array([9, 8, 7]);
    expect([...new Uint8Array(bytesOf(b))]).toEqual([9, 8, 7]);
  });
});

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
