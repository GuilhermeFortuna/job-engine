import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "runtime",
          environment: "node",
          include: ["tests/runtime/**/*.test.ts"],
        },
      },
      {
        // The observe/fill scripts are plain functions of (document, args),
        // so the production sources run unchanged against a real DOM here.
        test: {
          name: "forms",
          environment: "jsdom",
          include: ["tests/forms/**/*.test.ts"],
        },
      },
      {
        // Spawns a real Electron binary; kept out of the default `test` run.
        test: {
          name: "fixtures",
          environment: "node",
          include: ["tests/fixtures/**/*.test.ts"],
        },
      },
    ],
  },
});
