import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";
import { renderWithProviders, screen } from "@/test/render";

const themeState = vi.hoisted(() => ({
  resolvedTheme: "light" as "light" | "dark",
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolvedTheme,
    setTheme: themeState.setTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    themeState.resolvedTheme = "light";
    themeState.setTheme.mockReset();
    document.documentElement.classList.remove("dark");
  });

  it("calls setTheme with dark when the current theme is light", async () => {
    renderWithProviders(<ThemeToggle />);

    fireEvent.click(await screen.findByRole("button", { name: "Toggle theme" }));

    await waitFor(() => {
      expect(themeState.setTheme).toHaveBeenCalledWith("dark");
    });
  });

  it("calls setTheme with light when the current theme is dark", async () => {
    themeState.resolvedTheme = "dark";
    renderWithProviders(<ThemeToggle />);

    fireEvent.click(await screen.findByRole("button", { name: "Toggle theme" }));

    await waitFor(() => {
      expect(themeState.setTheme).toHaveBeenCalledWith("light");
    });
  });
});
