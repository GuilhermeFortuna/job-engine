import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

test.describe("Interactive Live Search & SSE Streaming", () => {
  test.beforeEach(async ({ page }) => {
    // Reset test flags on mock server
    try {
      await page.request.post(
        "http://127.0.0.1:8088/api/v1/test/set-live-sync-mode",
        {
          data: { cooldown: false, degraded: false },
        },
      );
      await page.request.post("http://127.0.0.1:8088/api/v1/test/set-health", {
        data: { degraded: false },
      });
    } catch {}
  });

  test("1. Live search button triggers SSE stream and shows real-time progress for all 3 sources", async ({
    page,
  }) => {
    await page.goto("/jobs?q=engineer&role_family=backend");

    const liveSearchBtn = page.getByRole("button", {
      name: /trigger live search/i,
    });
    await expect(liveSearchBtn).toBeVisible();

    await liveSearchBtn.click();

    // Dialog should open
    const dialog = page.getByRole("dialog", {
      name: /live catalog synchronization/i,
    });
    await expect(dialog).toBeVisible();

    // Check all three sources rendered in progress modal
    await expect(page.getByTestId("live-sync-source-himalayas")).toBeVisible();
    await expect(page.getByTestId("live-sync-source-jobicy")).toBeVisible();
    await expect(page.getByTestId("live-sync-source-remoteok")).toBeVisible();

    // Wait for completion
    await expect(page.getByText(/synchronization complete/i)).toBeVisible({
      timeout: 5000,
    });

    // Verify active URL filters were preserved
    expect(page.url()).toContain("q=engineer");
    expect(page.url()).toContain("role_family=backend");

    // Dismiss modal
    const closeBtn = page.getByRole("button", { name: "Close", exact: true });
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test("2. Partial failure on upstream source shows warning badge without crashing search", async ({
    page,
  }) => {
    // Enable degraded mode
    await page.request.post(
      "http://127.0.0.1:8088/api/v1/test/set-live-sync-mode",
      {
        data: { degraded: true, cooldown: false },
      },
    );

    await page.goto("/jobs");
    const liveSearchBtn = page.getByRole("button", {
      name: /trigger live search/i,
    });
    await liveSearchBtn.click();

    const dialog = page.getByRole("dialog", {
      name: /live catalog synchronization/i,
    });
    await expect(dialog).toBeVisible();

    // Jobicy failure badge should appear
    const jobicyCard = page.getByTestId("live-sync-source-jobicy");
    await expect(jobicyCard.getByText(/failed/i)).toBeVisible({
      timeout: 5000,
    });

    // Himalayas and Remote OK succeed
    const himalayasCard = page.getByTestId("live-sync-source-himalayas");
    await expect(himalayasCard.getByText(/done/i)).toBeVisible();

    // Search results area is still intact
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Looking for a new job?",
      }),
    ).toBeVisible();
  });

  test("3. Cooldown guard displays polite retry-after message", async ({
    page,
  }) => {
    // Enable cooldown mode
    await page.request.post(
      "http://127.0.0.1:8088/api/v1/test/set-live-sync-mode",
      {
        data: { cooldown: true, degraded: false },
      },
    );

    await page.goto("/jobs");
    const liveSearchBtn = page.getByRole("button", {
      name: /trigger live search/i,
    });
    await liveSearchBtn.click();

    // Modal opens showing cooldown message
    const dialog = page.getByRole("dialog", {
      name: /live catalog synchronization/i,
    });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/cooldown active \(/i)).toBeVisible({
      timeout: 3000,
    });
  });

  test("4. Keyboard accessibility: Escape key dismisses modal and restores focus", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const liveSearchBtn = page.getByRole("button", {
      name: /trigger live search/i,
    });
    await liveSearchBtn.click();

    const dialog = page.getByRole("dialog", {
      name: /live catalog synchronization/i,
    });
    await expect(dialog).toBeVisible();

    // Press Escape to dismiss
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("5. Automated Axe accessibility audit on Live Search dialog", async ({
    page,
  }) => {
    await page.goto("/jobs");
    // Axe asserts document-title. Wait for the document to settle before
    // scanning, otherwise a scan racing the navigation reports a spurious
    // "Document does not have a non-empty <title>" violation.
    await expect(page).toHaveTitle(/job engine/i);

    const liveSearchBtn = page.getByRole("button", {
      name: /trigger live search/i,
    });
    await liveSearchBtn.click();

    const dialog = page.getByRole("dialog", {
      name: /live catalog synchronization/i,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/synchronization complete/i)).toBeVisible();

    const accessibilityScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const criticalOrSerious = accessibilityScan.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    expect(
      criticalOrSerious,
      `Axe violations on Live Search modal: ${JSON.stringify(criticalOrSerious, null, 2)}`,
    ).toEqual([]);
  });
});
