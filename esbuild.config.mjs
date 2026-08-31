import esbuild from "esbuild";

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Provided by the host at runtime; bundling them breaks the plugin.
  //
  // The Node builtins are listed one by one rather than pulled from
  // `builtin-modules`: the plugin uses exactly one, and spelling it out keeps
  // the list honest about how much of Node this actually reaches for.
  external: ["obsidian", "electron", "@electron/remote", "node:fs/promises"],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  minify: production,
  // At the repo ROOT: the community store requires manifest.json and the
  // release assets at the root, with no support for monorepos. The code stays
  // in plugin/src/ and only the build artifacts go up.
  outfile: "main.js",
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
}
await ctx.watch();
