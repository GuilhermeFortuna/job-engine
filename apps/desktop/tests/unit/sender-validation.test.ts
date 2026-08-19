import { describe, expect, it } from "vitest";
import { isTrustedSender } from "../../src/main/ipc";

describe("IPC Sender Validation", () => {
  const trustedOrigin = "http://127.0.0.1:3000";

  it("authorizes events originating from the exact trusted origin", () => {
    const mockEvent: any = {
      senderFrame: {
        url: "http://127.0.0.1:3000/applications/workspace",
      },
    };
    expect(isTrustedSender(mockEvent, trustedOrigin)).toBe(true);
  });

  it("rejects events from different origins or ports", () => {
    const mockEvent1: any = {
      senderFrame: {
        url: "http://127.0.0.1:3001/applications",
      },
    };
    expect(isTrustedSender(mockEvent1, trustedOrigin)).toBe(false);

    const mockEvent2: any = {
      senderFrame: {
        url: "https://evil-site.com/attack",
      },
    };
    expect(isTrustedSender(mockEvent2, trustedOrigin)).toBe(false);
  });

  it("rejects events missing senderFrame or with invalid URLs", () => {
    expect(isTrustedSender({} as any, trustedOrigin)).toBe(false);
    expect(
      isTrustedSender(
        { senderFrame: { url: "not-a-valid-url" } } as any,
        trustedOrigin
      )
    ).toBe(false);
  });
});
