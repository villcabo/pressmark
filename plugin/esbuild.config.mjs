import esbuild from "esbuild";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Obsidian and Node's builtins are provided by the host: bundling them
  // breaks the plugin. Both forms have to be listed — builtin-modules
  // returns "fs" and an `import ... from "node:fs/promises"` doesn't match
  // that.
  external: [
    "obsidian",
    "electron",
    "@electron/remote",
    ...builtins,
    ...builtins.map((m) => `node:${m}`),
    ...builtins.map((m) => `node:${m}/promises`),
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  minify: production,
  // At the repo ROOT: the community store requires manifest.json and the
  // release assets at the root, with no support for monorepos. The code stays
  // in plugin/src/ and only the build artifacts go up.
  outfile: "../main.js",
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
}
await ctx.watch();
