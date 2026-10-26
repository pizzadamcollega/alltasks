import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// CLAUDE.md golden rule 2: the service-role client bypasses RLS, so it may
// only be imported where the caller's rights are checked first — the
// account-management feature and one-off admin scripts.
const noAdminImportElsewhere = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/lib/supabase/admin",
            message:
              "lib/supabase/admin is service-role only — import it from features/accounts/** or scripts/** only (CLAUDE.md golden rule 2).",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    ...noAdminImportElsewhere,
    ignores: ["features/accounts/**", "scripts/**"],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
