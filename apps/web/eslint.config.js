import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

import root from "../../eslint.config.js";

export default [
  ...root,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // shadcn/ui primitives co-locate a component with its variant helper.
    files: ["src/components/ui/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}", "src/test/**/*.ts"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
];
