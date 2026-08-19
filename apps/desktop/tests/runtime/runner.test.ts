import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { GenericFormAdapter } from "../../src/main/adapters/generic";
import type { AdapterContext } from "../../src/main/adapters/contract";
import { fingerprintFromSemanticKey } from "../../src/main/forms/fingerprint";
import { pageRuntimeScript } from "../../src/main/forms/page-script";
import type { AnswerDecision, ObserveResult } from "../../src/main/forms/types";
import { EvidenceRecorder } from "../../src/main/runtime/evidence";
import { LeaseManager } from "../../src/main/runtime/lease";
import {
  blockingFields,
  MAX_STEPS,
  planFills,
  signalOutcome,
  StepRunner,
  toObservations,
} from "../../src/main/runtime/runner";
import type { RunnerClient } from "../../src/main/runtime/runner-client";

const ADAPTER_ID = "generic";

/** A jsdom page driven by the real script, through the real adapter port. */
function makePage(html: string): {
  context: AdapterContext;
  dom: JSDOM;
  attachResume: ReturnType<typeof vi.fn>;
} {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url: "https://jobs.example.com/apply",
    runScripts: "outside-only",
  });
  const attachResume = vi.fn(async () => ({ attached: true }));
  const context: AdapterContext = {
    callInIsolatedWorld: async (args) => {
      const fn = dom.window.eval(`(${pageRuntimeScript.toString()})`) as (
        a: unknown,
      ) => unknown;
      return fn(args);
    },
    currentUrl: () => new URL("https://jobs.example.com/apply"),
    waitForStable: async () => undefined,
    attachResume,
  };
  return { context, dom, attachResume };
}

async function observeOf(html: string): Promise<ObserveResult> {
  const { context } = makePage(html);
  return new GenericFormAdapter().observeStep(context);
}

function decision(overrides: Partial<AnswerDecision>): AnswerDecision {
  return {
    field_fingerprint: "f",
    decision: "AUTO_FILL",
    answer: "value",
    policy_category: "verified_profile",
    confidence: 0.99,
    evidence: [{ source: "profile", reference: "email" }],
    reason_code: "exact_verified_profile",
    ...overrides,
  };
}

describe("toObservations", () => {
  it("describes fields without proposing answers", async () => {
    const observation = await observeOf(`
      <label for="a">Email</label>
      <input id="a" type="email" required maxlength="80" />
    `);
    const [payload] = toObservations(ADAPTER_ID, observation);

    expect(payload).toMatchObject({
      adapter_id: ADAPTER_ID,
      label: "Email",
      required: true,
      control_type: "text",
    });
    expect(payload.field_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.validation_constraints?.max_length).toBe(80);
    // Nothing resembling an answer or a policy judgement is ever sent.
    expect(Object.keys(payload)).not.toContain("answer");
    expect(Object.keys(payload)).not.toContain("confidence");
  });
});

describe("planFills", () => {
  const html = `
    <label for="a">Email</label><input id="a" type="email" />
    <label for="b">Gender</label>
    <select id="b">
      <option>Male</option><option>Female</option>
      <option>Prefer not to say</option>
    </select>
  `;

  async function fingerprints() {
    const observation = await observeOf(html);
    const map = new Map(
      observation.fields.map((f) => [
        f.label,
        fingerprintFromSemanticKey(ADAPTER_ID, f.semanticKey),
      ]),
    );
    return { observation, map };
  }

  it("fills AUTO_FILL decisions", async () => {
    const { observation, map } = await fingerprints();
    const { fills } = planFills(ADAPTER_ID, observation, [
      decision({ field_fingerprint: map.get("Email")!, answer: "a@b.co" }),
    ]);
    expect(fills).toHaveLength(1);
    expect(fills[0].value).toBe("a@b.co");
  });

  it("never fills REVIEW_REQUIRED or ABSTAIN", async () => {
    const { observation, map } = await fingerprints();
    const { fills, unresolved } = planFills(ADAPTER_ID, observation, [
      decision({
        field_fingerprint: map.get("Email")!,
        decision: "REVIEW_REQUIRED",
        answer: null,
      }),
      decision({
        field_fingerprint: map.get("Gender")!,
        decision: "ABSTAIN",
        answer: null,
      }),
    ]);
    expect(fills).toEqual([]);
    expect(unresolved).toHaveLength(2);
  });

  it("applies DECLINE_OPTIONAL only when the option exists exactly", async () => {
    const { observation, map } = await fingerprints();
    const exact = planFills(ADAPTER_ID, observation, [
      decision({
        field_fingerprint: map.get("Gender")!,
        decision: "DECLINE_OPTIONAL",
        answer: "Prefer not to say",
      }),
    ]);
    expect(exact.fills[0].value).toBe("Prefer not to say");

    const inexact = planFills(ADAPTER_ID, observation, [
      decision({
        field_fingerprint: map.get("Gender")!,
        decision: "DECLINE_OPTIONAL",
        answer: "prefer not to say",
      }),
    ]);
    expect(inexact.fills).toEqual([]);
    expect(inexact.unresolved).toHaveLength(1);
  });

  it("refuses an AUTO_FILL with no answer instead of writing blank", async () => {
    const { observation, map } = await fingerprints();
    const { fills, unresolved } = planFills(ADAPTER_ID, observation, [
      decision({ field_fingerprint: map.get("Email")!, answer: null }),
    ]);
    expect(fills).toEqual([]);
    expect(unresolved).toHaveLength(1);
  });

  it("ignores a decision for a field this observation did not report", async () => {
    const { observation } = await fingerprints();
    const { fills } = planFills(ADAPTER_ID, observation, [
      decision({ field_fingerprint: "stale-fingerprint", answer: "leak" }),
    ]);
    expect(fills).toEqual([]);
  });
});

