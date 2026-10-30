import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".next-phase2/**",
    ".next-local/**",
    ".next-phase3/**",
    ".next-phase35/**",
    ".local/**",
    "out/**",
    "build/**",
    "coverage/**",
    "sprtaya-kanaka-assets/**",
    ".agents/**",
    ".taste-skill/**",
    ".pnpm-store/**",
  ]),
]);
