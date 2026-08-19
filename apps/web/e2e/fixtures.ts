import { test as base, expect } from "@playwright/test";

/**
 * Pin media features to the GitHub-hosted Ubuntu runner: light color scheme
 * and motion enabled. Host OS dark theme or prefers-reduced-motion otherwise
 * hides contrast bugs and swaps JobCardShell onto a different click target.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.emulateMedia({
      colorScheme: "light",
      reducedMotion: "no-preference",
    });
    await provide(page);
  },
});

export { expect };
