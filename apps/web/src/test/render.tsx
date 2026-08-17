import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "queries">,
) {
  return render(ui, options);
}

export { screen, within } from "@testing-library/react";