describe("blockingFields", () => {
  it("blocks on an unresolved required field", async () => {
    const observation = await observeOf(
      `<label for="a">Email</label><input id="a" required />`,
    );
    expect(blockingFields(ADAPTER_ID, observation, new Set())).toHaveLength(1);
  });

  it("does not block on a required field already filled on the page", async () => {
    const observation = await observeOf(
      `<label for="a">Email</label><input id="a" required value="a@b.co" />`,
    );
    expect(blockingFields(ADAPTER_ID, observation, new Set())).toEqual([]);
  });

  it("does not block on a field this attempt confirmed", async () => {
    const observation = await observeOf(
      `<label for="a">Email</label><input id="a" required />`,
    );
    const fingerprint = fingerprintFromSemanticKey(
      ADAPTER_ID,
      observation.fields[0].semanticKey,
    );
    expect(
      blockingFields(ADAPTER_ID, observation, new Set([fingerprint])),
    ).toEqual([]);
  });

  it("ignores optional fields", async () => {
    const observation = await observeOf(
      `<label for="a">Website</label><input id="a" />`,
    );
    expect(blockingFields(ADAPTER_ID, observation, new Set())).toEqual([]);
  });

  it("blocks on a required control it cannot drive", async () => {
    const observation = await observeOf(
      `<div role="combobox" aria-label="Country" aria-required="true"></div>`,
    );
    const blocking = blockingFields(ADAPTER_ID, observation, new Set());
    expect(blocking).toHaveLength(1);
    expect(blocking[0].status).toBe("CUSTOM_COMBOBOX");
  });

  it("reports identity and label but never a value", async () => {
    const observation = await observeOf(
      `<label for="a">Salary expectation</label><input id="a" required />`,
    );
    const [report] = blockingFields(ADAPTER_ID, observation, new Set());
    expect(report.label).toBe("Salary expectation");
    expect(JSON.stringify(report)).not.toContain("value");
  });
});

describe("signalOutcome", () => {
  it("reports CAPTCHA ahead of everything else", async () => {
    const observation = await observeOf(`
      <div class="g-recaptcha"></div>
      <input type="password" />
    `);
    expect(signalOutcome(observation)).toBe("CAPTCHA");
  });

  it("reports an auth wall", async () => {
    const observation = await observeOf(`<input type="password" />`);
    expect(signalOutcome(observation)).toBe("NEEDS_AUTH");
  });

  it("reports nothing for a clean page", async () => {
    const observation = await observeOf(
      `<label for="a">Email</label><input id="a" />`,
    );
    expect(signalOutcome(observation)).toBeNull();
  });
});

