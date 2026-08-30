import esbuild from "esbuild";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Obsidian y los builtins de Node los provee el host: bundlearlos rompe el
  // plugin. Hay que listar las DOS formas — builtin-modules devuelve "fs" y un
  // `import ... from "node:fs/promises"` no matchea con eso.
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
  outfile: "main.js",
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
}
await ctx.watch();
