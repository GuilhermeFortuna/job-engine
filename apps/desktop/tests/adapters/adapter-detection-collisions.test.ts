import { beforeEach, describe, expect, it } from "vitest";

import { createDefaultAdapterRegistry } from "../../src/main/adapters/registry";
import { GenericFormAdapter } from "../../src/main/adapters/generic";
import { GreenhouseFormAdapter } from "../../src/main/adapters/greenhouse";
import { LeverFormAdapter } from "../../src/main/adapters/lever";
import type { AdapterContext } from "../../src/main/adapters/contract";
import { pageRuntimeScript } from "../../src/main/forms/page-script";

function makeContext(url: string): AdapterContext {
  return {
    callInIsolatedWorld: async (args) => pageRuntimeScript(args),
    currentUrl: () => new URL(url),
    waitForStable: async () => undefined,
    attachResume: async () => ({ attached: false }),
  };
}

function renderLeverApply(): void {
  document.body.innerHTML = `
    <form id="application-form">
      <label for="resume">Resume/CV</label>
      <input id="resume" type="file" required />
      <label for="name">Full name</label>
      <input id="name" required />
      <button type="submit">Submit application</button>
    </form>
  `;
}

function renderGreenhouseShaped(): void {
  document.body.innerHTML = `
    <form id="application_form">
      <label for="first_name">First Name</label>
      <input id="first_name" required />
      <label for="last_name">Last Name</label>
      <input id="last_name" required />
      <label for="email">Email</label>
      <input id="email" type="email" required />
      <button type="submit">Submit Application</button>
    </form>
  `;
}

function renderGenericApply(): void {
  document.body.innerHTML = `
    <label for="name">Full name</label><input id="name" required />
    <label for="email">Email</label><input id="email" required />
    <button type="submit">Submit application</button>
  `;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("adapter-detection-collisions", () => {
  const lever = new LeverFormAdapter();
  const greenhouse = new GreenhouseFormAdapter();
  const generic = new GenericFormAdapter();
  const registry = createDefaultAdapterRegistry();

  it("routes approved Lever apply URLs to lever, not generic", () => {
    expect(
      registry.resolve("https://jobs.lever.co/acme/job-42/apply")?.adapterId,
    ).toBe("lever");
  });

  it("does not let Lever match Greenhouse or generic hosts", () => {
    expect(
      lever.matches(new URL("https://boards.greenhouse.io/acme/jobs/12345")),
    ).toBe(false);
    expect(lever.matches(new URL("https://jobs.example.com/apply"))).toBe(false);
  });

  it("rejects Greenhouse-shaped First/Last name forms on a Lever apply URL", async () => {
    renderGreenhouseShaped();
    const context = makeContext("https://jobs.lever.co/acme/job-42/apply");
    expect(await lever.detect(context)).toBe(false);
    expect(await greenhouse.detect(context)).toBe(false);
  });

  it("rejects a Lever apply form hosted on a Greenhouse URL", async () => {
    renderLeverApply();
    const context = makeContext("https://boards.greenhouse.io/acme/jobs/12345");
    expect(await lever.detect(context)).toBe(false);
    expect(registry.resolve(context.currentUrl().href)?.adapterId).toBe(
      "greenhouse",
    );
  });

  it("does not detect generic Full name fixtures as Lever", async () => {
    renderGenericApply();
    const context = makeContext("https://jobs.example.com/apply");
    expect(lever.matches(context.currentUrl())).toBe(false);
    expect(await lever.detect(context)).toBe(false);
    expect(await generic.detect(context)).toBe(true);
    expect(registry.resolve(context.currentUrl().href)?.adapterId).toBe("generic");
  });

  it("keeps posting URLs on Lever without detecting them as assistable", async () => {
    document.body.innerHTML = `<a href="/acme/job-42/apply">apply for this job</a>`;
    const context = makeContext("https://jobs.lever.co/acme/job-42");
    expect(lever.matches(context.currentUrl())).toBe(true);
    expect(await lever.detect(context)).toBe(false);
    expect(registry.resolve(context.currentUrl().href)?.adapterId).toBe("lever");
  });
});
