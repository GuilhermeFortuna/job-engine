import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveElectronBinary } from "../fixtures/electron-harness";
import { MockGenericFormServer } from "../fixtures/generic-form-server";
import { MockGreenhouseFormServer } from "../fixtures/greenhouse/greenhouse-form-server";
import { MockLeverFormServer } from "../fixtures/lever/lever-form-server";
import {
  createApplicationRun,
  FIXTURE_RUNNER_SECRET,
  seedCatalog,
  startApi,
  teardownBackend,
  TrustedRendererServer,
  type RunningApi,
  type SeededCatalog,
} from "./catalog-harness";

const DESKTOP_ROOT = path.resolve(__dirname, "..", "..");
const PRODUCTION_ENTRY = path.join(DESKTOP_ROOT, "dist", "main", "index.js");

function assertProductionEntryIsFresh(): void {
  if (!existsSync(PRODUCTION_ENTRY)) {
    throw new Error(
      `Missing ${PRODUCTION_ENTRY}. test:production must run tsc before the smoke.`,
    );
  }
  const artifactMtime = statSync(PRODUCTION_ENTRY).mtimeMs;
  const sources = [
    path.join(DESKTOP_ROOT, "src", "main", "index.ts"),
    path.join(DESKTOP_ROOT, "src", "main", "runtime", "coordinator.ts"),
  ];
  for (const source of sources) {
    if (statSync(source).mtimeMs > artifactMtime + 50) {
      throw new Error(
        `${PRODUCTION_ENTRY} is older than ${source}. Refusing to smoke a stale binary.`,
      );
    }
  }
}

async function pollRun(
  apiBaseUrl: string,
  runId: string,
  deadlineMs: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + deadlineMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const response = await fetch(`${apiBaseUrl}/api/v1/application-runs/${runId}`);
    if (response.ok) {
      last = (await response.json()) as Record<string, unknown>;
      const status = String(last.status ?? "");
      if (
        status === "submitted" ||
        status === "submission_unknown" ||
        status === "failed_final" ||
        status === "cancelled"
      ) {
        return last;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return last;
}

async function launchProductionDesktop(env: Record<string, string>): Promise<{
  stop: () => Promise<void>;
}> {
  const userData = mkdtempSync(path.join(tmpdir(), "job-engine-prod-desktop-"));
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
    NODE_ENV: "test",
    JOB_ENGINE_DESKTOP_USER_DATA_DIR: userData,
    ELECTRON_ENABLE_LOGGING: "1",
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    resolveElectronBinary(),
    [
      "--no-sandbox",
      PRODUCTION_ENTRY,
      "--ozone-platform=headless",
      "--disable-gpu",
      "--headless",
      "--ignore-certificate-errors",
    ],
    {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });
  await new Promise<void>((resolve, reject) => {
    const fail = (reason: string) => {
      reject(new Error(`Production Electron exited before becoming ready: ${reason}`));
    };
    child.once("error", (error) => fail(String(error)));
    child.once("exit", (code) => fail(`exit ${code}`));
    setTimeout(() => {
      child.removeAllListeners("error");
      child.removeAllListeners("exit");
      if (child.exitCode !== null) {
        fail(`exit ${child.exitCode}`);
        return;
      }
      resolve();
    }, 2_500);
  });
  return {
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.on("close", resolve);
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve(null);
        }, 5_000);
      });
    },
  };
}

async function runSmoke(input: {
  formUrl: string;
  canonicalUrl: string;
  sourceId: string;
  automationMode: "full_auto" | "semi_auto_pause_before_submit";
  expectedAdapter: string;
}): Promise<Record<string, unknown>> {
  assertProductionEntryIsFresh();

  const seeded: SeededCatalog = seedCatalog({
    applicationUrl: input.formUrl,
    canonicalUrl: input.canonicalUrl,
    sourceId: input.sourceId,
  });
  let api: RunningApi | null = null;
  const renderer = new TrustedRendererServer();
  let desktop: { stop: () => Promise<void> } | null = null;

  try {
    api = await startApi(seeded);
    const created = await createApplicationRun(api.baseUrl, {
      jobGroupId: seeded.jobGroupId,
      resumeId: seeded.resumeId,
      automationMode: input.automationMode,
    });
    if (input.automationMode === "full_auto") {
      expect(created.automatic_submission_authorized).toBe(true);
    }

    const origin = await renderer.start(created.id, api.baseUrl);

    desktop = await launchProductionDesktop({
      JOB_ENGINE_WEB_ORIGIN: origin,
      JOB_ENGINE_API_BASE_URL: api.baseUrl,
      JOB_ENGINE_RUNNER_SECRET: FIXTURE_RUNNER_SECRET,
    });

    const run = await pollRun(api.baseUrl, created.id, 120_000);
    expect(run.platform_adapter_id).toBe(input.expectedAdapter);
    if (
      run.status !== "submitted" &&
      run.status !== "submission_unknown"
    ) {
      throw new Error(
        `Production smoke did not complete. Last run payload: ${JSON.stringify(run)}`,
      );
    }
    if (input.automationMode === "full_auto") {
      expect(run.status).toBe("submitted");
      expect(run.current_checkpoint).toBe("submitted");
    }
    if (input.automationMode === "semi_auto_pause_before_submit") {
      expect(run.status).toBe("submitted");
    }
    return run;
  } finally {
    await desktop?.stop();
    await renderer.stop();
    await api?.stop();
    teardownBackend(seeded);
  }
}

