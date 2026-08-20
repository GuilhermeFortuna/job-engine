import { fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationModal } from "./ApplicationModal";

function TransitionHarness() {
  const [open, setOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div
        ref={fallbackRef}
        tabIndex={-1}
        aria-label="Stable launcher fallback"
      />
      {showTrigger ? (
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          Open launch confirmation
        </button>
      ) : null}
      {open ? (
        <ApplicationModal
          label="Launch confirmation"
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
          fallbackFocusRef={fallbackRef}
        >
          <button
            type="button"
            onClick={() => {
              setShowTrigger(false);
              setOpen(false);
            }}
          >
            Simulate capability transition
          </button>
        </ApplicationModal>
      ) : null}
    </div>
  );
}

describe("ApplicationModal", () => {
  it("restores focus to a stable fallback when the invoking target unmounts", () => {
    renderWithProviders(<TransitionHarness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open launch confirmation" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Simulate capability transition" }),
    );

    expect(
      screen.getByLabelText("Stable launcher fallback"),
    ).toHaveFocus();
  });
});
