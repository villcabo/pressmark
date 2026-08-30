/**
 * Cargador de theme packs.
 *
 * ESTE ARCHIVO ES UN GEMELO del cargador de Go en cli/internal/theme. La misma
 * semantica escrita dos veces, en dos lenguajes. Si divergen, el mismo theme
 * pack rinde distinto en la terminal y en Obsidian — que es lo unico que este
 * proyecto existe para evitar.
 *
 * Por eso los dos corren los mismos casos: testdata/conformance/cases.json.
 * Antes de tocar el merge, mira si hay un caso que lo cubra. Si no lo hay,
 * agregalo ahi PRIMERO y arregla las dos implementaciones.
 */

import type { Localized } from "./locale";

export const BASE_ID = "_base";

export type { Localized };

export type Value = string;

export type Size = string | { width: string; height: string };

export interface Margin {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export interface Page {
  size?: Size;
  orientation?: "portrait" | "landscape";
  margin?: Margin;
  printBackground?: boolean;
  scale?: number;
}

export interface Cover {
  enabled?: boolean;
  break?: "page" | "none";
}

export interface Band {
  enabled?: boolean;
  left?: Localized;
  center?: Localized;
  right?: Localized;
  rule?: boolean;
  fontSize?: string;
  color?: string;
}

export interface TokenDef {
  type: "color" | "font-stack" | "length" | "number" | "text";
  label: Localized;
  group?: string;
  description?: Localized;
}

export interface Theme {
  id: string;
  name: Localized;
  description?: Localized;
  version: string;
  author?: string;
  extends?: string | null;
  highlight?: string;
  tokens?: Record<string, Value>;
  tokenSchema?: Record<string, TokenDef>;
  page?: Page;
  cover?: Cover;
  header?: Band;
  footer?: Band;
  vars?: Record<string, Localized>;
  varSchema?: Record<string, TokenDef>;
}

export interface Resolved extends Theme {
  css: string;
  chain: string[];
}

/** Fuente de theme packs. Devuelve null si el archivo no existe. */
export interface ThemeFS {
  read(path: string): Promise<string | null>;
  list?(): Promise<string[]>;
}

/** Los tokens admiten numeros en el JSON; al emitirse como var CSS todo es texto. */
function normalizarTokens(t: unknown): Record<string, Value> | undefined {
  if (t === undefined || t === null || typeof t !== "object") return undefined;
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
    out[k] = typeof v === "number" ? String(v) : String(v);
  }
  return out;
}

/**
 * Ausente significa "_base"; null explicito significa sin padre. La distincion
 * importa y `theme.extends ?? BASE_ID` la borraria.
 */
function padre(t: Theme): string | null {
  if (!("extends" in t) || t.extends === undefined) return BASE_ID;
  return t.extends;
}

export async function load(fs: ThemeFS, id: string): Promise<Resolved> {
  const vistos = new Set<string>();
  const cadena: Theme[] = [];

  let actual: string | null = id;
  while (actual) {
    if (vistos.has(actual)) {
      throw new Error(`herencia circular de themes en "${actual}"`);
    }
    vistos.add(actual);

    const crudo = await fs.read(`${actual}/theme.json`);
    if (crudo === null) {
      throw new Error(`theme "${actual}": no encontre theme.json`);
    }
    let t: Theme;
    try {
      t = JSON.parse(crudo) as Theme;
    } catch (e) {
      throw new Error(`theme "${actual}": theme.json invalido: ${String(e)}`);
    }
    if (t.id !== actual) {
      throw new Error(`theme "${actual}": el id declarado es "${t.id}"`);
    }
    t.tokens = normalizarTokens(t.tokens);
    cadena.unshift(t); // el padre queda antes

    actual = padre(t);
  }

  const out = { chain: [] as string[] } as Resolved;
  const partes: string[] = [];

  for (const t of cadena) {
    out.chain.push(t.id);
    mezclar(out, t);

    const css = await fs.read(`${t.id}/theme.css`);
    if (css === null) {
      throw new Error(`theme "${t.id}": no encontre theme.css`);
    }
    partes.push(`/* ── ${t.id} ── */\n${css}`);
  }
  out.css = partes.join("\n");

  // La identidad es la del theme pedido, no la del ancestro.
  const ultimo = cadena[cadena.length - 1]!;
  out.id = ultimo.id;
  out.name = ultimo.name;
  out.description = ultimo.description;
  out.version = ultimo.version;
  out.author = ultimo.author;
  return out;
}

function mezclar(dst: Resolved, src: Theme): void {
  if (src.highlight !== undefined) dst.highlight = src.highlight;
  dst.tokens = mezclarMapa(dst.tokens, src.tokens);
  dst.vars = mezclarMapa(dst.vars, src.vars);
  dst.tokenSchema = mezclarMapa(dst.tokenSchema, src.tokenSchema);
  dst.varSchema = mezclarMapa(dst.varSchema, src.varSchema);
  dst.page = mezclarPage(dst.page, src.page);
  dst.cover = mezclarPlano(dst.cover, src.cover);
  dst.header = mezclarPlano(dst.header, src.header);
  dst.footer = mezclarPlano(dst.footer, src.footer);
}

function mezclarMapa<V>(
  dst: Record<string, V> | undefined,
  src: Record<string, V> | undefined,
): Record<string, V> | undefined {
  if (src === undefined) return dst;
  return { ...(dst ?? {}), ...src };
}

/**
 * Campo a campo, y `undefined` es lo unico que se considera ausente.
 * `enabled: false` TIENE que pisar a `true` — por eso no se usa `||` ni `??`
 * sobre el valor, sino una comprobacion explicita contra undefined.
 */
function mezclarPlano<T extends object>(dst: T | undefined, src: T | undefined): T | undefined {
  if (src === undefined) return dst;
  const out = { ...(dst ?? ({} as T)) };
  for (const [k, v] of Object.entries(src)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function mezclarPage(dst: Page | undefined, src: Page | undefined): Page | undefined {
  if (src === undefined) return dst;
  const { margin: margenSrc, ...restoSrc } = src;
  const out = mezclarPlano(dst, restoSrc as Page)!;
  if (margenSrc !== undefined) {
    out.margin = mezclarPlano(dst?.margin, margenSrc);
  }
  return out;
}

/** Los packs con id que arranca en _ son internos: se heredan, no se eligen. */
export async function list(fs: ThemeFS): Promise<string[]> {
  const ids = (await fs.list?.()) ?? [];
  return ids.filter((n) => !n.startsWith("_")).sort();
}
