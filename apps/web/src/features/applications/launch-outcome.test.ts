import { describe, expect, it } from "vitest";
import {
  parseLaunchOutcome,
  workspaceLaunchPath,
} from "./launch-outcome";

describe("launch outcome handoff", () => {
  it("builds allowlisted destination tokens without sensitive detail", () => {
    expect(
      workspaceLaunchPath("run-1", "desktop_open_requested"),
    ).toBe("/applications/run-1/workspace?launch=desktop_open_requested");
    expect(
      workspaceLaunchPath("run-1", "desktop_open_unavailable"),
    ).toBe("/applications/run-1/workspace?launch=desktop_open_unavailable");
  });

  it("accepts only typed safe launch outcomes", () => {
    expect(parseLaunchOutcome("desktop_open_requested")).toBe(
      "desktop_open_requested",
    );
    expect(parseLaunchOutcome("desktop_open_unavailable")).toBe(
      "desktop_open_unavailable",
    );
    expect(parseLaunchOutcome("/home/owner/resume.pdf?secret=1")).toBeNull();
    expect(parseLaunchOutcome(undefined)).toBeNull();
  });
});
