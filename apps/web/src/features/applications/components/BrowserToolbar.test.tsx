import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { BrowserToolbar } from "./BrowserToolbar";
import { INITIAL_BROWSER_STATE } from "../desktop-bridge";

describe("BrowserToolbar", () => {
  it("announces loading, blocked navigation, and desktop-unavailable states", () => {
    const { rerender } = renderWithProviders(
      <BrowserToolbar
        desktopAvailable={false}
        browserState={INITIAL_BROWSER_STATE}
        onBack={() => {}}
        onForward={() => {}}
        onReload={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/desktop unavailable/i);

    rerender(
      <BrowserToolbar
        desktopAvailable
        browserState={{
          ...INITIAL_BROWSER_STATE,
          isLoading: true,
          displayUrl: "https://boards.greenhouse.io/acme/jobs/1",
          blockedNavigationReason: "UNAPPROVED_NAVIGATION",
        }}
        onBack={() => {}}
        onForward={() => {}}
        onReload={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/navigation blocked/i);
  });

  it("enables trusted back, forward, and reload from browser state", () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    const onReload = vi.fn();
    renderWithProviders(
      <BrowserToolbar
        desktopAvailable
        browserState={{
          ...INITIAL_BROWSER_STATE,
          canGoBack: true,
          canGoForward: true,
          displayUrl: "https://boards.greenhouse.io/acme",
        }}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^forward$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^reload$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onForward).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
