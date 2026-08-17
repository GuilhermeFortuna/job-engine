import { describe, expect, it } from "vitest";
import { Pagination, generatePageWindow } from "./Pagination";
import { DEFAULT_SEARCH_PARAMS } from "../search-params";
import { renderWithProviders, screen } from "@/test/render";

describe("Pagination component", () => {
  describe("generatePageWindow", () => {
    it("returns all pages when totalPages <= 7", () => {
      expect(generatePageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(generatePageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("returns bounded window with ending ellipsis when at start", () => {
      expect(generatePageWindow(2, 10)).toEqual([1, 2, 3, 4, 5, "...", 10]);
    });

    it("returns bounded window with starting ellipsis when near end", () => {
      expect(generatePageWindow(8, 10)).toEqual([1, "...", 6, 7, 8, 9, 10]);
    });

    it("returns bounded window with dual ellipses when in middle", () => {
      expect(generatePageWindow(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
    });
  });

  describe("component rendering", () => {
    it("returns null when totalPages <= 1", () => {
      const { container } = renderWithProviders(
        <Pagination
          currentPage={1}
          totalPages={1}
          params={DEFAULT_SEARCH_PARAMS}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("disables Previous on page 1 and keeps Next active", () => {
      renderWithProviders(
        <Pagination
          currentPage={1}
          totalPages={5}
          params={{ ...DEFAULT_SEARCH_PARAMS, q: "python" }}
        />,
      );

      const prevDisabled = screen.getByText("← Previous");
      expect(prevDisabled.tagName).toBe("SPAN");
      expect(prevDisabled).toHaveAttribute("aria-disabled", "true");

      const nextLink = screen.getByRole("link", { name: "Go to next page" });
      expect(nextLink).toHaveAttribute("href", "/jobs?q=python&page=2");
    });

    it("disables Next on last page and keeps Previous active", () => {
      renderWithProviders(
        <Pagination
          currentPage={5}
          totalPages={5}
          params={{ ...DEFAULT_SEARCH_PARAMS, q: "python" }}
        />,
      );

      const nextDisabled = screen.getByText("Next →");
      expect(nextDisabled.tagName).toBe("SPAN");
      expect(nextDisabled).toHaveAttribute("aria-disabled", "true");

      const prevLink = screen.getByRole("link", { name: "Go to previous page" });
      expect(prevLink).toHaveAttribute("href", "/jobs?q=python&page=4");
    });

    it("marks current page with aria-current='page'", () => {
      renderWithProviders(
        <Pagination
          currentPage={3}
          totalPages={5}
          params={DEFAULT_SEARCH_PARAMS}
        />,
      );

      const current = screen.getByText("3");
      expect(current).toHaveAttribute("aria-current", "page");
      expect(current.tagName).toBe("SPAN");
    });

    it("preserves active query filters in page numbers", () => {
      renderWithProviders(
        <Pagination
          currentPage={1}
          totalPages={5}
          params={{
            ...DEFAULT_SEARCH_PARAMS,
            role_family: ["backend"],
            minimum_annual_usd: 80000,
          }}
        />,
      );

      const page2Link = screen.getByRole("link", { name: "Go to page 2" });
      expect(page2Link).toHaveAttribute(
        "href",
        "/jobs?role_family=backend&minimum_annual_usd=80000&page=2",
      );
    });
  });
});
