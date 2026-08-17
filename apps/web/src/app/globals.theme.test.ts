import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "globals.css"),
  "utf8",
);

describe("dark theme tokens", () => {
  it("remaps job-card and shadcn surface variables under .dark", () => {
    const darkBlock = globalsCss.slice(globalsCss.lastIndexOf(".dark {"));

    expect(darkBlock).toContain("color-scheme: dark");
    expect(darkBlock).toMatch(/--color-bg:\s*#111111/);
    expect(darkBlock).toMatch(/--color-card-bg:\s*#1a1a1a/);
    expect(darkBlock).toMatch(/--color-fg:\s*#f4f4f5/);
    expect(darkBlock).toMatch(/--color-muted:\s*#a3a3a3/);
    expect(darkBlock).toMatch(/--color-primary-fg:\s*#111111/);
    expect(darkBlock).toContain("--background: var(--color-bg)");
    expect(darkBlock).toContain("--foreground: var(--color-fg)");
    expect(darkBlock).toContain("--card: var(--color-card-bg)");
  });
});
