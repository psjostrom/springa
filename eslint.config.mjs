import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "prefer-const": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
  },
  // Disable type-checked rules for JS files not in tsconfig.
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Relax rules for test files — assertions use patterns
  // that are safe in tests but trip type-safety rules.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/require-await": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@testing-library/react",
              importNames: ["render", "renderHook"],
              message:
                "Import render/renderHook from @/lib/__tests__/test-utils instead — it wraps with Jotai + SWR providers.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Do not assign or mock global fetch in tests. Use MSW (server.use) to intercept requests at the network level.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='vi'][callee.property.name='stubGlobal']",
          message:
            "vi.stubGlobal is banned in tests. Use MSW to intercept network requests. See CLAUDE.md Testing section.",
        },
        {
          selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock']",
          message:
            "vi.mock() is banned — do not mock internal modules. Use MSW for network boundaries and in-memory SQLite for DB. The only exception is vi.mock('@libsql/client') to redirect to :memory:.",
        },
        {
          selector: "CallExpression[callee.property.name='mockResolvedValue']",
          message:
            "mockResolvedValue is banned in tests. Use MSW handlers to control responses instead of mocking functions.",
        },
        {
          selector: "CallExpression[callee.property.name='mockResolvedValueOnce']",
          message:
            "mockResolvedValueOnce is banned in tests. Use MSW server.use() for per-test response overrides.",
        },
        {
          selector: "CallExpression[callee.property.name='mockRejectedValue']",
          message:
            "mockRejectedValue is banned in tests. Use MSW to return error responses (e.g. HttpResponse.error()).",
        },
        {
          selector: "CallExpression[callee.property.name='mockRejectedValueOnce']",
          message:
            "mockRejectedValueOnce is banned in tests. Use MSW to return error responses.",
        },
        {
          selector: "CallExpression[callee.property.name='mockImplementation']",
          message:
            "mockImplementation is banned in tests. Use MSW handlers instead of reimplementing fetch behavior.",
        },
        {
          selector: "CallExpression[callee.property.name='mockReturnValue']",
          message:
            "mockReturnValue is banned in tests. Use real implementations or MSW for network boundaries.",
        },
        {
          selector: "MemberExpression[object.name='global'][property.name='fetch']",
          message:
            "Do not assign global.fetch in tests. Use MSW (server.use) to intercept requests.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone scripts excluded from tsconfig
    "scripts/**",
    // Claude Code worktrees
    ".claude/**",
  ]),
]);

export default eslintConfig;
