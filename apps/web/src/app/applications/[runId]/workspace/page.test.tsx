import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import ApplicationWorkspacePage from "./page";

vi.mock(
  "@/features/applications/components/ApplicationWorkspace",
  () => ({
    ApplicationWorkspace: (props: {
      runId: string;
      launchOutcome: string | null;
    }) => (
      <div>
        Workspace {props.runId} outcome {props.launchOutcome ?? "none"}
      </div>
    ),
  }),
);

describe("application workspace route", () => {
  it("passes only the safe launch outcome query token to the workspace", async () => {
    const view = await ApplicationWorkspacePage({
      params: Promise.resolve({ runId: "run-1" }),
      searchParams: Promise.resolve({
        launch: "desktop_open_requested",
      }),
    });
    renderWithProviders(view);
    expect(
      screen.getByText("Workspace run-1 outcome desktop_open_requested"),
    ).toBeInTheDocument();
  });

  it("drops an unsafe launch outcome query value", async () => {
    const view = await ApplicationWorkspacePage({
      params: Promise.resolve({ runId: "run-1" }),
      searchParams: Promise.resolve({
        launch: "/home/owner/resume.pdf?secret=1",
      }),
    });
    renderWithProviders(view);
    expect(screen.getByText("Workspace run-1 outcome none")).toBeInTheDocument();
  });
});
