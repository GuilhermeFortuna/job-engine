import { describe, expect, it } from "vitest";
import { validateAndClampBounds } from "../../src/main/application-view";

describe("Bounds Validation and Clipping", () => {
  const windowSize = { width: 1200, height: 800 };

  it("accepts valid bounds within window limits", () => {
    const bounds = validateAndClampBounds(
      { x: 100, y: 50, width: 800, height: 600 },
      windowSize
    );
    expect(bounds).toEqual({
      x: 100,
      y: 50,
      width: 800,
      height: 600,
    });
  });

  it("clamps negative coordinates to 0", () => {
    const bounds = validateAndClampBounds(
      { x: -50, y: -100, width: 500, height: 400 },
      windowSize
    );
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(500);
    expect(bounds.height).toBe(400);
  });

  it("clamps oversized dimensions to window boundary", () => {
    const bounds = validateAndClampBounds(
      { x: 200, y: 100, width: 2000, height: 1500 },
      windowSize
    );
    expect(bounds.x).toBe(200);
    expect(bounds.y).toBe(100);
    expect(bounds.width).toBe(1000); // 1200 - 200
    expect(bounds.height).toBe(700); // 800 - 100
  });

  it("handles non-finite and NaN values gracefully", () => {
    const bounds = validateAndClampBounds(
      {
        x: NaN,
        y: Infinity,
        width: -Infinity,
        height: 500,
      },
      windowSize
    );
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(500);
  });

  it("handles coordinates placed outside window bounds", () => {
    const bounds = validateAndClampBounds(
      { x: 1500, y: 1000, width: 400, height: 300 },
      windowSize
    );
    expect(bounds.x).toBe(1200);
    expect(bounds.y).toBe(800);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });
});
