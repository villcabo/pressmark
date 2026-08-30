import { describe, expect, test } from "bun:test";
import { aPulgadas, bytesDe, tamanoPapel } from "./pdf";

describe("bytesDe", () => {
  test("recorta una vista con offset dentro de un pool mas grande", () => {
    // Asi es como Node entrega un Buffer: una VISTA sobre un pool compartido.
    // Usar .buffer directo devolveria los 100 bytes del pool y el PDF saldria
    // corrupto. Este test existe para que ese bug no vuelva.
    const pool = new ArrayBuffer(100);
    new Uint8Array(pool).fill(0xff);
    const vista = new Uint8Array(pool, 30, 4);
    vista.set([1, 2, 3, 4]);

    expect(vista.buffer.byteLength).toBe(100); // el pool entero
    const out = bytesDe(vista);
    expect(out.byteLength).toBe(4); // solo lo nuestro
    expect([...new Uint8Array(out)]).toEqual([1, 2, 3, 4]);
  });

  test("un array normal pasa intacto", () => {
    const b = new Uint8Array([9, 8, 7]);
    expect([...new Uint8Array(bytesDe(b))]).toEqual([9, 8, 7]);
  });
});

describe("unidades", () => {
  test("aPulgadas coincide con el conversor de Go", () => {
    expect(aPulgadas("25.4mm")).toBeCloseTo(1, 9);
    expect(aPulgadas("2.54cm")).toBeCloseTo(1, 9);
    expect(aPulgadas("1in")).toBeCloseTo(1, 9);
    expect(aPulgadas("72pt")).toBeCloseTo(1, 9);
    expect(aPulgadas("96px")).toBeCloseTo(1, 9);
    expect(aPulgadas("96")).toBeCloseTo(1, 9);
    expect(aPulgadas(undefined)).toBe(0);
    expect(() => aPulgadas("18 pulgadas")).toThrow();
  });

  test("tamanoPapel devuelve pulgadas, que es lo que espera printToPDF", () => {
    expect(tamanoPapel({ size: "A4" })).toEqual([8.27, 11.69]);
    expect(tamanoPapel(undefined)).toEqual([8.27, 11.69]);
    expect(tamanoPapel({ size: "Letter" })).toEqual([8.5, 11]);
    expect(tamanoPapel({ size: { width: "210mm", height: "297mm" } })[0]).toBeCloseTo(8.268, 3);
    expect(() => tamanoPapel({ size: "A9" })).toThrow();
  });
});
