import { app, BrowserWindow, WebContentsView } from "electron";
import fs from "node:fs";
import path from "node:path";

app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("headless", "true");
app.commandLine.appendSwitch("ozone-platform", "headless");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("ignore-certificate-errors");
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {
  // The harness controls the lifetime.
});

const testUserDataDir = path.resolve(__dirname, "..", "..", ".test-userData");
fs.mkdirSync(testUserDataDir, { recursive: true });
app.setPath("userData", testUserDataDir);
app.setPath("crashDumps", testUserDataDir);

import { GenericFormAdapter } from "../../src/main/adapters/generic";
import type { AdapterContext } from "../../src/main/adapters/contract";
import { fingerprintFromSemanticKey } from "../../src/main/forms/fingerprint";
import { IsolatedWorldSession } from "../../src/main/forms/isolated-world";
import {
  attachResumeToFileInput,
  cleanupAllTempFiles,
  trackedTempDirs,
} from "../../src/main/forms/upload";
import { EvidenceRecorder } from "../../src/main/runtime/evidence";
import { LeaseManager } from "../../src/main/runtime/lease";
import { StepRunner } from "../../src/main/runtime/runner";
import { RunnerClient } from "../../src/main/runtime/runner-client";
import { reportHarnessResult, type HarnessCase } from "./electron-harness";
import { MockGenericFormServer } from "./generic-form-server";
import { MockRunnerApiServer } from "./mock-runner-api";

