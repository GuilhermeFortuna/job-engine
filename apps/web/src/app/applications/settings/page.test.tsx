import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApplicationSettingsPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("Application settings redirect", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockReset();
  });

  it("permanently redirects to /profile", () => {
    ApplicationSettingsPage();
    expect(redirect).toHaveBeenCalledWith("/profile");
  });
});
