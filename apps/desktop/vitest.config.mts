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
          include: ["tests/forms/**/*.test.ts", "tests/adapters/**/*.test.ts"],
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
      {
        // CROSS-012 reconciled omission: production smoke is not in the Work
        // Order owned-files list for this config, but tests/production/** will
        // not run without a dedicated project.
        test: {
          name: "production",
          environment: "node",
          include: ["tests/production/**/*.test.ts"],
          testTimeout: 240000,
        },
      },
    ],
  },
});