describe("StepRunner", () => {
  function makeDeps(html: string, decisions: AnswerDecision[] = []) {
    const page = makePage(html);
    const client = {
      answerDecisions: vi.fn(async () => decisions),
      checkpoint: vi.fn(async () => ({}) as never),
      uploadEvidence: vi.fn(async () => ({
        sha256: "x",
        relativePath: "p",
      })),
    } as unknown as RunnerClient;

    const lease = {
      leaseToken: "lease-token",
    } as unknown as LeaseManager;

    const evidence = new EvidenceRecorder(client, "run-1", 1);
    const loadResume = vi.fn(async () => Buffer.from("%PDF"));

    const runner = new StepRunner(
      {
        client,
        lease,
        adapter: new GenericFormAdapter(),
        context: page.context,
        evidence,
        loadResume,
      },
      "run-1",
    );
    return { runner, client, page, evidence, loadResume };
  }

  it("bounds intermediate steps", () => {
    expect(MAX_STEPS).toBeGreaterThan(1);
    expect(MAX_STEPS).toBeLessThanOrEqual(20);
  });

  it("stops on CAPTCHA without asking for decisions", async () => {
    const { runner, client } = makeDeps(`
      <div class="g-recaptcha"></div>
      <label for="a">Email</label><input id="a" />
    `);
    const result = await runner.runStep();
    expect(result.outcome).toBe("CAPTCHA");
    expect(client.answerDecisions).not.toHaveBeenCalled();
  });

  it("stops on an auth wall without asking for decisions", async () => {
    const { runner, client } = makeDeps(`<input type="password" />`);
    const result = await runner.runStep();
    expect(result.outcome).toBe("NEEDS_AUTH");
    expect(client.answerDecisions).not.toHaveBeenCalled();
  });

  it("fills an authorized field, verifies it, and advances", async () => {
    const page = makePage(`
      <label for="a">Email</label><input id="a" required />
      <button type="button">Continue</button>
    `);
    const observation = await new GenericFormAdapter().observeStep(page.context);
    const fingerprint = fingerprintFromSemanticKey(
      ADAPTER_ID,
      observation.fields[0].semanticKey,
    );

    const { runner } = makeDeps(
      `<label for="a">Email</label><input id="a" required />
       <button type="button">Continue</button>`,
      [decision({ field_fingerprint: fingerprint, answer: "a@b.co" })],
    );
    const result = await runner.runStep();

    expect(result.outcome).toBe("PROGRESSED");
    expect(runner.confirmedFingerprints.has(fingerprint)).toBe(true);
  });

  it("pauses when a required field has no authorized answer", async () => {
    const { runner } = makeDeps(`
      <label for="a">Salary expectation</label><input id="a" required />
      <button type="button">Continue</button>
    `);
    const result = await runner.runStep();
    expect(result.outcome).toBe("NEEDS_ANSWERS");
    expect(result.fields[0].label).toBe("Salary expectation");
  });

  it("pauses when the form reports validation errors", async () => {
    const { runner } = makeDeps(`
      <label for="a">Email</label><input id="a" />
      <span role="alert">Email is invalid</span>
      <button type="button">Continue</button>
    `);
    const result = await runner.runStep();
    expect(result.outcome).toBe("NEEDS_ANSWERS");
  });

  it("pauses on a required control it cannot drive", async () => {
    const { runner } = makeDeps(`
      <div role="combobox" aria-label="Country" aria-required="true"></div>
      <button type="button">Continue</button>
    `);
    const result = await runner.runStep();
    expect(result.outcome).toBe("UNSUPPORTED");
  });

  it("stops at review instead of submitting", async () => {
    const { runner } = makeDeps(
      `<button type="submit">Submit application</button>`,
    );
    const result = await runner.runStep();
    expect(result.outcome).toBe("READY_FOR_REVIEW");
  });

  it("attaches the resume exactly once", async () => {
    const page = makePage(`
      <label for="r">Resume</label><input id="r" type="file" />
      <button type="button">Continue</button>
    `);
    const client = {
      answerDecisions: vi.fn(async () => []),
      checkpoint: vi.fn(async () => ({}) as never),
      uploadEvidence: vi.fn(async () => ({ sha256: "x", relativePath: "p" })),
    } as unknown as RunnerClient;
    const loadResume = vi.fn(async () => Buffer.from("%PDF"));
    const runner = new StepRunner(
      {
        client,
        lease: { leaseToken: "t" } as unknown as LeaseManager,
        adapter: new GenericFormAdapter(),
        context: page.context,
        evidence: new EvidenceRecorder(client, "run-1", 1),
        loadResume,
      },
      "run-1",
    );

    await runner.runStep();
    await runner.runStep();

    expect(page.attachResume).toHaveBeenCalledTimes(1);
    expect(loadResume).toHaveBeenCalledTimes(1);
  });

  it("records an unconfirmed fill instead of claiming success", async () => {
    // A disabled control cannot accept the write, so nothing is confirmed.
    const page = makePage(`
      <label for="a">Email</label><input id="a" required disabled />
    `);
    const observation = await new GenericFormAdapter().observeStep(page.context);
    const fingerprint = fingerprintFromSemanticKey(
      ADAPTER_ID,
      observation.fields[0].semanticKey,
    );

    const { runner, evidence } = makeDeps(
      `<label for="a">Email</label><input id="a" required disabled />`,
      [decision({ field_fingerprint: fingerprint, answer: "a@b.co" })],
    );
    const result = await runner.runStep();

    expect(runner.confirmedFingerprints.has(fingerprint)).toBe(false);
    expect(result.outcome).toBe("NEEDS_ANSWERS");
    expect(JSON.stringify(evidence.log)).toContain("fill_unconfirmed");
  });

  it("never writes an answer into the evidence log", async () => {
    const page = makePage(
      `<label for="a">Email</label><input id="a" required disabled />`,
    );
    const observation = await new GenericFormAdapter().observeStep(page.context);
    const fingerprint = fingerprintFromSemanticKey(
      ADAPTER_ID,
      observation.fields[0].semanticKey,
    );
    const { runner, evidence } = makeDeps(
      `<label for="a">Email</label><input id="a" required disabled />`,
      [
        decision({
          field_fingerprint: fingerprint,
          answer: "top-secret-salary-450000",
        }),
      ],
    );
    await runner.runStep();
    expect(JSON.stringify(evidence.log)).not.toContain("450000");
  });
});
