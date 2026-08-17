import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ExternalApplyLink, isValidHttpUrl } from "./ExternalApplyLink";

describe("isValidHttpUrl", () => {
  it("accepts valid https and http URLs", () => {
    expect(isValidHttpUrl("https://example.com/job/123")).toBe(true);
    expect(isValidHttpUrl("http://example.org/apply")).toBe(true);
    expect(isValidHttpUrl("  https://example.com  ")).toBe(true);
  });

  it("rejects non-http protocols and malformed strings", () => {
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("data:text/html,test")).toBe(false);
    expect(isValidHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isValidHttpUrl("/local/relative/path")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl(null)).toBe(false);
    expect(isValidHttpUrl(undefined)).toBe(false);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
  });
});

describe("ExternalApplyLink", () => {
  it("renders a secure external link for valid HTTPS URLs", () => {
    renderWithProviders(
      <ExternalApplyLink
        url="https://himalayas.app/jobs/123"
        sourceName="Himalayas"
      />,
    );

    const link = screen.getByRole("link", { name: /apply on himalayas/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://himalayas.app/jobs/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders fallback message when URL is invalid or unsafe", () => {
    renderWithProviders(
      <ExternalApplyLink url="javascript:void(0)" sourceName="Evil" />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(/application link unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders fallback message when URL is null or empty", () => {
    renderWithProviders(<ExternalApplyLink url={null} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(/application link unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders custom children when provided", () => {
    renderWithProviders(
      <ExternalApplyLink url="https://jobicy.com/job/456">
        <span>Custom Apply Button</span>
      </ExternalApplyLink>,
    );

    expect(
      screen.getByRole("link", { name: /custom apply button/i }),
    ).toBeInTheDocument();
  });
});
