import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileSwitcher } from "./ProfileSwitcher";

const switchProfile = vi.fn();

vi.mock("../ProfileProvider", () => ({
  useProfile: () => ({
    profiles: [
      { id: "profile-1", display_name: "Ada", archived_at: null },
      { id: "profile-2", display_name: "Grace", archived_at: null },
    ],
    activeProfile: { id: "profile-1", display_name: "Ada" },
    activeProfileId: "profile-1",
    isLoading: false,
    switchProfile,
  }),
}));

describe("ProfileSwitcher", () => {
  it("moves focus into the menu and supports arrow navigation", () => {
    render(<ProfileSwitcher />);
    const trigger = screen.getByRole("button", { name: /Ada/ });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menuitemradio", { name: /Ada/ })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(screen.getByRole("menuitemradio", { name: /Grace/ })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Open Profile" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
