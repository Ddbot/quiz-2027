// Flat ESLint config for the whole workspace.
// Package-specific rules (e.g. the platform-independence rule for packages/shared)
// are layered on in each package's own eslint.config.js.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.wrangler/**",
      "**/.vercel/**",
      "**/coverage/**",
      "**/*.gen.ts",
      "supabase/.branches/**",
      "supabase/.temp/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.config.{js,ts,cjs,mjs}", "**/vite.config.ts", "**/vitest.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
