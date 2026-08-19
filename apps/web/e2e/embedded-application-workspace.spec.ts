import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const WORKSPACE_RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXISTING_RUN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MOCK = "http://127.0.0.1:8088";

type BridgeTelemetry = {
  events: string[];
  bounds: unknown[];
  opens: unknown[];
  closes: number;
};

async function setWorkspaceMode(
  page: Page,
  mode: string,
  resetOverride = true,
) {
  await page.request.post(`${MOCK}/api/v1/test/set-workspace-mode`, {
    data: { mode, resetOverride },
  });
}

async function installDesktopBridge(page: Page) {
  await page.addInitScript(() => {
    const storageKey = "__jobEngineBridge";
    const empty: BridgeTelemetry = {
      events: [],
      bounds: [],
      opens: [],
      closes: 0,
    };
    const persist = (api: BridgeTelemetry) => {
      sessionStorage.setItem(storageKey, JSON.stringify(api));
    };
    const load = (): BridgeTelemetry => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        return raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
      } catch {
        return { ...empty };
      }
    };
    const api = load();
    const listeners: Array<
      (state: {
        runId: string | null;
        displayUrl: string;
        title: string;
        isLoading: boolean;
        canGoBack: boolean;
        canGoForward: boolean;
        blockedNavigationReason: null;
      }) => void
    > = [];
    (
      window as Window & { __jobEngineBridge?: BridgeTelemetry }
    ).__jobEngineBridge = api;
    window.jobEngineDesktop = {
      getCapabilities: async () => ({
        embeddedBrowser: true,
        platform: "linux",
      }),
      openApplication: async (params: { runId: string }) => {
        api.opens.push(params);
        api.events.push("open");
        persist(api);
        for (const listener of listeners) {
          listener({
            runId: params.runId,
            displayUrl: "https://boards.greenhouse.io/apex/jobs/1",
            title: "Apply",
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            blockedNavigationReason: null,
          });
        }
        return { success: true };
      },
      setApplicationBounds: async (bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
        devicePixelRatio?: number;
      }) => {
        api.bounds.push(bounds);
        api.events.push("bounds");
        persist(api);
        return { success: true };
      },
      closeApplication: async () => {
        api.closes += 1;
        api.events.push("close");
        persist(api);
        return { success: true };
      },
      goBack: async () => ({ success: true }),
      goForward: async () => ({ success: true }),
      reload: async () => ({ success: true }),
      subscribeBrowserState: (listener) => {
        listeners.push(listener);
        return () => {};
      },
    } as NonNullable<Window["jobEngineDesktop"]>;
  });
}

async function bridgeTelemetry(page: Page): Promise<BridgeTelemetry> {
  return page.evaluate(() => {
    const stored = sessionStorage.getItem("__jobEngineBridge");
    if (stored) {
      return JSON.parse(stored) as BridgeTelemetry;
    }
    return (
      (window as Window & { __jobEngineBridge?: BridgeTelemetry })
        .__jobEngineBridge ?? {
        events: [],
        bounds: [],
        opens: [],
        closes: 0,
      }
    );
  });
}

