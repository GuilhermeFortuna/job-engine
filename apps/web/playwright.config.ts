import { defineConfig, devices } from "@playwright/test";

// Reusing a leftover :3005 / :8088 listener silently serves a STALE bundle and
// produces misleading "element not found" failures (CROSS-009 defect D-5). Default
// to starting fresh servers everywhere; opt back in with E2E_REUSE_SERVER=1 only
// when you know the running server matches your working tree.
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // ubuntu-latest GitHub-hosted runners expose 2 vCPUs; pin this so local
  // `CI=true pnpm run ci` does not hide races behind a different worker count.
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
    colorScheme: "light",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-server.mjs",
      url: "http://127.0.0.1:8088/api/v1/catalog/filters",
      reuseExistingServer,
      env: {
        MOCK_PORT: "8088",
      },
    },
    {
      command: "npx next start -p 3005",
      url: "http://127.0.0.1:3005/jobs",
      reuseExistingServer,
      env: {
        PORT: "3005",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8088",
      },
    },
  ],
});
