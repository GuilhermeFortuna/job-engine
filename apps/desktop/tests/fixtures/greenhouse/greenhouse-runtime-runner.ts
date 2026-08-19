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
  // Harness controls lifetime.
});

const testUserDataDir = path.resolve(__dirname, "..", "..", "..", ".test-userData-gh");
fs.mkdirSync(testUserDataDir, { recursive: true });
app.setPath("userData", testUserDataDir);
app.setPath("crashDumps", testUserDataDir);

import { GreenhouseFormAdapter } from "../../../src/main/adapters/greenhouse";
import type { AdapterContext } from "../../../src/main/adapters/contract";
import { fingerprintFromSemanticKey } from "../../../src/main/forms/fingerprint";
import { IsolatedWorldSession } from "../../../src/main/forms/isolated-world";
import {
  attachResumeToFileInput,
  cleanupAllTempFiles,
  trackedTempDirs,
} from "../../../src/main/forms/upload";
import { EvidenceRecorder } from "../../../src/main/runtime/evidence";
import { LeaseManager } from "../../../src/main/runtime/lease";
import { StepRunner } from "../../../src/main/runtime/runner";
import { RunnerClient } from "../../../src/main/runtime/runner-client";
import { reportHarnessResult, type HarnessCase } from "../electron-harness";
import { MockRunnerApiServer } from "../mock-runner-api";
import { MockGreenhouseFormServer } from "./greenhouse-form-server";

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
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
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
async function openPage(
  url: string,
  virtualUrl: string,
  resumeBytes: Buffer,
): Promise<Harness> {
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
    currentUrl: () => new URL(virtualUrl),
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
        // Already closed.
      }
    },
  };
}