test.describe("Embedded application workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setWorkspaceMode(page, "armed");
  });

  test("ordinary browser keeps the external apply link and does not embed", async ({
    page,
  }) => {
    await page.goto("/jobs");
    await expect(
      page.getByRole("button", { name: /apply in job engine/i }),
    ).toHaveCount(0);
    const apply = page
      .getByRole("link", { name: /apply on himalayas/i })
      .first();
    await expect(apply).toHaveAttribute("target", "_blank");
    await expect(apply).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("desktop launch confirms a semi-auto run and opens the workspace", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "progress");
    await page.goto("/jobs");
    await page
      .getByRole("button", { name: /apply in job engine/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: /start assisted application/i,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Senior Backend Engineer");
    await expect(dialog).toContainText("Apex Global");
    await expect(dialog).toContainText("Primary resume");
    await expect(dialog).not.toContainText("full_auto");
    const start = dialog.getByRole("button", {
      name: /start assisted application/i,
    });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${WORKSPACE_RUN_ID}/workspace`),
    );
    await expect(
      page.getByRole("heading", { name: "Application context" }),
    ).toBeVisible();
    await expect(page.getByText("Filling profile")).toBeVisible();
    await expect
      .poll(async () => {
        const telemetry = await bridgeTelemetry(page);
        return {
          opens: telemetry.opens.length,
          firstOpen: telemetry.opens[0] ?? null,
          firstEvent: telemetry.events[0] ?? null,
        };
      })
      .toEqual({
        opens: 1,
        firstOpen: { runId: WORKSPACE_RUN_ID },
        firstEvent: "bounds",
      });
  });

  test("review resolution, prepared submit, and confirmed receipt", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "review");
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    await expect(
      page.getByLabel("Are you willing to work in hybrid mode?"),
    ).toBeVisible();
    await expect(page.getByText("secret")).toHaveCount(0);
    await page
      .getByLabel("Are you willing to work in hybrid mode?")
      .fill("Yes, hybrid is fine");
    await page.getByRole("button", { name: /submit answers/i }).click();
    await expect(
      page.getByRole("button", { name: /submit application/i }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /submit application/i }).click();
    await expect(
      page.getByRole("heading", { name: "Submitted" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /submit application/i }),
    ).toBeDisabled();
  });

  test("auth pause resumes without collecting credentials", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "auth");
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    await expect(page.getByText(/never asks for credentials/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await page.getByRole("button", { name: /resume application/i }).click();
    await expect(
      page.getByRole("button", { name: /submit application/i }),
    ).toBeEnabled();
  });

  test("submission unknown shows allowlisted evidence metadata only", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "unknown");
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    await expect(
      page.getByRole("heading", { name: "Submission unknown" }),
    ).toBeVisible();
    await expect(page.getByText(/Type: receipt/i)).toBeVisible();
    await expect(page.getByText("runs/secret.log")).toHaveCount(0);
    await expect(page.getByText("cookie")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^retry$/i })).toHaveCount(0);
  });

  test("cancel marks the run cancelled", async ({ page }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "armed");
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    await page.getByRole("button", { name: /cancel run/i }).click();
    await expect(
      page.getByRole("heading", { name: "Cancelled" }),
    ).toBeVisible();
  });

  test("duplicate conflict shows the existing run and explicit override", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "conflict");
    await page.goto("/jobs");
    await page
      .getByRole("button", { name: /apply in job engine/i })
      .first()
      .click();
    const start = page
      .getByRole("dialog", { name: /start assisted application/i })
      .getByRole("button", {
        name: /start assisted application/i,
      });
    await expect(start).toBeEnabled();
    await start.click();
    const existing = page.getByRole("link", {
      name: /open existing application/i,
    });
    await expect(existing).toHaveAttribute(
      "href",
      `/applications/${EXISTING_RUN_ID}/workspace`,
    );
    await expect(page.getByRole("button", { name: /^retry$/i })).toHaveCount(0);
    await page.getByLabel(/override reason/i).fill("Previous attempt stalled");
    await page
      .getByRole("button", { name: /override and create a new run/i })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/applications/${WORKSPACE_RUN_ID}/workspace`),
    );
  });

  test("undersized window closes the native view and supported size reopens", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await setWorkspaceMode(page, "armed");
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    await expect
      .poll(async () => (await bridgeTelemetry(page)).opens.length)
      .toBeGreaterThan(0);
    await page.setViewportSize({ width: 1024, height: 700 });
    await expect(page.locator(".workspace-unsupported")).toContainText(/1280/);
    await expect
      .poll(async () => (await bridgeTelemetry(page)).closes)
      .toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect
      .poll(async () => (await bridgeTelemetry(page)).opens.length)
      .toBeGreaterThan(1);
  });

  test("leaving the workspace closes the native view", async ({ page }) => {
    await installDesktopBridge(page);
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    await expect(page.getByTestId("browser-viewport")).toBeVisible();
    await expect
      .poll(async () => (await bridgeTelemetry(page)).opens.length)
      .toBeGreaterThan(0);
    await page.getByRole("link", { name: /back to search/i }).click();
    await expect(page).toHaveURL(/\/jobs/);
    await expect
      .poll(async () => (await bridgeTelemetry(page)).closes)
      .toBeGreaterThan(0);
  });

  test("workspace axe scan reports 0 serious or critical violations", async ({
    page,
  }) => {
    await installDesktopBridge(page);
    await page.goto(`/applications/${WORKSPACE_RUN_ID}/workspace`);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = scan.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
