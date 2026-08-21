import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ExtractionReview } from "./ExtractionReview";
import type { LocalAiProposal } from "../types";

const proposal: LocalAiProposal = {
  id: "prop-1",
  profile_id: "p1",
  source_asset_id: "a1",
  source_asset_sha256: "ab",
  status: "pending",
  schema_revision: "1",
  prompt_revision: "1",
  model: "mock",
  fields: [
    {
      field_path: "first_name",
      value: "Ada",
      evidence: [{ start: 0, end: 3, excerpt: "Ada" }],
      confidence: 0.9,
    },
  ],
  failure_code: null,
  deterministic_extraction_ok: true,
  accepted_field_paths: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("ExtractionReview", () => {
  it("accepts selected suggestions with edits", async () => {
    const onAcceptSelected = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExtractionReview
        proposal={proposal}
        onAcceptSelected={onAcceptSelected}
        onDeclineAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Suggestion")).toBeInTheDocument();
    expect(screen.getByText(/Source:/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Edit First Name"), {
      target: { value: "Augusta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept selected" }));

    await waitFor(() => expect(onAcceptSelected).toHaveBeenCalledOnce());
    expect(onAcceptSelected).toHaveBeenCalledWith({
      acceptedPaths: ["first_name"],
      edits: { first_name: "Augusta" },
    });
  });
});
