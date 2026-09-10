// packages/shared must stay platform-independent: no web framework, no
// Cloudflare/Workers runtime, no hosting-provider SDK. This keeps a
// raw-Durable-Objects (or other runtime) fallback cheap. See SPEC.md NFR-017.
import root from "../../eslint.config.js";

export default [
  ...root,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "packages/shared must not depend on React." },
            { name: "react-dom", message: "packages/shared must not depend on React." },
            { name: "partyserver", message: "packages/shared must not depend on the Workers runtime." },
            { name: "partysocket", message: "packages/shared must not depend on the transport client." },
          ],
          patterns: [
            {
              group: ["cloudflare:*", "@cloudflare/*"],
              message: "packages/shared must not depend on the Cloudflare/Workers runtime.",
            },
            {
              group: ["@supabase/*"],
              message: "packages/shared must not depend on the Supabase SDK.",
            },
            {
              group: ["@sentry/*"],
              message: "packages/shared must not depend on Sentry.",
            },
          ],
        },
      ],
    },
  },
];
