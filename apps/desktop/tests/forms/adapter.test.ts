import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdapterRegistry, createDefaultAdapterRegistry, hostMatches } from "../../src/main/adapters/registry";
import { GenericFormAdapter } from "../../src/main/adapters/generic";
import type { AdapterContext, FormAdapter } from "../../src/main/adapters/contract";
import { pageRuntimeScript } from "../../src/main/forms/page-script";

/** Drives the real page script against the jsdom document. */
function makeContext(url = "https://jobs.example.com/apply"): AdapterContext {
  return {
    callInIsolatedWorld: async (args) => pageRuntimeScript(args),
    currentUrl: () => new URL(url),
    waitForStable: async () => undefined,
    attachResume: async () => ({ attached: false }),
  };
}

function fakeAdapter(id: string, host: string): FormAdapter {
  return {
    adapterId: id,
    capability: {
      familyId: id,
      supportTier: "AUTO_SUPPORTED",
      reasonCode: null,
    },
    matches: (url) => hostMatches(url, host),
  } as FormAdapter;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("hostMatches", () => {
  it("accepts the exact host and real subdomains", () => {
    expect(hostMatches(new URL("https://greenhouse.io/x"), "greenhouse.io")).toBe(
      true,
    );
    expect(
      hostMatches(new URL("https://boards.greenhouse.io/x"), "greenhouse.io"),
    ).toBe(true);
  });

  it("rejects hosts that merely contain the name", () => {
    for (const hostile of [
      "https://greenhouse.io.attacker.com/x",
      "https://evil-greenhouse.io/x",
      "https://notgreenhouse.io/x",
      "https://greenhouse.io.co/x",
    ]) {
      expect(hostMatches(new URL(hostile), "greenhouse.io")).toBe(false);
    }
  });

  it("is case insensitive", () => {
    expect(hostMatches(new URL("https://BOARDS.GREENHOUSE.IO/x"), "greenhouse.io"))
      .toBe(true);
  });
});

describe("AdapterRegistry", () => {
  const generic = new GenericFormAdapter();

  it("prefers a platform adapter over the generic fallback", () => {
    const registry = new AdapterRegistry(
      [fakeAdapter("greenhouse", "greenhouse.io")],
      generic,
    );
    expect(registry.resolve("https://boards.greenhouse.io/x")?.adapterId).toBe(
      "greenhouse",
    );
    expect(registry.resolve("https://jobs.other.com/x")?.adapterId).toBe(
      "generic",
    );
  });

  it("resolves default platform adapters via createDefaultAdapterRegistry", () => {
    const registry = createDefaultAdapterRegistry();
    expect(
      registry.resolve("https://boards.greenhouse.io/acme/jobs/12345")?.adapterId,
    ).toBe("greenhouse");
    expect(
      registry.resolve("https://jobs.lever.co/acme/abc-123/apply")?.adapterId,
    ).toBe("lever");
    expect(
      registry.resolve("https://jobs.other.com/apply")?.adapterId,
    ).toBe("generic");
  });

  it("classifies feed listing hosts as FEED_LISTING_UNRESOLVED", () => {
    const registry = createDefaultAdapterRegistry();
    const result = registry.classify(
      "https://jobicy.com/jobs/150001-python-engineer-brazil",
    );
    expect(result?.supportTier).toBe("UNSUPPORTED");
    expect(result?.reasonCode).toBe("FEED_LISTING_UNRESOLVED");
    expect(registry.resolve("https://jobicy.com/jobs/150001")).toBeNull();
  });

  it("labels unbound first-party Lever EU as missing evidence, not lookalike", () => {
    const registry = createDefaultAdapterRegistry();
    expect(
      registry.classify("https://jobs.eu.lever.co/acme/job/apply")?.reasonCode,
    ).toBe("MISSING_ADAPTER_EVIDENCE");
    expect(registry.resolve("https://jobs.eu.lever.co/acme/job/apply")).toBeNull();
  });

  it("rejects hostile ATS lookalikes via suffix and infix checks", () => {
    const registry = createDefaultAdapterRegistry();
    expect(
      registry.classify("https://evil.boards.greenhouse.io/acme/jobs/1")?.reasonCode,
    ).toBe("LOOKALIKE_HOST");
    expect(
      registry.classify("https://boards.greenhouse.io.evil.test/acme/jobs/1")
        ?.reasonCode,
    ).toBe("LOOKALIKE_HOST");
    expect(registry.resolve("https://evil.boards.greenhouse.io/x")).toBeNull();
  });

  it("classifies ambiguous multi-match as AMBIGUOUS_DETECTION", () => {
    const twinA = fakeAdapter("twin-a", "boards.example.test");
    const twinB = fakeAdapter("twin-b", "boards.example.test");
    const registry = new AdapterRegistry([twinA, twinB], generic);
    expect(
      registry.classify("https://boards.example.test/apply")?.reasonCode,
    ).toBe("AMBIGUOUS_DETECTION");
    expect(registry.resolve("https://boards.example.test/apply")).toBeNull();
  });

  it("falls approved Greenhouse hosts with unapproved paths to generic", () => {
    const registry = createDefaultAdapterRegistry();
    const result = registry.classify(
      "https://boards.greenhouse.io/embed/job_app",
    );
    expect(result?.adapter?.adapterId).toBe("generic");
    expect(result?.reasonCode).toBe("UNAPPROVED_ATS_PATH");
  });

  it("hard-vetoes the loopback coverage-veto fixture path", () => {
    const registry = createDefaultAdapterRegistry();
    expect(
      registry.classify(
        "https://127.0.0.1:8443/__job-engine/coverage-veto/missing-adapter-evidence",
      ),
    ).toMatchObject({
      familyId: "ashby",
      supportTier: "UNSUPPORTED",
      reasonCode: "MISSING_ADAPTER_EVIDENCE",
      adapter: null,
    });
  });

  it("hard-vetoes Ashby and SmartRecruiters without registering them", () => {
    const registry = createDefaultAdapterRegistry();
    expect(registry.registeredIds).toEqual(["greenhouse", "lever"]);
    const ashby = registry.classify("https://jobs.ashbyhq.com/acme/role-1");
    expect(ashby?.familyId).toBe("ashby");
    expect(ashby?.supportTier).toBe("UNSUPPORTED");
    expect(ashby?.reasonCode).toBe("MISSING_ADAPTER_EVIDENCE");
    expect(ashby?.adapter).toBeNull();
    expect(registry.resolve("https://jobs.ashbyhq.com/acme/role-1")).toBeNull();

    const smart = registry.classify(
      "https://jobs.smartrecruiters.com/acme/abc/slug",
    );
    expect(smart?.familyId).toBe("smartrecruiters");
    expect(smart?.reasonCode).toBe("MISSING_ADAPTER_EVIDENCE");
    expect(
      registry.resolve("https://jobs.smartrecruiters.com/acme/abc/slug"),
    ).toBeNull();
  });

  it("hard-vetoes Workday via LEGAL_GATE", () => {
    const registry = createDefaultAdapterRegistry();
    expect(
      registry.classify(
        "https://acme.myworkdayjobs.com/en-US/careers/job/Role",
      )?.reasonCode,
    ).toBe("LEGAL_GATE");
    expect(
      registry.resolve(
        "https://acme.myworkdayjobs.com/en-US/careers/job/Role",
      ),
    ).toBeNull();
  });

  it("never resolves a non-HTTPS or malformed URL", () => {
    const registry = new AdapterRegistry([], generic);
    for (const bad of [
      "http://jobs.example.com/apply",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<h1>x",
      "not a url",
      "",
    ]) {
      expect(registry.resolve(bad)).toBeNull();
    }
  });

  it("refuses duplicate adapter IDs", () => {
    expect(
      () =>
        new AdapterRegistry(
          [fakeAdapter("dup", "a.com"), fakeAdapter("dup", "b.com")],
          generic,
        ),
    ).toThrow(/Duplicate adapter ID/);
  });
});

describe("GenericFormAdapter", () => {
  const adapter = new GenericFormAdapter();

  it("keeps the generic runtime free of platform-specific selectors", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const sources = [
      ...walk("src/main/forms"),
      ...walk("src/main/runtime"),
      "src/main/adapters/contract.ts",
      "src/main/adapters/generic.ts",
    ].filter((f) => f.endsWith(".ts"));

    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const text = readFileSync(file, "utf8").toLowerCase();
      expect(text, `${file} must stay browser-neutral`).not.toContain(
        "greenhouse",
      );
      expect(text, `${file} must stay browser-neutral`).not.toContain("lever");
    }
  });

  it("detects a page with an application form", async () => {
    document.body.innerHTML = `
      <label for="a">Email</label><input id="a" />
      <button type="submit">Submit application</button>
    `;
    expect(await adapter.detect(makeContext())).toBe(true);
  });

  it("does not detect an unrelated page", async () => {
    document.body.innerHTML = `<p>About our company</p>`;
    expect(await adapter.detect(makeContext())).toBe(false);
  });

  it("only fills fields the current observation reported", async () => {
    document.body.innerHTML = `<label for="a">Email</label><input id="a" />`;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    const key = observation.fields[0].semanticKey;

    const result = await adapter.fillStep(context, observation, [
      {
        semanticKey: key,
        fieldFingerprint: adapter.fingerprintFor(key),
        value: "a@b.co",
        checked: null,
        decision: {} as never,
      },
      {
        // A stale decision for a field this observation did not see.
        semanticKey: "stale-key-from-a-previous-step",
        fieldFingerprint: "deadbeef",
        value: "leaked",
        checked: null,
        decision: {} as never,
      },
    ]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].semanticKey).toBe(key);
    expect(document.body.innerHTML).not.toContain("leaked");
  });

  it("does not call into the page when nothing is authorized", async () => {
    document.body.innerHTML = `<label for="a">Email</label><input id="a" />`;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    const spy = vi.spyOn(context, "callInIsolatedWorld");
    const result = await adapter.fillStep(context, observation, []);
    expect(result.results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats a step offering both continue and submit as intermediate", async () => {
    document.body.innerHTML = `
      <button type="button">Continue</button>
      <button type="submit">Submit application</button>
    `;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    expect(await adapter.detectReview(context, observation)).toBe(false);
  });

  it("treats a submit-only step as the review step", async () => {
    document.body.innerHTML = `<button type="submit">Submit application</button>`;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    expect(await adapter.detectReview(context, observation)).toBe(true);
  });

  it("advances using the page's own continue control", async () => {
    document.body.innerHTML = `<button type="button" id="n">Continue</button>`;
    let clicked = false;
    document.getElementById("n")!.addEventListener("click", () => {
      clicked = true;
    });
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    expect((await adapter.advance(context, observation)).activated).toBe(true);
    expect(clicked).toBe(true);
  });

  it("reports no receipt while a form is still present", async () => {
    document.body.innerHTML = `
      <label for="a">Email</label><input id="a" />
      <button type="submit">Submit application</button>
    `;
    expect(await adapter.captureReceipt(makeContext())).toBeNull();
  });

  it("captures a confirmed receipt without copying page text", async () => {
    document.body.innerHTML = `
      <h1>Thank you for applying</h1>
      <p>We emailed dakota@example.com about role 12345.</p>
    `;
    const receipt = await adapter.captureReceipt(
      makeContext("https://jobs.example.com/apply/done?token=secret"),
    );
    expect(receipt).not.toBeNull();
    expect(receipt!.confirmationSignal).toBe("confirmation_text");
    // The query string and any page text stay out of the receipt.
    expect(JSON.stringify(receipt)).not.toContain("secret");
    expect(JSON.stringify(receipt)).not.toContain("dakota@example.com");
    expect(receipt!.finalUrl).toBe("https://jobs.example.com/apply/done");
  });

  it("keeps an unconfirmed empty page ambiguous", async () => {
    document.body.innerHTML = `<h1>Something went wrong</h1>`;
    const receipt = await adapter.captureReceipt(makeContext());
    expect(receipt!.confirmationSignal).toBe("form_cleared");
  });
});
