/**
 * Fuentes de theme packs para el plugin.
 *
 * Los packs del usuario viven DENTRO del vault, en .obsidian/pressmark/themes/.
 * Es una decision deliberada: la politica del community store permite leer
 * fuera del vault, pero obliga a justificarlo en el submission. Leer de adentro
 * usa la API Vault, no necesita justificacion y no agrega friccion a la
 * revision. Leer de afuera queda como opcion avanzada, no como el camino comun.
 */
import type { Vault } from "obsidian";
import { normalizePath } from "obsidian";
import type { ThemeFS } from "./theme";
import { EMBEDDED } from "./themes.generated";

export const CARPETA_USUARIO = ".obsidian/pressmark/themes";

/** Los packs que viajan dentro del plugin. */
export function embeddedFS(): ThemeFS {
  return {
    read: async (ruta) => EMBEDDED[ruta] ?? null,
    list: async () =>
      [...new Set(Object.keys(EMBEDDED).map((r) => r.split("/")[0]!))],
  };
}

/** Los packs propios del usuario, dentro del vault. */
export function vaultFS(vault: Vault, carpeta = CARPETA_USUARIO): ThemeFS {
  return {
    read: async (ruta) => {
      const p = normalizePath(`${carpeta}/${ruta}`);
      try {
        if (!(await vault.adapter.exists(p))) return null;
        return await vault.adapter.read(p);
      } catch {
        return null;
      }
    },
    list: async () => {
      const p = normalizePath(carpeta);
      try {
        if (!(await vault.adapter.exists(p))) return [];
        return (await vault.adapter.list(p)).folders.map((f) =>
          f.split("/").pop()!,
        );
      } catch {
        return [];
      }
    },
  };
}

/**
 * Busca primero en los packs del usuario y cae a los embebidos.
 *
 * Hace falta porque la herencia cruza las dos fuentes: un theme propio declara
 * extends "_base", y _base viaja dentro del plugin.
 */
export function overlay(...capas: ThemeFS[]): ThemeFS {
  return {
    read: async (ruta) => {
      for (const c of capas) {
        const v = await c.read(ruta);
        if (v !== null) return v;
      }
      return null;
    },
    list: async () => {
      const vistos = new Set<string>();
      for (const c of capas) for (const id of (await c.list?.()) ?? []) vistos.add(id);
      return [...vistos];
    },
  };
}
