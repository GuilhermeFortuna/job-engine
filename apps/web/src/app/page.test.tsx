import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("root page", () => {
  it("redirects to /jobs", () => {
    HomePage();
    expect(redirect).toHaveBeenCalledWith("/jobs");
  });
});