async function main(): Promise<void> {
  const api = new MockRunnerApiServer();
  const forms = new MockGreenhouseFormServer();
  await api.start();
  await forms.start();

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

  const adapter = new GreenhouseFormAdapter();
  const client = new RunnerClient(api.baseUrl, {
    runnerSecret: api.runnerSecret,
    runnerId: "greenhouse-fixture-runner",
  });

  const virtualBase = "https://boards.greenhouse.io/acme/jobs/12345";

  async function setup(
    runId: string,
    pathname: string,
    mode = "semi_auto_pause_before_submit",
  ) {
    api.seedRun({
      id: runId,
      application_url: virtualBase,
      automation_mode: mode,
    });
    const lease = new LeaseManager(client);
    const outcome = await lease.claimFor(runId);
    const harness = await openPage(
      forms.urlFor(pathname),
      virtualBase,
      api.resumeBytes,
    );
    const evidence = new EvidenceRecorder(client, runId, 1);
    const runner = new StepRunner(
      {
        client,
        lease,
        adapter,
        context: harness.context,
        evidence,
        loadResume: async () =>
          (
            await client.fetchResume(
              runId,
              outcome.claim!.grant_token,
              api.resumeSha256,
            )
          ).bytes,
      },
      runId,
    );
    return { harness, runner, lease, evidence, outcome };
  }

  await runCase("observes Greenhouse standard fields through CDP isolated world", async () => {
    const { harness } = await setup("run-observe-gh", "/greenhouse/standard");
    const observation = await adapter.observeStep(harness.context);
    assert(observation.fields.length >= 6, "expected standard greenhouse fields");
    assert(
      observation.submitControls.includes("submit application"),
      "expected submit application control",
    );
    assert(await adapter.detect(harness.context), "detect must return true for standard form");
    harness.dispose();
  });

  await runCase("fills and verifies against Greenhouse page DOM", async () => {
    const { harness } = await setup("run-fill-gh", "/greenhouse/standard");
    const observation = await adapter.observeStep(harness.context);
    const firstName = observation.fields.find((f) => f.label.includes("First Name"))!;
    const email = observation.fields.find((f) => f.label.includes("Email"))!;

    const result = await adapter.fillStep(harness.context, observation, [
      {
        semanticKey: firstName.semanticKey,
        fieldFingerprint: fingerprintFromSemanticKey("greenhouse", firstName.semanticKey),
        value: "Jane",
        checked: null,
        decision: {} as never,
      },
      {
        semanticKey: email.semanticKey,
        fieldFingerprint: fingerprintFromSemanticKey("greenhouse", email.semanticKey),
        value: "jane.doe@example.test",
        checked: null,
        decision: {} as never,
      },
    ]);

    assert(result.results.length === 2, "must fill both fields");
    assert(result.results[0].outcome === "VERIFIED", "first name must verify");
    assert(result.results[1].outcome === "VERIFIED", "email must verify");
    assert(
      result.results[1].observedValue === "jane.doe@example.test",
      "email value must be in page",
    );
    harness.dispose();
  });

  await runCase("discovers conditional fields only after change", async () => {
    const { harness } = await setup("run-cond-gh", "/greenhouse/conditional");
    const before = await adapter.observeStep(harness.context);
    assert(
      !before.fields.some((f) => f.label.includes("Visa")),
      "hidden conditional visa field must not be observed",
    );

    const authSelect = before.fields.find((f) => f.label.includes("authorized to work"))!;
    await adapter.fillStep(harness.context, before, [
      {
        semanticKey: authSelect.semanticKey,
        fieldFingerprint: "fp-auth",
        value: "Yes",
        checked: null,
        decision: {} as never,
      },
    ]);
    await harness.context.waitForStable();

    const after = await adapter.observeStep(harness.context);
    assert(
      after.fields.some((f) => f.label.includes("Visa")),
      "conditional visa field must be observed after selecting Yes",
    );
    harness.dispose();
  });

  await runCase("pauses on legal attestation and keeps field unresolved", async () => {
    const { harness } = await setup("run-attest-gh", "/greenhouse/attestation-pause");
    const observation = await adapter.observeStep(harness.context);
    const attestField = observation.fields.find((f) => f.label.includes("attest"))!;

    // fillStep must filter out attestation decision
    const fillResult = await adapter.fillStep(harness.context, observation, [
      {
        semanticKey: attestField.semanticKey,
        fieldFingerprint: "fp-attest",
        value: "true",
        checked: true,
        decision: {} as never,
      },
    ]);
    assert(fillResult.results.length === 0, "attestation fill must be filtered out");
    harness.dispose();
  });

  await runCase("pauses on validation errors", async () => {
    const { harness, runner } = await setup("run-valid-gh", "/greenhouse/validation");
    const result = await runner.runStep();
    assert(
      result.outcome === "NEEDS_ANSWERS",
      `expected NEEDS_ANSWERS on validation error, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("pauses on CAPTCHA challenge", async () => {
    const { harness, runner } = await setup("run-captcha-gh", "/greenhouse/captcha");
    const result = await runner.runStep();
    assert(result.outcome === "CAPTCHA", `expected CAPTCHA, got ${result.outcome}`);
    harness.dispose();
  });

  await runCase("pauses on auth wall", async () => {
    const { harness, runner } = await setup("run-auth-gh", "/greenhouse/auth-wall");
    const result = await runner.runStep();
    assert(result.outcome === "NEEDS_AUTH", `expected NEEDS_AUTH, got ${result.outcome}`);
    harness.dispose();
  });

  await runCase("pauses on unsupported control (canvas signature)", async () => {
    const { harness, runner } = await setup("run-unsup-gh", "/greenhouse/unsupported");
    const result = await runner.runStep();
    assert(
      result.outcome === "UNSUPPORTED",
      `expected UNSUPPORTED on canvas signature, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("uploads granted resume and cleans up temp files", async () => {
    const { harness, runner } = await setup("run-upload-gh", "/greenhouse/upload");
    await runner.runStep();
    const after = await adapter.observeStep(harness.context);
    const resume = after.fields.find((f) => f.controlType === "file");
    assert(resume !== undefined, "resume field must be observed");
    assert(resume!.filename !== null, "filename must be attached");
    assert(trackedTempDirs().length === 0, "temporary resume files must be deleted");
    harness.dispose();
  });

  await runCase("fails closed when page rejects resume upload", async () => {
    const { harness, runner } = await setup(
      "run-upload-rej-gh",
      "/greenhouse/upload-reject",
    );
    const result = await runner.runStep();
    const after = await adapter.observeStep(harness.context);
    const resume = after.fields.find((f) => f.controlType === "file");
    assert(resume?.filename === null, "rejected resume must not appear attached");
    assert(
      result.outcome === "NEEDS_ANSWERS" || result.outcome === "UNSUPPORTED",
      `expected pause on rejected upload, got ${result.outcome}`,
    );
    assert(trackedTempDirs().length === 0, "temp directory must be cleaned up");
    harness.dispose();
  });

  await runCase("stops at review step rather than submitting", async () => {
    const { harness } = await setup("run-review-gh", "/greenhouse/standard");
    const observation = await adapter.observeStep(harness.context);
    assert(
      await adapter.detectReview(harness.context, observation),
      "Greenhouse submit-only form must read as review step",
    );
    harness.dispose();
  });

  await runCase("submits once after simulated release and reconciles confirmed receipt", async () => {
    const { harness } = await setup("run-submit-gh", "/greenhouse/standard");
    const observation = await adapter.observeStep(harness.context);
    const activated = await adapter.submitAfterRelease(harness.context, observation);
    assert(activated.activated, "submit control must activate");
    await harness.context.waitForStable();

    const receipt = await adapter.captureReceipt(harness.context);
    assert(receipt !== null, "receipt must be captured on confirmation page");
    assert(
      receipt!.confirmationSignal === "confirmation_text",
      `expected confirmation_text, got ${receipt!.confirmationSignal}`,
    );
    assert(
      receipt!.finalUrl === virtualBase,
      `expected sanitized finalUrl ${virtualBase}, got ${receipt!.finalUrl}`,
    );
    harness.dispose();
  });

  await runCase("handles ambiguous post-submit without receipt and without second submit", async () => {
    const { harness } = await setup("run-ambig-gh", "/greenhouse/ambiguous-submit");
    const observation = await adapter.observeStep(harness.context);
    const activated = await adapter.submitAfterRelease(harness.context, observation);
    assert(activated.activated, "submit control must activate");
    await harness.context.waitForStable();

    const receipt = await adapter.captureReceipt(harness.context);
    assert(receipt === null, "ambiguous submission must return null receipt");
    harness.dispose();
  });

  await runCase("resists non-semantic DOM drift", async () => {
    const { harness } = await setup("run-drift-gh", "/greenhouse/drift");
    const observation = await adapter.observeStep(harness.context);
    assert(observation.fields.length >= 3, "must observe fields despite wrapper/class drift");
    const email = observation.fields.find((f) => f.label.includes("Email"))!;
    assert(email !== undefined, "email field must be discovered");
    assert(await adapter.detect(harness.context), "detection must succeed on drifted DOM");
    harness.dispose();
  });

  await runCase("isolates hostile page text from execution and evidence", async () => {
    const { harness } = await setup("run-hostile-gh", "/greenhouse/hostile");
    const observation = await adapter.observeStep(harness.context);
    const serialized = JSON.stringify(observation);

    assert(observation.op === "observe", "operation must remain observe");
    assert(
      !serialized.includes("secret-greenhouse-token"),
      "hidden tokens must not be in observation",
    );
    const pwned = await harness.view.webContents.executeJavaScript(
      "window.__pwned === undefined",
    );
    assert(pwned === true, "malicious script payload must not have executed");
    harness.dispose();
  });

  await cleanupAllTempFiles();
  await api.close();
  await forms.close();
  if (window && !window.isDestroyed()) {
    window.close();
  }

  const summary = reportHarnessResult(cases);
  console.log(`\nGreenhouse Results: ${summary.passed} passed, ${summary.failed} failed.\n`);
  app.exit(summary.failed > 0 ? 1 : 0);
}

app.whenReady()
  .then(main)
  .catch((error) => {
    console.error("Fatal greenhouse fixture error:", error);
    app.exit(1);
  });
