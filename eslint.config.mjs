// Mirrors the checks the Obsidian community directory runs on submission, so
// they fail here first instead of in a review round-trip.
//
// obsidianmd's recommended config already bundles typescript-eslint (base,
// recommended and recommended-type-checked): spreading those again on top
// redefines the plugin and ESLint refuses to start.
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: [
      "main.js",
      "dist/**",
      "cli/**",
      "src/themes.generated.ts",
      "tools/**",
      "eslint.config.mjs",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      // Fixtures arrive as JSON: their shape is checked by the assertions
      // themselves, not by the type system.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
