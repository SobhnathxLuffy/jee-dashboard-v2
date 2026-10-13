import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Next's default rules (core-web-vitals + typescript) are kept as-is.
// Only the ignores block is retained. No rules are turned off.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  ignores: ["node_modules/**", ".next/**", ".next-mobile/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "public/**", "tests/**", "android/**", ".mobile-api-backup/**"]
}];

export default eslintConfig;
