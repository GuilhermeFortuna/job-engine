import { beforeEach, describe, expect, it } from "vitest";

import { LeverFormAdapter } from "../../src/main/adapters/lever";
import type { AdapterContext } from "../../src/main/adapters/contract";
import { pageRuntimeScript } from "../../src/main/forms/page-script";

const APPLY = "https://jobs.lever.co/acme/job-42/apply";
const POSTING = "https://jobs.lever.co/acme/job-42";
const THANKS = "https://jobs.lever.co/acme/job-42/thanks";

function makeContext(url = APPLY): AdapterContext {
  return {
    callInIsolatedWorld: async (args) => pageRuntimeScript(args),
    currentUrl: () => new URL(url),
    waitForStable: async () => undefined,
    attachResume: async () => ({ attached: false }),
  };
}

function renderApplyForm(): void {
  document.body.innerHTML = `
    <form id="application-form">
      <h2>Submit your application</h2>
      <label for="resume">Resume/CV</label>
      <input id="resume" name="resume" type="file" required />
      <label for="name">Full name</label>
      <input id="name" name="name" required />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label for="phone">Phone</label>
      <input id="phone" name="phone" type="tel" />
      <label for="org">Current company</label>
      <input id="org" name="org" />
      <label for="location">Current location</label>
      <input id="location" name="location" />
      <label for="linkedin">LinkedIn URL</label>
      <input id="linkedin" name="urls[LinkedIn]" />
      <fieldset class="eeo-section">
        <legend>Gender</legend>
        <label><input type="radio" name="eeo_gender" value="decline" /> Decline to self-identify</label>
        <label><input type="radio" name="eeo_gender" value="female" /> Female</label>
      </fieldset>
      <button type="submit">Submit application</button>
    </form>
  `;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("LeverFormAdapter.matches", () => {
  const adapter = new LeverFormAdapter();

  it("accepts posting, apply, and thanks path families", () => {
    expect(adapter.matches(new URL(POSTING))).toBe(true);
    expect(adapter.matches(new URL(APPLY))).toBe(true);
    expect(adapter.matches(new URL(THANKS))).toBe(true);
    expect(adapter.matches(new URL(`${APPLY}/`))).toBe(true);
    expect(
      adapter.matches(new URL("https://jobs.lever.co/Osmind/49c5fbef-757c-40bb-9f60-ae09bc1f5f29/apply")),
    ).toBe(true);
  });

  it("accepts query strings without broadening the path", () => {
    expect(adapter.matches(new URL(`${APPLY}?lever-source=feed`))).toBe(true);
  });

  it("is case-insensitive for the approved host", () => {
    expect(adapter.matches(new URL("https://JOBS.LEVER.CO/acme/job-42/apply"))).toBe(
      true,
    );
  });

  it("rejects non-HTTPS, credentials, and non-default ports", () => {
    expect(adapter.matches(new URL("http://jobs.lever.co/acme/job-42/apply"))).toBe(
      false,
    );
    expect(
      adapter.matches(new URL("https://user:pass@jobs.lever.co/acme/job-42/apply")),
    ).toBe(false);
    expect(
      adapter.matches(new URL("https://jobs.lever.co:8443/acme/job-42/apply")),
    ).toBe(false);
  });

  it("rejects lookalikes, EU host, extra segments, and incomplete paths", () => {
    const rejected = [
      "https://jobs.lever.co.attacker.com/acme/job-42/apply",
      "https://evil-lever.co/acme/job-42/apply",
      "https://jobs.eu.lever.co/acme/job-42/apply",
      "https://www.lever.co/acme/job-42/apply",
      "https://jobs.lever.co/",
      "https://jobs.lever.co/acme",
      "https://jobs.lever.co/apply",
      "https://jobs.lever.co/acme/job-42/apply/extra",
      "https://jobs.lever.co/acme/job-42/thanks/extra",
      "https://jobs.lever.co//job-42/apply",
    ];
    for (const url of rejected) {
      expect(adapter.matches(new URL(url)), `must reject ${url}`).toBe(false);
    }
  });
});

describe("LeverFormAdapter.detect", () => {
  const adapter = new LeverFormAdapter();

  it("detects only the /apply path with Full name and Resume/CV signals", async () => {
    renderApplyForm();
    expect(await adapter.detect(makeContext(APPLY))).toBe(true);
  });

  it("does not detect posting or thanks pages even with an apply form in the DOM", async () => {
    renderApplyForm();
    expect(await adapter.detect(makeContext(POSTING))).toBe(false);
    expect(await adapter.detect(makeContext(THANKS))).toBe(false);
  });

  it("does not detect an apply URL missing the resume signal", async () => {
    document.body.innerHTML = `
      <label for="name">Full name</label><input id="name" required />
      <button type="submit">Submit application</button>
    `;
    expect(await adapter.detect(makeContext(APPLY))).toBe(false);
  });
});

describe("LeverFormAdapter observation, fill, and posting CTA", () => {
  const adapter = new LeverFormAdapter();

  it("observes standard, link, and voluntary EEO controls", async () => {
    renderApplyForm();
    const observation = await adapter.observeStep(makeContext());
    const labels = observation.fields.map((field) => field.label);
    expect(labels.some((label) => label.includes("Full name"))).toBe(true);
    expect(labels.some((label) => /resume/i.test(label))).toBe(true);
    expect(labels.some((label) => label.includes("Email"))).toBe(true);
    expect(labels.some((label) => label.includes("Current company"))).toBe(true);
    expect(labels.some((label) => label.includes("LinkedIn"))).toBe(true);
    expect(observation.fields.some((field) => field.controlType === "radio")).toBe(
      true,
    );
  });

  it("fills a native location text field and skips required legal attestation", async () => {
    document.body.innerHTML = `
      <label for="name">Full name</label><input id="name" required />
      <label for="resume">Resume/CV</label><input id="resume" type="file" required />
      <label for="location">Current location</label><input id="location" />
      <label for="legal">I attest that these statements are true</label>
      <input id="legal" type="checkbox" required />
      <button type="submit">Submit application</button>
    `;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    const location = observation.fields.find((field) =>
      field.label.includes("Current location"),
    )!;
    const legal = observation.fields.find((field) =>
      field.label.toLowerCase().includes("attest"),
    )!;

    const result = await adapter.fillStep(context, observation, [
      {
        semanticKey: location.semanticKey,
        fieldFingerprint: "fp-loc",
        value: "Lisbon, Portugal",
        checked: null,
        decision: {} as never,
      },
      {
        semanticKey: legal.semanticKey,
        fieldFingerprint: "fp-legal",
        value: "true",
        checked: true,
        decision: {} as never,
      },
    ]);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].observedValue).toBe("Lisbon, Portugal");
    expect((document.getElementById("legal") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("does not activate a posting-page apply anchor", async () => {
    document.body.innerHTML = `
      <h1>Senior Engineer</h1>
      <a href="/acme/job-42/apply">apply for this job</a>
    `;
    let clicked = false;
    document.querySelector("a")!.addEventListener("click", (event) => {
      event.preventDefault();
      clicked = true;
    });
    const context = makeContext(POSTING);
    const observation = await adapter.observeStep(context);
    const advanced = await adapter.advance(context, observation);
    expect(advanced.activated).toBe(false);
    expect(clicked).toBe(false);
    expect(await adapter.detect(context)).toBe(false);
  });

  it("reports a required combobox as unsupported without marking optional ones required", async () => {
    document.body.innerHTML = `
      <label for="name">Full name</label><input id="name" required />
      <label for="resume">Resume/CV</label><input id="resume" type="file" required />
      <div role="combobox" aria-label="University" aria-required="true">Pick one</div>
      <div role="combobox" aria-label="Current location">Optional city</div>
      <button type="submit">Submit application</button>
    `;
    const observation = await adapter.observeStep(makeContext());
    const required = observation.unsupported.filter((item) => item.required);
    const optional = observation.unsupported.filter((item) => !item.required);
    expect(required.some((item) => item.reason === "CUSTOM_COMBOBOX")).toBe(true);
    expect(optional.some((item) => item.reason === "CUSTOM_COMBOBOX")).toBe(true);
  });
});

describe("LeverFormAdapter.detectReview, submit, and receipt", () => {
  const adapter = new LeverFormAdapter();

  it("treats the apply page as review when a submit control is present", async () => {
    renderApplyForm();
    const context = makeContext(APPLY);
    const observation = await adapter.observeStep(context);
    expect(await adapter.detectReview(context, observation)).toBe(true);
  });

  it("does not treat a posting URL as review", async () => {
    renderApplyForm();
    const context = makeContext(POSTING);
    const observation = await adapter.observeStep(context);
    expect(await adapter.detectReview(context, observation)).toBe(false);
  });

  it("activates submit once", async () => {
    renderApplyForm();
    let clicks = 0;
    document.querySelector("button")!.addEventListener("click", () => {
      clicks += 1;
    });
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    expect((await adapter.submitAfterRelease(context, observation)).activated).toBe(
      true,
    );
    expect(clicks).toBe(1);
  });

  it("captures a thanks path with a cleared form", async () => {
    document.body.innerHTML = `<h1>Thanks</h1><p>We will be in touch.</p>`;
    const receipt = await adapter.captureReceipt(makeContext(THANKS));
    expect(receipt).not.toBeNull();
    expect(receipt!.confirmationSignal).toBe("thanks_path");
    expect(receipt!.finalUrl).toBe(THANKS);
  });

  it("captures a cleared form with generic confirmation text", async () => {
    document.body.innerHTML = `<h1>Application submitted</h1>`;
    const receipt = await adapter.captureReceipt(
      makeContext("https://jobs.lever.co/acme/job-42/apply?token=secret"),
    );
    expect(receipt).not.toBeNull();
    expect(receipt!.confirmationSignal).toBe("confirmation_text");
    expect(receipt!.finalUrl).toBe(APPLY);
    expect(JSON.stringify(receipt)).not.toContain("secret");
  });

  it("returns null when the thanks path still has a form", async () => {
    renderApplyForm();
    expect(await adapter.captureReceipt(makeContext(THANKS))).toBeNull();
  });

  it("returns null for a cleared page without thanks or confirmation text", async () => {
    document.body.innerHTML = `<h1>Processing</h1><p>Please wait.</p>`;
    expect(await adapter.captureReceipt(makeContext(APPLY))).toBeNull();
  });
});
