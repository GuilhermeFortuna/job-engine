import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPROVED_GREENHOUSE_HOSTS,
  GreenhouseFormAdapter,
} from "../../src/main/adapters/greenhouse";
import type { AdapterContext } from "../../src/main/adapters/contract";
import { pageRuntimeScript } from "../../src/main/forms/page-script";

function makeContext(
  url = "https://boards.greenhouse.io/acme/jobs/12345",
): AdapterContext {
  return {
    callInIsolatedWorld: async (args) => pageRuntimeScript(args),
    currentUrl: () => new URL(url),
    waitForStable: async () => undefined,
    attachResume: async () => ({ attached: false }),
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("GreenhouseFormAdapter.matches", () => {
  const adapter = new GreenhouseFormAdapter();

  it("accepts all approved first-party Greenhouse job hosts", () => {
    for (const host of APPROVED_GREENHOUSE_HOSTS) {
      expect(
        adapter.matches(new URL(`https://${host}/acme/jobs/12345`)),
        `must accept https://${host}/acme/jobs/12345`,
      ).toBe(true);
      expect(
        adapter.matches(new URL(`https://${host}/acme/jobs/987654321`)),
      ).toBe(true);
      expect(
        adapter.matches(new URL(`https://${host}/company-name_1/jobs/42`)),
      ).toBe(true);
    }
  });

  it("accepts optional query parameters and hash fragments without broadening path", () => {
    expect(
      adapter.matches(
        new URL("https://boards.greenhouse.io/acme/jobs/12345?gh_src=feed#app"),
      ),
    ).toBe(true);
    expect(
      adapter.matches(
        new URL("https://boards.greenhouse.io/acme/jobs/12345#app"),
      ),
    ).toBe(true);
    expect(
      adapter.matches(
        new URL("https://boards.greenhouse.io/acme/jobs/12345/"),
      ),
    ).toBe(true);
  });

  it("is case-insensitive for approved hosts", () => {
    expect(
      adapter.matches(new URL("https://BOARDS.GREENHOUSE.IO/acme/jobs/12345")),
    ).toBe(true);
    expect(
      adapter.matches(new URL("https://Job-Boards.Greenhouse.IO/acme/jobs/12345")),
    ).toBe(true);
  });

  it("rejects non-HTTPS protocols", () => {
    for (const bad of [
      "http://boards.greenhouse.io/acme/jobs/12345",
      "file:///boards.greenhouse.io/acme/jobs/12345",
      "ftp://boards.greenhouse.io/acme/jobs/12345",
    ]) {
      expect(adapter.matches(new URL(bad))).toBe(false);
    }
  });

  it("rejects URL credentials and non-default ports", () => {
    expect(
      adapter.matches(
        new URL("https://user:pass@boards.greenhouse.io/acme/jobs/12345"),
      ),
    ).toBe(false);
    expect(
      adapter.matches(
        new URL("https://boards.greenhouse.io:8080/acme/jobs/12345"),
      ),
    ).toBe(false);
  });

  it("rejects subdomains and lookalike domains", () => {
    const lookalikes = [
      "https://boards.greenhouse.io.attacker.com/acme/jobs/12345",
      "https://evil-greenhouse.io/acme/jobs/12345",
      "https://notboards.greenhouse.io/acme/jobs/12345",
      "https://sub.boards.greenhouse.io/acme/jobs/12345",
      "https://greenhouse.io/acme/jobs/12345",
      "https://app.greenhouse.io/acme/jobs/12345",
      "https://boards.greenhouse.com/acme/jobs/12345",
    ];
    for (const url of lookalikes) {
      expect(adapter.matches(new URL(url)), `must reject ${url}`).toBe(false);
    }
  });

  it("rejects unapproved, empty, or non-job paths", () => {
    const unapprovedPaths = [
      "https://boards.greenhouse.io/",
      "https://boards.greenhouse.io/acme",
      "https://boards.greenhouse.io/acme/jobs",
      "https://boards.greenhouse.io/acme/jobs/not-a-number",
      "https://boards.greenhouse.io/terms",
      "https://boards.greenhouse.io/login",
      "https://boards.greenhouse.io//jobs/12345",
      "https://boards.greenhouse.io/acme/jobs/12345/extra/path",
    ];
    for (const url of unapprovedPaths) {
      expect(adapter.matches(new URL(url)), `must reject ${url}`).toBe(false);
    }
  });
});

describe("GreenhouseFormAdapter.detect (Two-Signal Contract)", () => {
  const adapter = new GreenhouseFormAdapter();

  function renderStandardGreenhouseForm(): void {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name *</label>
        <input id="first_name" required />
        <label for="last_name">Last Name *</label>
        <input id="last_name" required />
        <label for="email">Email *</label>
        <input id="email" type="email" required />
        <button type="submit" id="submit_app">Submit Application</button>
      </form>
    `;
  }

  it("detects when URL matches and standard required fields are present", async () => {
    renderStandardGreenhouseForm();
    const context = makeContext("https://boards.greenhouse.io/acme/jobs/12345");
    expect(await adapter.detect(context)).toBe(true);
  });

  it("fails detection when URL is not an approved Greenhouse URL", async () => {
    renderStandardGreenhouseForm();
    const context = makeContext("https://jobs.example.com/acme/jobs/12345");
    expect(await adapter.detect(context)).toBe(false);
  });

  it("fails detection when submit control is missing", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name *</label>
        <input id="first_name" required />
        <label for="last_name">Last Name *</label>
        <input id="last_name" required />
        <label for="email">Email *</label>
        <input id="email" type="email" required />
      </form>
    `;
    const context = makeContext();
    expect(await adapter.detect(context)).toBe(false);
  });

  it("fails detection when required identity fields (e.g. Email) are missing", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name *</label>
        <input id="first_name" required />
        <label for="last_name">Last Name *</label>
        <input id="last_name" required />
        <button type="submit">Submit Application</button>
      </form>
    `;
    const context = makeContext();
    expect(await adapter.detect(context)).toBe(false);
  });
});

describe("GreenhouseFormAdapter.observeStep & Field Classification", () => {
  const adapter = new GreenhouseFormAdapter();

  it("observes standard contact, resume, and social link controls", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name *</label>
        <input id="first_name" required />
        <label for="last_name">Last Name *</label>
        <input id="last_name" required />
        <label for="email">Email *</label>
        <input id="email" type="email" required />
        <label for="phone">Phone</label>
        <input id="phone" type="tel" />
        <label for="resume">Resume / CV *</label>
        <input id="resume" type="file" required />
        <label for="cover_letter">Cover Letter</label>
        <textarea id="cover_letter"></textarea>
        <label for="linkedin">LinkedIn Profile</label>
        <input id="linkedin" type="url" />
        <label for="github">GitHub Profile</label>
        <input id="github" type="url" />
        <label for="website">Portfolio Website</label>
        <input id="website" type="url" />
        <button type="submit" id="submit_app">Submit Application</button>
      </form>
    `;
    const observation = await adapter.observeStep(makeContext());
    expect(observation.fields).toHaveLength(9);

    const labels = observation.fields.map((f) => f.label.toLowerCase());
    expect(labels).toContain("first name *");
    expect(labels).toContain("last name *");
    expect(labels).toContain("email *");
    expect(labels).toContain("phone");
    expect(labels).toContain("resume / cv *");
    expect(labels).toContain("cover letter");
    expect(labels).toContain("linkedin profile");
    expect(labels).toContain("github profile");
    expect(labels).toContain("portfolio website");

    const fileField = observation.fields.find((f) => f.controlType === "file");
    expect(fileField).toBeDefined();
    expect(fileField?.required).toBe(true);
  });

  it("observes custom employer questions across select, radio, checkbox, and text types", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name *</label><input id="first_name" required />
        <label for="last_name">Last Name *</label><input id="last_name" required />
        <label for="email">Email *</label><input id="email" required />
        
        <label for="sponsorship">Will you now or in the future require sponsorship? *</label>
        <select id="sponsorship" required>
          <option value="">Select...</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>

        <fieldset>
          <legend>Preferred Pronouns</legend>
          <label><input type="radio" name="pronouns" value="they" /> They/Them</label>
          <label><input type="radio" name="pronouns" value="she" /> She/Her</label>
          <label><input type="radio" name="pronouns" value="he" /> He/Him</label>
        </fieldset>

        <label for="years_exp">Years of relevant experience *</label>
        <input id="years_exp" type="number" required />

        <button type="submit">Submit Application</button>
      </form>
    `;
    const observation = await adapter.observeStep(makeContext());
    const sponsorship = observation.fields.find((f) =>
      f.label.toLowerCase().includes("sponsorship"),
    );
    expect(sponsorship?.controlType).toBe("single_select");
    expect(sponsorship?.options).toEqual(["Select...", "No", "Yes"]);

    const pronouns = observation.fields.find((f) =>
      f.label.toLowerCase().includes("preferred pronouns"),
    );
    expect(pronouns?.controlType).toBe("radio");
    expect(pronouns?.options).toEqual(["They/Them", "She/Her", "He/Him"]);
  });

  it("observes voluntary demographic and EEO fieldsets with opt-out options", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name *</label><input id="first_name" required />
        <label for="last_name">Last Name *</label><input id="last_name" required />
        <label for="email">Email *</label><input id="email" required />

        <label for="eeo_gender">Gender (Voluntary)</label>
        <select id="eeo_gender">
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="decline">Decline to self-identify</option>
        </select>

        <label for="eeo_veteran">Veteran Status (Voluntary)</label>
        <select id="eeo_veteran">
          <option value="veteran">I am a veteran</option>
          <option value="not_veteran">I am not a veteran</option>
          <option value="decline">I choose not to disclose</option>
        </select>

        <button type="submit">Submit Application</button>
      </form>
    `;
    const observation = await adapter.observeStep(makeContext());
    const gender = observation.fields.find((f) =>
      f.label.toLowerCase().includes("gender"),
    );
    expect(gender?.options).toContain("Decline to self-identify");
    expect(gender?.required).toBe(false);

    const veteran = observation.fields.find((f) =>
      f.label.toLowerCase().includes("veteran"),
    );
    expect(veteran?.options).toContain("I choose not to disclose");
    expect(veteran?.required).toBe(false);
  });
});

