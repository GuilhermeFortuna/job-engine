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

const testUserDataDir = path.resolve(__dirname, "..", "..", "..", ".test-userData-lever");
fs.mkdirSync(testUserDataDir, { recursive: true });
app.setPath("userData", testUserDataDir);
app.setPath("crashDumps", testUserDataDir);

import { LeverFormAdapter } from "../../../src/main/adapters/lever";
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
import { MockLeverFormServer } from "./lever-form-server";

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
  const forms = new MockLeverFormServer();
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

  const adapter = new LeverFormAdapter();
  const client = new RunnerClient(api.baseUrl, {
    runnerSecret: api.runnerSecret,
    runnerId: "lever-fixture-runner",
  });

  const applyUrl = "https://jobs.lever.co/acme/job-42/apply";
  const postingUrl = "https://jobs.lever.co/acme/job-42";
  const thanksUrl = "https://jobs.lever.co/acme/job-42/thanks";

  async function setup(
    runId: string,
    pathname: string,
    virtualUrl = applyUrl,
  ) {
    api.seedRun({
      id: runId,
      application_url: virtualUrl,
      platform_adapter_id: "lever",
    });
    const lease = new LeaseManager(client);
    const outcome = await lease.claimFor(runId);
    const harness = await openPage(
      forms.urlFor(pathname),
      virtualUrl,
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

  await runCase("detects a synthetic Lever apply form", async () => {
    const { harness } = await setup("run-detect", "/lever/apply");
    assert(await adapter.detect(harness.context), "detect must succeed on /apply");
    harness.dispose();
  });

  await runCase("does not detect or advance a posting page", async () => {
    const { harness } = await setup("run-posting", "/lever/posting", postingUrl);
    assert((await adapter.detect(harness.context)) === false, "posting must not detect");
    const observation = await adapter.observeStep(harness.context);
    assert(
      (await adapter.advance(harness.context, observation)).activated === false,
      "posting anchor must not be activated",
    );
    harness.dispose();
  });

  await runCase("rejects Greenhouse-shaped collision markup on a Lever URL", async () => {
    const { harness } = await setup(
      "run-collision",
      "/lever/collisions/greenhouse",
    );
    assert(
      (await adapter.detect(harness.context)) === false,
      "Greenhouse-shaped DOM must not detect as Lever",
    );
    harness.dispose();
  });

  await runCase("fills and verifies visible Lever values", async () => {
    const { harness } = await setup("run-fill", "/lever/apply");
    const observation = await adapter.observeStep(harness.context);
    const name = observation.fields.find((field) => field.label.includes("Full name"))!;
    const result = await adapter.fillStep(harness.context, observation, [
      {
        semanticKey: name.semanticKey,
        fieldFingerprint: fingerprintFromSemanticKey("lever", name.semanticKey),
        value: "Ada Fixture",
        checked: null,
        decision: {} as never,
      },
    ]);
    assert(result.results[0].outcome === "VERIFIED", "name fill must verify");
    assert(result.results[0].observedValue === "Ada Fixture", "page must show the name");
    harness.dispose();
  });

  await runCase("discovers conditional fields only after a change", async () => {
    const { harness } = await setup("run-cond", "/lever/apply");
    const before = await adapter.observeStep(harness.context);
    assert(
      !before.fields.some((field) => field.label.includes("Visa type")),
      "hidden visa field must not be observed",
    );
    const sponsor = before.fields.find((field) =>
      field.label.includes("Need sponsorship"),
    )!;
    await adapter.fillStep(harness.context, before, [
      {
        semanticKey: sponsor.semanticKey,
        fieldFingerprint: "fp-spon",
        value: "Yes",
        checked: null,
        decision: {} as never,
      },
    ]);
    await harness.context.waitForStable();
    const after = await adapter.observeStep(harness.context);
    assert(
      after.fields.some((field) => field.label.includes("Visa type")),
      "visa field must appear after Yes",
    );
    harness.dispose();
  });

  await runCase("pauses on unresolved required fields", async () => {
    const { harness, runner } = await setup("run-unresolved", "/lever/unresolved");
    const result = await runner.runStep();
    assert(
      result.outcome === "NEEDS_ANSWERS",
      `expected NEEDS_ANSWERS, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("uploads the granted resume and deletes temp files", async () => {
    const { harness, runner } = await setup("run-upload", "/lever/apply");
    await runner.runStep();
    const after = await adapter.observeStep(harness.context);
    const resume = after.fields.find((field) => field.controlType === "file");
    assert(resume?.filename !== null, "resume filename must be visible");
    assert(trackedTempDirs().length === 0, "temp resume directory must be gone");
    harness.dispose();
  });

  await runCase("fails closed when the page rejects the upload", async () => {
    const { harness, runner } = await setup("run-upload-rej", "/lever/upload-reject");
    const result = await runner.runStep();
    const after = await adapter.observeStep(harness.context);
    const resume = after.fields.find((field) => field.controlType === "file");
    assert(resume?.filename === null, "rejected upload must not stay attached");
    assert(
      result.outcome === "NEEDS_ANSWERS" || result.outcome === "UNSUPPORTED",
      `rejected upload must pause, got ${result.outcome}`,
    );
    assert(trackedTempDirs().length === 0, "temp resume directory must be gone");
    harness.dispose();
  });

  await runCase("pauses on client validation alerts", async () => {
    const { harness, runner } = await setup("run-valid", "/lever/validation");
    const result = await runner.runStep();
    assert(
      result.outcome === "NEEDS_ANSWERS",
      `expected NEEDS_ANSWERS, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("pauses on an hCaptcha challenge", async () => {
    const { harness, runner } = await setup("run-captcha", "/lever/captcha");
    const result = await runner.runStep();
    assert(result.outcome === "CAPTCHA", `expected CAPTCHA, got ${result.outcome}`);
    harness.dispose();
  });

  await runCase("pauses on a required university combobox", async () => {
    const { harness, runner } = await setup(
      "run-unsup",
      "/lever/unsupported-required",
    );
    const result = await runner.runStep();
    assert(
      result.outcome === "UNSUPPORTED",
      `expected UNSUPPORTED, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("does not pause solely for an optional location combobox", async () => {
    const { harness, runner } = await setup(
      "run-optional",
      "/lever/optional-combobox",
    );
    const observation = await adapter.observeStep(harness.context);
    const name = observation.fields.find((field) => field.label.includes("Full name"))!;
    await adapter.fillStep(harness.context, observation, [
      {
        semanticKey: name.semanticKey,
        fieldFingerprint: "fp-name",
        value: "Ada Fixture",
        checked: null,
        decision: {} as never,
      },
    ]);
    const result = await runner.runStep();
    assert(
      result.outcome === "READY_FOR_REVIEW",
      `optional combobox must not block review, got ${result.outcome}`,
    );
    harness.dispose();
  });

  await runCase("stops at review rather than submitting", async () => {
    const { harness } = await setup("run-review", "/lever/apply");
    const observation = await adapter.observeStep(harness.context);
    assert(
      await adapter.detectReview(harness.context, observation),
      "apply page must read as review",
    );
    harness.dispose();
  });

  await runCase("submits once and captures a confirmed receipt", async () => {
    const { harness } = await setup("run-submit", "/lever/apply");
    const observation = await adapter.observeStep(harness.context);
    const first = await adapter.submitAfterRelease(harness.context, observation);
    assert(first.activated, "submit must activate once");
    await harness.context.waitForStable();
    const receipt = await adapter.captureReceipt(harness.context);
    assert(receipt !== null, "confirmed receipt must be captured");
    assert(
      receipt!.confirmationSignal === "confirmation_text",
      `expected confirmation_text, got ${receipt!.confirmationSignal}`,
    );
    harness.dispose();
  });

  await runCase("ambiguous submit returns null and is not activated again", async () => {
    const { harness } = await setup("run-ambig", "/lever/ambiguous-submit");
    const observation = await adapter.observeStep(harness.context);
    const first = await adapter.submitAfterRelease(harness.context, observation);
    assert(first.activated, "first activation must occur");
    await harness.context.waitForStable();
    assert(
      (await adapter.captureReceipt(harness.context)) === null,
      "ambiguous page must not produce a receipt",
    );
    const after = await adapter.observeStep(harness.context);
    const second = await adapter.submitAfterRelease(harness.context, after);
    assert(second.activated === false, "there must be no second activation");
    harness.dispose();
  });

  await runCase("thanks path with a remaining form is ambiguous", async () => {
    const { harness } = await setup(
      "run-thanks-form",
      "/lever/thanks-with-form",
      thanksUrl,
    );
    assert(
      (await adapter.captureReceipt(harness.context)) === null,
      "/thanks with a form must be ambiguous",
    );
    harness.dispose();
  });

  await runCase("resists non-semantic DOM drift", async () => {
    const { harness } = await setup("run-drift", "/lever/drift");
    assert(await adapter.detect(harness.context), "drifted apply form must still detect");
    harness.dispose();
  });

  await runCase("isolates hostile page text", async () => {
    const { harness } = await setup("run-hostile", "/lever/hostile");
    const observation = await adapter.observeStep(harness.context);
    assert(
      !JSON.stringify(observation).includes("hidden-lever-secret"),
      "hidden tokens must not be observed",
    );
    harness.dispose();
  });

  await cleanupAllTempFiles();
  await api.close();
  await forms.close();
  if (window && !window.isDestroyed()) {
    window.close();
  }

  const summary = reportHarnessResult(cases);
  console.log(`\nLever Results: ${summary.passed} passed, ${summary.failed} failed.\n`);
  app.exit(summary.failed > 0 ? 1 : 0);
}

app.whenReady()
  .then(main)
  .catch((error) => {
    console.error("Fatal lever fixture error:", error);
    app.exit(1);
  });
