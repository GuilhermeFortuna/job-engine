import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SAMPLE_JOB_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_JOB_ID = "33333333-3333-4333-8333-333333333333";

test.describe("Job Search and Resilience", () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.post("http://127.0.0.1:8088/api/v1/test/set-health", {
        data: { degraded: false },
      });
    } catch {}
  });

  test("1. URL-backed search and filter controls", async ({ page }) => {
    await page.goto("/jobs?q=backend&role_family=backend");

    await expect(
      page.getByRole("heading", { level: 1, name: "Software Engineering Jobs" }),
    ).toBeVisible();

    const keywordInput = page.getByLabel(/keywords/i);
    await expect(keywordInput).toHaveValue("backend");

    const jobTitleLink = page.getByRole("link", { name: "Senior Backend Engineer" });
    await expect(jobTitleLink).toBeVisible();
  });

  test("2. Job details page renders canonical data, transformation evidence, and provenance", async ({
    page,
  }) => {
    await page.goto(`/jobs/${SAMPLE_JOB_ID}`);

    // Main header
    await expect(
      page.getByRole("heading", { level: 1, name: "Senior Backend Engineer" }),
    ).toBeVisible();
    await expect(
      page.getByText(/original title as posted/i),
    ).toBeVisible();
    await expect(
      page.locator(".company-name").filter({ hasText: "Apex Global" }),
    ).toBeVisible();

    // Badges
    await expect(page.getByText("Remote", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Senior", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Full-time", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Status: Active")).toBeVisible();

    // Key details
    await expect(page.getByText("$110,000 - $140,000 USD per year").first()).toBeVisible();
    await expect(
      page.getByText(/candidates residing in brazil are eligible to apply/i).first(),
    ).toBeVisible();
    await expect(page.getByText("Python", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("FastAPI", { exact: true }).first()).toBeVisible();

    // Safe description text
    await expect(
      page.getByText(/Apex Global is seeking a Senior Backend Engineer/i),
    ).toBeVisible();

    // Provenance List
    await expect(
      page.getByRole("heading", { name: /source provenance & postings/i }),
    ).toBeVisible();
    await expect(page.getByText("him-apex-101")).toBeVisible();
    await expect(page.getByText("rok-apex-888")).toBeVisible();
  });

  test("3. Safe external application links use target=_blank and rel=noopener noreferrer", async ({
    page,
  }) => {
    await page.goto(`/jobs/${SAMPLE_JOB_ID}`);

    const primaryApply = page.getByRole("link", { name: /apply on himalayas/i }).first();
    await expect(primaryApply).toBeVisible();
    await expect(primaryApply).toHaveAttribute(
      "href",
      "https://himalayas.app/jobs/apex-senior-backend",
    );
    await expect(primaryApply).toHaveAttribute("target", "_blank");
    await expect(primaryApply).toHaveAttribute("rel", "noopener noreferrer");

    const remoteOkApply = page.getByRole("link", { name: /apply on remote ok/i });
    await expect(remoteOkApply).toBeVisible();
    await expect(remoteOkApply).toHaveAttribute(
      "href",
      "https://remoteok.com/l/apex-senior-backend-rok",
    );
    await expect(remoteOkApply).toHaveAttribute("target", "_blank");
    await expect(remoteOkApply).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("4. Return navigation from details back to search", async ({ page }) => {
    await page.goto("/jobs?q=backend");
    await page.getByRole("link", { name: "Senior Backend Engineer" }).click();

    await expect(page).toHaveURL(`/jobs/${SAMPLE_JOB_ID}`);

    const backLink = page.getByRole("link", { name: /back to search/i });
    await expect(backLink).toBeVisible();
    await backLink.click();

    await expect(page).toHaveURL(/\/jobs/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Software Engineering Jobs" }),
    ).toBeVisible();
  });

  test("5. Unknown/missing fields display truthful fallback copy", async ({ page }) => {
    await page.goto(`/jobs/${UNKNOWN_JOB_ID}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Software Engineer" }),
    ).toBeVisible();
    await expect(page.getByText(/compensation not provided/i).first()).toBeVisible();
    await expect(
      page.getByText(/no full description was provided/i),
    ).toBeVisible();
    await expect(page.getByText("Eligibility: Unknown").first()).toBeVisible();
    await expect(page.getByText("Remote: Unknown").first()).toBeVisible();
  });

  test("6. Not found state for invalid job ID", async ({ page }) => {
    await page.goto("/jobs/00000000-0000-0000-0000-000000000404");

    await expect(
      page.getByRole("heading", { name: /job opportunity not found/i }),
    ).toBeVisible();
    const backBtn = page.getByRole("link", { name: /back to job search/i });
    await expect(backBtn).toBeVisible();
  });

  test("7. Total error boundary with retry capability", async ({ page }) => {
    await page.goto("/jobs/error-500");

    await expect(page.locator(".jobs-error-container")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /unable to load job details/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("8. Partial source failure notice when catalog health reports degraded source", async ({
    page,
  }) => {
    // Set degraded mode in mock server
    await page.request.post("http://127.0.0.1:8088/api/v1/test/set-health", {
      data: { degraded: true },
    });

    await page.goto("/jobs");

    await expect(
      page.getByRole("heading", { name: /catalog notice: partial source degraded/i }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Affected sources").getByText("Jobicy"),
    ).toBeVisible();
    await expect(page.getByText("Ingestion Failed")).toBeVisible();

    // Results remain visible and interactive
    await expect(
      page.getByRole("heading", { level: 2, name: "Senior Backend Engineer" }),
    ).toBeVisible();
  });

  test("9. Responsive layout: zero horizontal overflow at 360px, 768px, and 1280px", async ({
    page,
  }) => {
    const viewports = [
      { width: 360, height: 740 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);

      // Check search page
      await page.goto("/jobs");
      const searchOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(searchOverflow, `Search page horizontal overflow at ${vp.width}px`).toBe(false);

      // Check details page
      await page.goto(`/jobs/${SAMPLE_JOB_ID}`);
      const detailsOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(detailsOverflow, `Details page horizontal overflow at ${vp.width}px`).toBe(false);
    }
  });

  test("10. Keyboard traversal: interactive elements receive visible focus", async ({
    page,
  }) => {
    await page.goto(`/jobs/${SAMPLE_JOB_ID}`);

    // Focus on back button and tab to next element
    const backBtn = page.getByRole("link", { name: /back to search/i });
    await backBtn.focus();
    await expect(backBtn).toBeFocused();

    await page.keyboard.press("Tab");
    const primaryApply = page.getByRole("link", { name: /apply on himalayas/i }).first();
    await expect(primaryApply).toBeFocused();
  });

  test("11. Automated Axe accessibility scan reports 0 serious/critical violations", async ({
    page,
  }) => {
    // Audit /jobs
    await page.goto("/jobs");
    const searchScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const searchCriticalOrSerious = searchScan.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      searchCriticalOrSerious,
      `Axe violations on /jobs: ${JSON.stringify(searchCriticalOrSerious, null, 2)}`,
    ).toEqual([]);

    // Audit /jobs/[jobGroupId]
    await page.goto(`/jobs/${SAMPLE_JOB_ID}`);
    const detailsScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const detailsCriticalOrSerious = detailsScan.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      detailsCriticalOrSerious,
      `Axe violations on /jobs/${SAMPLE_JOB_ID}: ${JSON.stringify(detailsCriticalOrSerious, null, 2)}`,
    ).toEqual([]);
  });
});