describe("production Electron runtime smoke", () => {
  it("drives a generic authorized full-auto run from dist/main/index.js", async () => {
    const forms = new MockGenericFormServer();
    await forms.start();
    try {
      await runSmoke({
        formUrl: forms.urlFor("/generic/lifecycle"),
        canonicalUrl: forms.urlFor("/generic/lifecycle"),
        sourceId: "generic-smoke",
        automationMode: "full_auto",
        expectedAdapter: "generic",
      });
    } finally {
      await forms.close();
    }
  }, 240_000);

  it("drives a Greenhouse authorized full-auto run through the production coordinator", async () => {
    const forms = new MockGreenhouseFormServer();
    await forms.start();
    try {
      await runSmoke({
        formUrl: forms.urlFor("/greenhouse/standard"),
        canonicalUrl: "https://boards.greenhouse.io/acme/jobs/12345",
        sourceId: "greenhouse-smoke",
        automationMode: "full_auto",
        expectedAdapter: "greenhouse",
      });
    } finally {
      await forms.close();
    }
  }, 240_000);

  it("drives a Lever authorized full-auto run through the production coordinator", async () => {
    const forms = new MockLeverFormServer();
    await forms.start();
    try {
      await runSmoke({
        formUrl: forms.urlFor("/lever/apply"),
        canonicalUrl: "https://jobs.lever.co/acme/role/apply",
        sourceId: "lever-smoke",
        automationMode: "full_auto",
        expectedAdapter: "lever",
      });
    } finally {
      await forms.close();
    }
  }, 240_000);

  it("pauses a generic semi-auto run then submits after release", async () => {
    const forms = new MockGenericFormServer();
    await forms.start();
    try {
      await runSmoke({
        formUrl: forms.urlFor("/generic/lifecycle"),
        canonicalUrl: forms.urlFor("/generic/lifecycle"),
        sourceId: "generic-semi-smoke",
        automationMode: "semi_auto_pause_before_submit",
        expectedAdapter: "generic",
      });
    } finally {
      await forms.close();
    }
  }, 240_000);

  it("pauses a local coverage-veto fixture with exact reason while retaining the view", async () => {
    assertProductionEntryIsFresh();

    const forms = new MockGenericFormServer();
    await forms.start();
    const vetoUrl = forms.urlFor(
      "/__job-engine/coverage-veto/missing-adapter-evidence",
    );
    const seeded: SeededCatalog = seedCatalog({
      applicationUrl: vetoUrl,
      canonicalUrl: vetoUrl,
      sourceId: "coverage-veto-retain",
    });
    let api: RunningApi | null = null;
    const renderer = new TrustedRendererServer();
    let desktop: { stop: () => Promise<void> } | null = null;

    try {
      api = await startApi(seeded);
      const created = await createApplicationRun(api.baseUrl, {
        jobGroupId: seeded.jobGroupId,
        resumeId: seeded.resumeId,
        automationMode: "full_auto",
      });

      const origin = await renderer.start(created.id, api.baseUrl, "coverage_retain");
      desktop = await launchProductionDesktop({
        JOB_ENGINE_WEB_ORIGIN: origin,
        JOB_ENGINE_API_BASE_URL: api.baseUrl,
        JOB_ENGINE_RUNNER_SECRET: FIXTURE_RUNNER_SECRET,
      });

      const deadline = Date.now() + 90_000;
      let probe: Record<string, unknown> = {};
      while (Date.now() < deadline) {
        const response = await fetch(`${origin}/__probe`);
        if (response.ok) {
          probe = (await response.json()) as Record<string, unknown>;
          if (probe.ok === true || probe.ok === false) {
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      expect(probe).toMatchObject({
        ok: true,
        phase: "paused",
        reasonCode: "MISSING_ADAPTER_EVIDENCE",
        runtimeRunId: created.id,
        browserRunId: created.id,
      });

      const runResponse = await fetch(
        `${api.baseUrl}/api/v1/application-runs/${created.id}`,
      );
      expect(runResponse.ok).toBe(true);
      const run = (await runResponse.json()) as { status: string };
      expect(run.status).toBe("needs_input");
    } finally {
      await desktop?.stop();
      await renderer.stop();
      await api?.stop();
      teardownBackend(seeded);
      await forms.close();
    }
  }, 240_000);
});
