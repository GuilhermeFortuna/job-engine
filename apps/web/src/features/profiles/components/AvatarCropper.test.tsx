import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { AvatarCropper } from "./AvatarCropper";

describe("AvatarCropper", () => {
  it("moves the crop rectangle with keyboard arrows", () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <AvatarCropper
        imageUrl="blob:mock"
        initialCrop={{ x: 0.2, y: 0.2, width: 0.5, height: 0.5 }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const stage = screen.getByRole("img", { name: "Square crop preview" });
    stage.focus();
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    fireEvent.keyDown(stage, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Save crop" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    const crop = onConfirm.mock.calls[0]![0] as {
      x: number;
      y: number;
    };
    expect(crop.x).toBeGreaterThan(0.2);
    expect(crop.y).toBeGreaterThan(0.2);
  });
});
