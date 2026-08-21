import { expect, test } from "./fixtures";

const apiBase = "http://127.0.0.1:8088";

async function resetMockProfiles() {
  await fetch(`${apiBase}/api/v1/test/set-fresh-install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  await fetch(`${apiBase}/api/v1/test/set-local-ai-ready`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ready: true }),
  });
}

test.describe("FRONT-007 profile onboarding", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    await resetMockProfiles();
  });

  test.afterEach(async () => {
    await resetMockProfiles();
  });

  test("redirects settings to profile", async ({ page }) => {
    await page.goto("/applications/settings");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();
  });

  test("fresh install routes to onboarding and creates a profile", async ({
    page,
  }) => {
    await fetch(`${apiBase}/api/v1/test/set-fresh-install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    try {
      await page.goto("/jobs");
      await expect(page).toHaveURL(/\/onboarding/);
      await expect(
        page.getByRole("heading", { name: "Set up your profile" }),
      ).toBeVisible();

      await page.getByLabel(/display name/i).fill("Grace Hopper");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page.getByRole("heading", { name: "Add resume" }),
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await resetMockProfiles();
    }
  });

  test("supports opening the profile switcher", async ({ page }) => {
    await page.goto("/profile");
    await page
      .getByRole("button", { name: /Ada Lovelace|No profile|Grace Hopper/ })
      .click();
    await expect(
      page.getByRole("menu", { name: "Applicant profiles" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("menu", { name: "Applicant profiles" }),
    ).toHaveCount(0);
  });

  test("shows local-AI exception guidance when the model is unavailable", async ({
    page,
  }) => {
    await fetch(`${apiBase}/api/v1/test/set-local-ai-ready`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ready: false }),
    });
    try {
      await page.goto("/profile");
      await expect(
        page.getByText(
          /Local model service is unreachable|Ready with exceptions|Setup required/,
        ),
      ).toBeVisible();
    } finally {
      await resetMockProfiles();
    }
  });

  test("profile page is usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.locator("#profile-readiness")).toBeVisible();
  });
});