const cases: HarnessCase[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCase(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    cases.push({ name, passed: true });
    console.log(`  ok ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    cases.push({ name, passed: false, error: detail });
    console.error(`  FAIL ${name}: ${detail}`);
  }
}

interface Harness {
  context: AdapterContext;
  session: IsolatedWorldSession;
  view: WebContentsView;
  dispose: () => void;
}

let window: BrowserWindow | null = null;

/** Load a fixture page into a real WebContentsView with an isolated world. */
async function openPage(url: string, resumeBytes: Buffer): Promise<Harness> {
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      offscreen: true,
    },
  });
  window!.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1024, height: 768 });
  await view.webContents.loadURL(url);

  const session = new IsolatedWorldSession(view.webContents.debugger);
  await session.attach();

  const context: AdapterContext = {
    callInIsolatedWorld: (args) => session.call(args),
    currentUrl: () => new URL(view.webContents.getURL()),
    waitForStable: () => new Promise((resolve) => setTimeout(resolve, 120)),
    attachResume: async (semanticKey) => {
      const result = await attachResumeToFileInput({
        session,
        semanticKey,
        bytes: resumeBytes,
      });
      return { attached: result.attached };
    },
  };

  return {
    context,
    session,
    view,
    dispose: () => {
      session.dispose();
      try {
        window!.contentView.removeChildView(view);
        view.webContents.close();
      } catch {
        // Already gone.
      }
    },
  };
}

async function main(): Promise<void> {
  const api = new MockRunnerApiServer();
  const forms = new MockGenericFormServer();
  await api.start();
  await forms.start();

  // Offscreen compositing is required under headless: a window that tries to
  // composite for real crashes the process here.
  window = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      offscreen: true,
    },
  });

  const adapter = new GenericFormAdapter();
  const client = new RunnerClient(api.baseUrl, {
    runnerSecret: api.runnerSecret,
    runnerId: "fixture-runner",
  });

  /** Claim a seeded run and build a StepRunner over a fixture page. */
  async function setup(
    runId: string,
    pathname: string,
    mode = "semi_auto_pause_before_submit",
  ) {
    api.seedRun({
      id: runId,
      application_url: forms.urlFor(pathname),
      automation_mode: mode,
    });
    const lease = new LeaseManager(client);
    const outcome = await lease.claimFor(runId);
    const harness = await openPage(forms.urlFor(pathname), api.resumeBytes);
    const evidence = new EvidenceRecorder(client, runId, 1);
    const runner = new StepRunner(
      {
        client,
        lease,
        adapter,
        context: harness.context,
        evidence,
        loadResume: async () =>
          (await client.fetchResume(runId, outcome.claim!.grant_token, api.resumeSha256))
            .bytes,
      },
      runId,
    );
    return { harness, runner, lease, evidence, outcome };
  }

  await runCase("observes a real page through a CDP isolated world", async () => {
    const { harness, runner } = await setup("run-observe", "/generic/one-page");
    const observation = await adapter.observeStep(harness.context);
    assert(observation.fields.length === 3, "expected three assistable fields");
    assert(
      observation.submitControls.includes("submit application"),
      "expected a submit control",
    );
    void runner;
    harness.dispose();
  });

  await runCase("fills and verifies against page-visible state", async () => {
    const { harness } = await setup("run-fill", "/generic/one-page");
    const observation = await adapter.observeStep(harness.context);
    const email = observation.fields.find((f) => f.label === "Email")!;
    const result = await adapter.fillStep(harness.context, observation, [
      {
        semanticKey: email.semanticKey,
        fieldFingerprint: fingerprintFromSemanticKey("generic", email.semanticKey),
        value: "fixture@example.test",
        checked: null,
        decision: {} as never,
      },
    ]);
    assert(result.results[0].outcome === "VERIFIED", "fill must verify");
    assert(
      result.results[0].observedValue === "fixture@example.test",
      "page must show the written value",
    );
    harness.dispose();
  });

  await runCase("discovers conditional fields only after a change", async () => {
    const { harness } = await setup("run-conditional", "/generic/conditional");
    const before = await adapter.observeStep(harness.context);
    assert(
      !before.fields.some((f) => f.label === "Visa type"),
      "hidden field must not be observed",
    );

    const sponsor = before.fields.find((f) => f.label === "Need sponsorship?")!;
    await adapter.fillStep(harness.context, before, [
      {
        semanticKey: sponsor.semanticKey,
        fieldFingerprint: "x",
        value: "Yes",
        checked: null,
        decision: {} as never,
      },
    ]);
    await harness.context.waitForStable();

    const after = await adapter.observeStep(harness.context);
    assert(
      after.fields.some((f) => f.label === "Visa type"),
      "revealed field must be observed after the change",
    );
    harness.dispose();
  });

  await runCase("pauses on an auth wall", async () => {
    const { harness, runner } = await setup("run-auth", "/generic/auth-wall");
    const result = await runner.runStep();
    assert(result.outcome === "NEEDS_AUTH", `expected NEEDS_AUTH, got ${result.outcome}`);
    harness.dispose();
  });

  await runCase("pauses on a CAPTCHA", async () => {
    const { harness, runner } = await setup("run-captcha", "/generic/captcha");
    const result = await runner.runStep();
    assert(result.outcome === "CAPTCHA", `expected CAPTCHA, got ${result.outcome}`);
    harness.dispose();
  });

  await runCase("pauses on an unsupported required control", async () => {
    const { harness, runner } = await setup("run-unsupported", "/generic/unsupported");
    const result = await runner.runStep();
    assert(
      result.outcome === "UNSUPPORTED",
      `expected UNSUPPORTED, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("pauses on reported validation errors", async () => {
    const { harness, runner } = await setup("run-validation", "/generic/validation");
    const result = await runner.runStep();
    assert(
      result.outcome === "NEEDS_ANSWERS",
      `expected NEEDS_ANSWERS, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("stops at review rather than submitting", async () => {
    const runId = "run-review";
    api.seedRun({ id: runId, application_url: forms.urlFor("/generic/one-page") });
    const lease = new LeaseManager(client);
    await lease.claimFor(runId);
    const harness = await openPage(forms.urlFor("/generic/one-page"), api.resumeBytes);
    const observation = await adapter.observeStep(harness.context);
    // Every required field already satisfied, so only review remains.
    assert(
      await adapter.detectReview(harness.context, observation),
      "submit-only page must read as review",
    );
    const bodyBefore = await harness.session.call({ op: "observe" });
    assert(bodyBefore !== null, "page must still be the form");
    harness.dispose();
  });

  await runCase("uploads the granted resume and deletes the temp file", async () => {
    const { harness, runner } = await setup("run-upload", "/generic/upload");
    await runner.runStep();
    const after = await adapter.observeStep(harness.context);
    const resume = after.fields.find((f) => f.controlType === "file");
    assert(resume !== undefined, "resume control must still be observed");
    assert(resume!.filename !== null, "page must display the attached filename");
    assert(trackedTempDirs().length === 0, "no temp resume directory may remain");
    harness.dispose();
  });

  await runCase("fails closed when the page rejects the upload", async () => {
    const { harness, runner } = await setup(
      "run-upload-reject",
      "/generic/upload-rejects",
    );
    const result = await runner.runStep();
    const after = await adapter.observeStep(harness.context);
    const resume = after.fields.find((f) => f.controlType === "file");
    assert(resume?.filename === null, "rejected upload must not appear attached");
    assert(
      result.outcome === "NEEDS_ANSWERS" || result.outcome === "UNSUPPORTED",
      `rejected upload must pause, got ${result.outcome}`,
    );
    assert(trackedTempDirs().length === 0, "no temp resume directory may remain");
    harness.dispose();
  });

  await runCase("a hostile page cannot turn its text into commands", async () => {
    const { harness } = await setup("run-hostile", "/generic/hostile");
    const observation = await adapter.observeStep(harness.context);
    const serialized = JSON.stringify(observation);

    assert(observation.pageId.length > 0, "page must still be observable");
    // Page text shaped like a command changes nothing about what ran.
    assert(observation.op === "observe", "operation must remain observe");
    // Hidden fields never cross the boundary.
    assert(
      !serialized.includes("hidden-secret-value"),
      "hidden field values must not be reported",
    );
    // Nothing in the page was evaluated by us.
    const pwned = await harness.view.webContents.executeJavaScript(
      "window.__pwned === undefined",
    );
    assert(pwned === true, "page script must not have been evaluated");
    harness.dispose();
  });

  await runCase("hands back a run in an unsupported automation mode", async () => {
    const runId = "run-full-auto";
    api.seedRun({
      id: runId,
      application_url: forms.urlFor("/generic/one-page"),
      automation_mode: "full_auto",
    });
    const lease = new LeaseManager(client);

    const first = await lease.claimFor(runId);
    assert(first.claim === null, "unauthorized full_auto run must not be executed");
    assert(
      first.refusal === "UNAUTHORIZED_FULL_AUTO",
      `expected refusal, got ${first.refusal}`,
    );
    assert(api.runs.get(runId)!.status === "queued", "run must be back in the queue");

    const claimsBefore = api.claimCalls.length;
    await lease.claimFor(runId);
    await lease.claimFor(runId);
    // Refusing must not become a claim/release loop.
    assert(
      api.claimCalls.length === claimsBefore,
      "a refused run must not be re-claimed",
    );
  });

  await runCase("never posts evidence outside receipt and log", async () => {
    const runId = "run-evidence";
    api.seedRun({ id: runId, application_url: forms.urlFor("/generic/one-page") });
    const lease = new LeaseManager(client);
    const claim = await lease.claimFor(runId);
    const evidence = new EvidenceRecorder(client, runId, claim.claim!.run.attempt_count);
    evidence.record("step", { note: "synthetic" });
    await evidence.flushLog(claim.claim!.lease_token);
    await evidence.recordReceipt(claim.claim!.lease_token, {
      finalUrl: forms.urlFor("/generic/one-page") + "?token=leak",
      confirmationSignal: "confirmation_text",
      platformReceiptId: null,
    });

    assert(api.evidence.length === 2, "expected exactly two artifacts");
    for (const artifact of api.evidence) {
      assert(
        artifact.type === "log" || artifact.type === "receipt",
        `unexpected evidence type ${artifact.type}`,
      );
      assert(!artifact.body.includes("leak"), "query strings must not reach evidence");
    }
  });

  await cleanupAllTempFiles();
  await api.close();
  await forms.close();
  if (window && !window.isDestroyed()) {
    window.close();
  }

  const summary = reportHarnessResult(cases);
  console.log(`\nResults: ${summary.passed} passed, ${summary.failed} failed.\n`);
  app.exit(summary.failed > 0 ? 1 : 0);
}

app.whenReady()
  .then(main)
  .catch((error) => {
    console.error("Fatal generic runtime fixture error:", error);
    app.exit(1);
  });