describe("GreenhouseFormAdapter.fillStep & Legal Guardrails", () => {
  const adapter = new GreenhouseFormAdapter();

  it("fills authorized fields while skipping legal attestation and signature fields", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name</label><input id="first_name" />
        <label for="email">Email</label><input id="email" />
        <label for="attest">I attest that all information is true and accurate *</label>
        <input id="attest" type="checkbox" required />
        <label for="signature">Legal Signature (Type Full Name) *</label>
        <input id="signature" required />
        <button type="submit">Submit Application</button>
      </form>
    `;
    const context = makeContext();
    const observation = await adapter.observeStep(context);

    const fnField = observation.fields.find((f) => f.label === "First Name")!;
    const emailField = observation.fields.find((f) => f.label === "Email")!;
    const attestField = observation.fields.find((f) =>
      f.label.includes("attest"),
    )!;
    const sigField = observation.fields.find((f) =>
      f.label.includes("Signature"),
    )!;

    const result = await adapter.fillStep(context, observation, [
      {
        semanticKey: fnField.semanticKey,
        fieldFingerprint: "fp1",
        value: "Jane",
        checked: null,
        decision: {} as never,
      },
      {
        semanticKey: emailField.semanticKey,
        fieldFingerprint: "fp2",
        value: "jane.doe@example.test",
        checked: null,
        decision: {} as never,
      },
      {
        // Should be filtered out by GreenhouseFormAdapter legal guardrail
        semanticKey: attestField.semanticKey,
        fieldFingerprint: "fp3",
        value: "true",
        checked: true,
        decision: {} as never,
      },
      {
        // Should be filtered out by GreenhouseFormAdapter legal guardrail
        semanticKey: sigField.semanticKey,
        fieldFingerprint: "fp4",
        value: "Jane Doe",
        checked: null,
        decision: {} as never,
      },
    ]);

    expect(result.results).toHaveLength(2);
    expect(
      (document.getElementById("first_name") as HTMLInputElement).value,
    ).toBe("Jane");
    expect(
      (document.getElementById("email") as HTMLInputElement).value,
    ).toBe("jane.doe@example.test");
    expect(
      (document.getElementById("attest") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (document.getElementById("signature") as HTMLInputElement).value,
    ).toBe("");
  });

  it("filters out stale keys not present in current observation", async () => {
    document.body.innerHTML = `
      <label for="email">Email</label><input id="email" />
    `;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    const emailField = observation.fields[0];

    const result = await adapter.fillStep(context, observation, [
      {
        semanticKey: emailField.semanticKey,
        fieldFingerprint: "fp1",
        value: "test@example.test",
        checked: null,
        decision: {} as never,
      },
      {
        semanticKey: "stale-key-not-in-observation",
        fieldFingerprint: "fp-stale",
        value: "should-not-be-written",
        checked: null,
        decision: {} as never,
      },
    ]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].semanticKey).toBe(emailField.semanticKey);
  });
});

describe("GreenhouseFormAdapter.detectReview & submitAfterRelease", () => {
  const adapter = new GreenhouseFormAdapter();

  it("detects review step when submit control is present with no advance controls", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="first_name">First Name</label><input id="first_name" />
        <button type="submit" id="submit_app">Submit Application</button>
      </form>
    `;
    const context = makeContext();
    const observation = await adapter.observeStep(context);
    expect(await adapter.detectReview(context, observation)).toBe(true);
  });

  it("refuses review step when URL does not match Greenhouse", async () => {
    document.body.innerHTML = `
      <button type="submit" id="submit_app">Submit Application</button>
    `;
    const context = makeContext("https://unrelated.com/apply");
    const observation = await adapter.observeStep(context);
    expect(await adapter.detectReview(context, observation)).toBe(false);
  });

  it("submits once when submitAfterRelease is called", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <button type="submit" id="submit_app">Submit Application</button>
      </form>
    `;
    let submitted = false;
    document.getElementById("submit_app")!.addEventListener("click", () => {
      submitted = true;
    });

    const context = makeContext();
    const observation = await adapter.observeStep(context);
    const result = await adapter.submitAfterRelease(context, observation);
    expect(result.activated).toBe(true);
    expect(submitted).toBe(true);
  });
});

describe("GreenhouseFormAdapter.captureReceipt", () => {
  const adapter = new GreenhouseFormAdapter();

  it("captures confirmed receipt on confirmed thank-you state", async () => {
    document.body.innerHTML = `
      <div id="application_confirmation">
        <h1>Thank you for applying</h1>
        <p>Your application has been submitted.</p>
      </div>
    `;
    const context = makeContext(
      "https://boards.greenhouse.io/acme/jobs/12345?token=secret#app",
    );
    const receipt = await adapter.captureReceipt(context);

    expect(receipt).not.toBeNull();
    expect(receipt!.confirmationSignal).toBe("confirmation_text");
    expect(receipt!.platformReceiptId).toBeNull();
    // Query string and hash must be stripped from finalUrl
    expect(receipt!.finalUrl).toBe("https://boards.greenhouse.io/acme/jobs/12345");
    expect(JSON.stringify(receipt)).not.toContain("secret");
  });

  it("returns null when form is still present (unsubmitted)", async () => {
    document.body.innerHTML = `
      <form id="application_form">
        <label for="email">Email</label><input id="email" />
        <button type="submit">Submit Application</button>
      </form>
    `;
    const context = makeContext();
    expect(await adapter.captureReceipt(context)).toBeNull();
  });

  it("returns null when form is cleared but confirmation text is absent (ambiguous post-submit)", async () => {
    document.body.innerHTML = `
      <div>
        <h1>Processing...</h1>
        <p>Please wait.</p>
      </div>
    `;
    const context = makeContext();
    expect(await adapter.captureReceipt(context)).toBeNull();
  });

  it("returns null if host is not an approved Greenhouse host", async () => {
    document.body.innerHTML = `
      <h1>Thank you for applying</h1>
    `;
    const context = makeContext("https://evil.com/acme/jobs/12345");
    expect(await adapter.captureReceipt(context)).toBeNull();
  });
});
