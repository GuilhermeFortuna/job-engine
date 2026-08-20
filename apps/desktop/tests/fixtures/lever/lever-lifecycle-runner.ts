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

const testUserDataDir = path.resolve(__dirname, "..", "..", "..", ".test-userData-lever-life");
fs.mkdirSync(testUserDataDir, { recursive: true });
app.setPath("userData", testUserDataDir);
app.setPath("crashDumps", testUserDataDir);

import { LeverFormAdapter } from "../../../src/main/adapters/lever";
import type { AdapterContext } from "../../../src/main/adapters/contract";
import { IsolatedWorldSession } from "../../../src/main/forms/isolated-world";
import {
  attachResumeToFileInput,
  cleanupAllTempFiles,
  trackedTempDirs,
} from "../../../src/main/forms/upload";
import { isReleasedForSubmit } from "../../../src/main/runtime/checkpoints";
import { EvidenceRecorder } from "../../../src/main/runtime/evidence";
import { LeaseManager } from "../../../src/main/runtime/lease";
import { StepRunner } from "../../../src/main/runtime/runner";
import { RunnerClient } from "../../../src/main/runtime/runner-client";
import { reportHarnessResult, type HarnessCase } from "../electron-harness";

const cases: HarnessCase[] = [];
const APPLY_URL = "https://jobs.lever.co/acme/job-42/apply";

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

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing fixture environment variable ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const apiBaseUrl = required("JOB_ENGINE_FIXTURE_API");
  const formUrl = required("JOB_ENGINE_FIXTURE_FORM_URL");
  const runId = required("JOB_ENGINE_FIXTURE_RUN_ID");
  const runnerSecret = required("JOB_ENGINE_FIXTURE_RUNNER_SECRET");
  const resumeSha256 = required("JOB_ENGINE_FIXTURE_RESUME_SHA");

  const window = new BrowserWindow({
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
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1024, height: 768 });
  await view.webContents.loadURL(formUrl);

  const session = new IsolatedWorldSession(view.webContents.debugger);
  await session.attach();

  const client = new RunnerClient(apiBaseUrl, {
    runnerSecret,
    runnerId: "desktop-fixture-runner",
  });
  const adapter = new LeverFormAdapter();
  const lease = new LeaseManager(client);

  let resumeBytes: Buffer | null = null;
  const context: AdapterContext = {
    callInIsolatedWorld: (args) => session.call(args),
    currentUrl: () => new URL(APPLY_URL),
    waitForStable: () => new Promise((resolve) => setTimeout(resolve, 150)),
    attachResume: async (semanticKey) => {
      const result = await attachResumeToFileInput({
        session,
        semanticKey,
        bytes: resumeBytes!,
      });
      return { attached: result.attached };
    },
  };

  let leaseToken = "";
  let grantToken = "";
  let attempt = 1;

  await runCase("claims the owner-selected Lever run", async () => {
    const outcome = await lease.claimFor(runId);
    assert(outcome.claim !== null, `claim refused: ${outcome.refusal}`);
    leaseToken = outcome.claim!.lease_token;
    grantToken = outcome.claim!.grant_token;
    attempt = outcome.claim!.run.attempt_count;
    lease.startHeartbeat();
  });

  await runCase("fetches and verifies the granted resume", async () => {
    const fetched = await client.fetchResume(runId, grantToken, resumeSha256);
    assert(fetched.bytes.length > 0, "resume must have contents");
    resumeBytes = fetched.bytes;
  });

  await runCase("detects the synthetic /apply form", async () => {
    assert(await adapter.detect(context), "Lever detect must succeed on /apply");
  });

  const evidence = new EvidenceRecorder(client, runId, attempt);
  const runner = new StepRunner(
    {
      client,
      lease,
      adapter,
      context,
      evidence,
      loadResume: async () => resumeBytes!,
    },
    runId,
  );

  await runCase("observes an unresolved required custom field", async () => {
    const unresolvedUrl = formUrl.replace("/lever/lifecycle", "/lever/unresolved");
    await view.webContents.loadURL(unresolvedUrl);
    await context.waitForStable();
    const observation = await adapter.observeStep(context);
    assert(
      observation.fields.some(
        (field) =>
          field.required &&
          field.label.includes("former roles") &&
          field.value === "",
      ),
      "required custom question must be empty",
    );
    await view.webContents.loadURL(formUrl);
    await context.waitForStable();
  });

  await runCase("fills authorized visible values", async () => {
    const observation = await adapter.observeStep(context);
    const name = observation.fields.find((field) => field.label.includes("Full name"));
    const email = observation.fields.find((field) =>
      field.label.toLowerCase().includes("email"),
    );
    assert(name !== undefined && email !== undefined, "name and email must exist");
    const filled = await adapter.fillStep(context, observation, [
      {
        semanticKey: name!.semanticKey,
        fieldFingerprint: "fp-name",
        value: "Ada Fixture",
        checked: null,
        decision: {} as never,
      },
      {
        semanticKey: email!.semanticKey,
        fieldFingerprint: "fp-email",
        value: "ada.fixture@example.test",
        checked: null,
        decision: {} as never,
      },
    ]);
    assert(
      filled.results.every((row) => row.outcome === "VERIFIED"),
      "authorized values must verify on the page",
    );
  });

  await runCase("uploads resume and reaches READY_FOR_REVIEW", async () => {
    const result = await runner.runStep();
    assert(
      result.outcome === "READY_FOR_REVIEW",
      `expected READY_FOR_REVIEW, got ${result.outcome}`,
    );
    const after = await adapter.observeStep(context);
    const resume = after.fields.find((field) => field.controlType === "file");
    assert(resume?.filename !== null, "resume must be visible after upload");
    assert(trackedTempDirs().length === 0, "no temp resume directory may remain");
  });

  await runCase("arms submit_armed and pauses for the owner", async () => {
    await client.checkpoint(runId, leaseToken, "submit_armed", "Ready for review");
    await client.raiseException(runId, leaseToken, "semi_auto_armed", {
      step: "review",
    });
    lease.forget();
    const run = await client.getRun(runId);
    assert(run.status === "needs_input", `expected needs_input, got ${run.status}`);
    assert(
      run.current_checkpoint === "submit_armed",
      `expected submit_armed, got ${run.current_checkpoint}`,
    );
  });

  await runCase("refuses to submit before the owner releases", async () => {
    const run = await client.getRun(runId);
    assert(
      !isReleasedForSubmit({
        status: run.status,
        currentCheckpoint: run.current_checkpoint ?? null,
        submitAttemptedAt: run.submit_attempted_at ?? null,
        automationMode: run.automation_mode,
        automaticSubmissionAuthorized: run.automatic_submission_authorized,
      }),
      "an unreleased run must never read as submittable",
    );
    const premature = await lease.claimFor(runId);
    assert(premature.claim === null, "an unreleased run must not be claimable");
  });

  await runCase("detects owner release and reclaims the same run", async () => {
    const released = await fetch(
      `${apiBaseUrl}/api/v1/application-runs/${runId}/release-submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ owner_confirmation: "Submit this application" }),
      },
    );
    assert(released.ok, `release-submit failed with ${released.status}`);

    const reclaim = await lease.claimFor(runId);
    assert(reclaim.claim !== null, `reclaim refused: ${reclaim.refusal}`);
    assert(
      reclaim.claim!.run.current_checkpoint === "submit_armed",
      "reclaim must land at submit_armed",
    );
    leaseToken = reclaim.claim!.lease_token;
    attempt = reclaim.claim!.run.attempt_count;
  });

  let activations = 0;

  await runCase("submits once and reconciles a confirmed receipt", async () => {
    await client.checkpoint(runId, leaseToken, "submitting", "Activating submit");
    const observation = await adapter.observeStep(context);
    const activated = await adapter.submitAfterRelease(context, observation);
    assert(activated.activated, "submit control must activate");
    activations += 1;
    await context.waitForStable();

    const receipt = await adapter.captureReceipt(context);
    assert(receipt !== null, "a receipt must be captured");
    assert(
      receipt!.confirmationSignal === "confirmation_text",
      `expected confirmation_text, got ${receipt!.confirmationSignal}`,
    );

    const finalEvidence = new EvidenceRecorder(client, runId, attempt);
    const stored = await finalEvidence.recordReceipt(leaseToken, receipt!);
    const completed = await client.complete(runId, leaseToken, {
      terminalStatus: "submitted",
      terminalReason: null,
      receipt: {
        platform_adapter_id: adapter.adapterId,
        final_url: receipt!.finalUrl,
        platform_receipt_id: receipt!.platformReceiptId,
        confirmation_signal: receipt!.confirmationSignal,
        capture_timestamp: new Date().toISOString(),
        artifact_hash: stored.sha256,
        summary_notes: null,
      },
    });
    assert(completed.status === "submitted", `expected submitted, got ${completed.status}`);
  });

  await runCase("never submits a second time", async () => {
    assert(activations === 1, "submitAfterRelease must have run exactly once");
    const run = await client.getRun(runId);
    assert(run.submit_attempted_at !== null, "submit attempt must be recorded");
    const again = await lease.claimFor(runId);
    assert(again.claim === null, "a submitted run must never be re-claimed");
  });

  await runCase("ambiguous receipt is null and is not activated again", async () => {
    const ambiguousUrl = formUrl.replace(
      "/lever/lifecycle",
      "/lever/ambiguous-submit",
    );
    await view.webContents.loadURL(ambiguousUrl);
    await context.waitForStable();
    const observation = await adapter.observeStep(context);
    const first = await adapter.submitAfterRelease(context, observation);
    assert(first.activated, "first activation must occur");
    await context.waitForStable();
    assert(
      (await adapter.captureReceipt(context)) === null,
      "ambiguous page must not produce a receipt",
    );
    const after = await adapter.observeStep(context);
    const second = await adapter.submitAfterRelease(context, after);
    assert(second.activated === false, "there must be no second activation");
  });

  session.dispose();
  await cleanupAllTempFiles();
  if (!window.isDestroyed()) {
    window.close();
  }

  const summary = reportHarnessResult(cases);
  console.log(`\nResults: ${summary.passed} passed, ${summary.failed} failed.\n`);
  app.exit(summary.failed > 0 ? 1 : 0);
}

app.whenReady()
  .then(main)
  .catch((error) => {
    console.error("Fatal Lever lifecycle fixture error:", error);
    app.exit(1);
  });
