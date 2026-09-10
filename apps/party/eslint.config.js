import globals from "globals";

import root from "../../eslint.config.js";

export default [
  ...root,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      // Worker runtime globals (Response, fetch, WebSocket, URL, …).
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
  {
    ignores: ["worker-configuration.d.ts", "dist/**"],
  },
];
