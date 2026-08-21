import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));
vi.mock("@/components/catalog-backdrop", () => ({
  CatalogBackdrop: () => null,
}));
vi.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));
vi.mock("@/features/profiles/ProfileProvider", () => ({
  ProfileProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/profiles/components/ProfileRouteGuard", () => ({
  ProfileRouteGuard: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/profiles/components/ProfileSwitcher", () => ({
  ProfileSwitcher: () => <button type="button">Profiles</button>,
}));

describe("RootLayout navigation", () => {
  it("keeps Jobs, Applications, and Profile with the profile switcher", () => {
    render(
      <RootLayout>
        <p>Page content</p>
      </RootLayout>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    });
    expect(navigation).toContainElement(
      screen.getByRole("link", { name: "Jobs" }),
    );
    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "href",
      "/applications",
    );
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("button", { name: "Profiles" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();
  });
});
