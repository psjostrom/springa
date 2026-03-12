import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.flow.test.ts", "**/*.integration.test.tsx"],
          setupFiles: ["./lib/__tests__/msw/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "flow",
          include: ["**/*.flow.test.ts"],
          exclude: ["**/node_modules/**"],
          setupFiles: ["./lib/__tests__/msw/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["**/*.integration.test.tsx"],
          exclude: ["**/node_modules/**"],
          environment: "jsdom",
          setupFiles: [
            "./lib/__tests__/msw/setup.ts",
            "./lib/__tests__/setup-dom.ts",
          ],
          css: true,
        },
      },
    ],
  },
});
