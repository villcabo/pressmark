/**
 * Theme pack sources for the plugin.
 *
 * User packs live INSIDE the vault, at .obsidian/pressmark/themes/. That's a
 * deliberate choice: the community store's policy allows reading outside the
 * vault, but requires justifying it in the submission. Reading from inside
 * uses the Vault API, needs no justification, and adds no friction to review.
 * Reading from outside stays an advanced option, not the common path.
 */
import type { Vault } from "obsidian";
import { normalizePath } from "obsidian";
import type { ThemeFS } from "./theme";
import { EMBEDDED } from "./themes.generated";

export const USER_THEMES_FOLDER = ".obsidian/pressmark/themes";

/** The packs that ship inside the plugin. */
export function embeddedFS(): ThemeFS {
  return {
    read: async (path) => EMBEDDED[path] ?? null,
    list: async () =>
      [...new Set(Object.keys(EMBEDDED).map((r) => r.split("/")[0]!))],
  };
}

/** The user's own packs, inside the vault. */
export function vaultFS(vault: Vault, folder = USER_THEMES_FOLDER): ThemeFS {
  return {
    read: async (path) => {
      const p = normalizePath(`${folder}/${path}`);
      try {
        if (!(await vault.adapter.exists(p))) return null;
        return await vault.adapter.read(p);
      } catch {
        return null;
      }
    },
    list: async () => {
      const p = normalizePath(folder);
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
 * Looks in the user's own packs first and falls back to the embedded ones.
 *
 * This is needed because inheritance crosses both sources: a user's own theme
 * declares extends "_base", and _base ships inside the plugin.
 */
export function overlay(...layers: ThemeFS[]): ThemeFS {
  return {
    read: async (path) => {
      for (const c of layers) {
        const v = await c.read(path);
        if (v !== null) return v;
      }
      return null;
    },
    list: async () => {
      const seen = new Set<string>();
      for (const c of layers) for (const id of (await c.list?.()) ?? []) seen.add(id);
      return [...seen];
    },
  };
}
