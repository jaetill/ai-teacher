import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import promise from "eslint-plugin-promise";

// Platform quality-gate plugins are layered ON TOP of eslint-config-next,
// not replacing it. Severities match the platform reference (meal-planner):
// `unused-imports/no-unused-imports` and `promise/always-return` are errors;
// `promise/no-nesting` is a warning. Default severities from
// eslint-config-next/typescript (no-explicit-any, no-require-imports as
// errors) are preserved.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "unused-imports": unusedImports,
      promise,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "promise/always-return": "error",
      "promise/no-nesting": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".claude/worktrees/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
