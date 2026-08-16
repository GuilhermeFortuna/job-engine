import { describe, expect, it } from "vitest";
import RootLayout from "./layout";
import HomePage from "./page";
import { renderWithProviders, screen } from "@/test/render";

describe("foundation page", () => {
  it("renders one descriptive heading, landmarks, and a truthful foundation message", () => {
    renderWithProviders(
      <RootLayout>
        <HomePage />
      </RootLayout>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Job Engine V1 search is being built",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByText(
        /this foundation screen is not a live job catalog/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/software engineer/i)).not.toBeInTheDocument();
  });
});
