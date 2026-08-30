/**
 * Theme pack loader.
 *
 * THIS FILE IS A TWIN of the Go loader in cli/internal/theme. The same
 * semantics written twice, in two languages. If they diverge, the same theme
 * pack renders differently in the terminal and in Obsidian — which is the one
 * thing this project exists to prevent.
 *
 * That's why both run the same cases: testdata/conformance/cases.json.
 * Before touching the merge, check whether a case already covers it. If not,
 * add it there FIRST and fix both implementations.
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

/** Theme pack source. Returns null if the file doesn't exist. */
export interface ThemeFS {
  read(path: string): Promise<string | null>;
  list?(): Promise<string[]>;
}

/** Tokens allow numbers in the JSON; once emitted as a CSS var everything is text. */
function normalizeTokens(t: unknown): Record<string, Value> | undefined {
  if (t === undefined || t === null || typeof t !== "object") return undefined;
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
    out[k] = typeof v === "number" ? String(v) : String(v);
  }
  return out;
}

/**
 * Absent means "_base"; explicit null means no parent. The distinction
 * matters and `theme.extends ?? BASE_ID` would erase it.
 */
function parentOf(t: Theme): string | null {
  if (!("extends" in t) || t.extends === undefined) return BASE_ID;
  return t.extends;
}

export async function load(fs: ThemeFS, id: string): Promise<Resolved> {
  const seen = new Set<string>();
  const chain: Theme[] = [];

  let current: string | null = id;
  while (current) {
    if (seen.has(current)) {
      throw new Error(`circular theme inheritance at "${current}"`);
    }
    seen.add(current);

    const raw = await fs.read(`${current}/theme.json`);
    if (raw === null) {
      throw new Error(`theme "${current}": could not find theme.json`);
    }
    let t: Theme;
    try {
      t = JSON.parse(raw) as Theme;
    } catch (e) {
      throw new Error(`theme "${current}": invalid theme.json: ${String(e)}`);
    }
    if (t.id !== current) {
      throw new Error(`theme "${current}": the declared id is "${t.id}"`);
    }
    t.tokens = normalizeTokens(t.tokens);
    chain.unshift(t); // the parent goes first

    current = parentOf(t);
  }

  const out = { chain: [] as string[] } as Resolved;
  const parts: string[] = [];

  for (const t of chain) {
    out.chain.push(t.id);
    merge(out, t);

    const css = await fs.read(`${t.id}/theme.css`);
    if (css === null) {
      throw new Error(`theme "${t.id}": could not find theme.css`);
    }
    parts.push(`/* ── ${t.id} ── */\n${css}`);
  }
  out.css = parts.join("\n");

  // The identity is the requested theme's, not the ancestor's.
  const last = chain[chain.length - 1]!;
  out.id = last.id;
  out.name = last.name;
  out.description = last.description;
  out.version = last.version;
  out.author = last.author;
  return out;
}

function merge(dst: Resolved, src: Theme): void {
  if (src.highlight !== undefined) dst.highlight = src.highlight;
  dst.tokens = mergeMap(dst.tokens, src.tokens);
  dst.vars = mergeMap(dst.vars, src.vars);
  dst.tokenSchema = mergeMap(dst.tokenSchema, src.tokenSchema);
  dst.varSchema = mergeMap(dst.varSchema, src.varSchema);
  dst.page = mergePage(dst.page, src.page);
  dst.cover = mergeShallow(dst.cover, src.cover);
  dst.header = mergeShallow(dst.header, src.header);
  dst.footer = mergeShallow(dst.footer, src.footer);
}

function mergeMap<V>(
  dst: Record<string, V> | undefined,
  src: Record<string, V> | undefined,
): Record<string, V> | undefined {
  if (src === undefined) return dst;
  return { ...(dst ?? {}), ...src };
}

/**
 * Field by field, and `undefined` is the only thing treated as absent.
 * `enabled: false` HAS to override `true` — that's why it doesn't use `||`
 * or `??` on the value, but an explicit check against undefined.
 */
function mergeShallow<T extends object>(dst: T | undefined, src: T | undefined): T | undefined {
  if (src === undefined) return dst;
  const out = { ...(dst ?? ({} as T)) };
  for (const [k, v] of Object.entries(src)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function mergePage(dst: Page | undefined, src: Page | undefined): Page | undefined {
  if (src === undefined) return dst;
  const { margin: marginSrc, ...restSrc } = src;
  const out = mergeShallow(dst, restSrc as Page)!;
  if (marginSrc !== undefined) {
    out.margin = mergeShallow(dst?.margin, marginSrc);
  }
  return out;
}

/** Packs whose id starts with _ are internal: they're inherited, not chosen. */
export async function list(fs: ThemeFS): Promise<string[]> {
  const ids = (await fs.list?.()) ?? [];
  return ids.filter((n) => !n.startsWith("_")).sort();
}
