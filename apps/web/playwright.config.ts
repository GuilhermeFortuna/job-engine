import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
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
      reuseExistingServer: !process.env.CI,
      env: {
        MOCK_PORT: "8088",
      },
    },
    {
      command: "npx next start -p 3005",
      url: "http://127.0.0.1:3005/jobs",
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "3005",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8088",
      },
    },
  ],
});
