import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  FIXTURE_RUNNER_SECRET,
  startApi,
  teardownBackend,
  type RunningApi,
  type SeededBackend,
} from "../fixtures/backend-harness";

const API_ROOT = path.resolve(__dirname, "..", "..", "..", "api");
const SEED_SCRIPT = path.join(__dirname, "seed_catalog.py");

export { FIXTURE_RUNNER_SECRET, startApi, teardownBackend };
export type { RunningApi };

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}") as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

export interface SeededCatalog extends SeededBackend {
  jobGroupId: string;
  resumeId: string;
}

export function seedCatalog(input: {
  applicationUrl: string;
  canonicalUrl: string;
  sourceId: string;
}): SeededCatalog {
  const resumeRoot = mkdtempSync(path.join(tmpdir(), "job-engine-prod-resumes-"));
  const evidenceRoot = mkdtempSync(path.join(tmpdir(), "job-engine-prod-evidence-"));

  const result = spawnSync(
    "uv",
    [
      "run",
      "python",
      SEED_SCRIPT,
      input.applicationUrl,
      input.canonicalUrl,
      input.sourceId,
      resumeRoot,
    ],
    { cwd: API_ROOT, encoding: "utf8", timeout: 180_000 },
  );

  if (result.status !== 0) {
    throw new Error(
      "Failed to seed the production-smoke catalog. PostgreSQL must be running.\n" +
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }

  const line = (result.stdout ?? "")
    .trim()
    .split("\n")
    .reverse()
    .find((l) => l.startsWith("{"));
  if (!line) {
    throw new Error(`Seed script produced no JSON result:\n${result.stdout}`);
  }

  const parsed = JSON.parse(line) as {
    database_url: string;
    database_name: string;
    job_group_id: string;
    resume_id: string;
    resume_sha256: string;
  };

  return {
    databaseUrl: parsed.database_url,
    databaseName: parsed.database_name,
    runId: "",
    resumeSha256: parsed.resume_sha256,
    resumeRoot,
    evidenceRoot,
    jobGroupId: parsed.job_group_id,
    resumeId: parsed.resume_id,
  };
}

export async function createApplicationRun(
  apiBaseUrl: string,
  input: {
    jobGroupId: string;
    resumeId: string;
    automationMode: "full_auto" | "semi_auto_pause_before_submit";
  },
): Promise<{ id: string; automatic_submission_authorized: boolean }> {
  const body: Record<string, unknown> = {
    job_group_ids: [input.jobGroupId],
    resume_id: input.resumeId,
    automation_mode: input.automationMode,
  };
  if (input.automationMode === "full_auto") {
    body.owner_confirmation =
      "Authorize automatic submission for these selected jobs";
  }

  const response = await fetch(`${apiBaseUrl}/api/v1/application-runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `POST /application-runs failed: ${response.status} ${await response.text()}`,
    );
  }
  const payload = (await response.json()) as {
    created_runs: {
      id: string;
      automatic_submission_authorized: boolean;
    }[];
  };
  if (!payload.created_runs[0]) {
    throw new Error(`Run was not created: ${JSON.stringify(payload)}`);
  }
  return payload.created_runs[0];
}

export class TrustedRendererServer {
  private server: Server | null = null;
  origin = "";
  private apiBaseUrl = "";
  private runId = "";
  private mode: "submit" | "coverage_retain" = "submit";
  lastProbe: Record<string, unknown> = {};

  async start(
    runId: string,
    apiBaseUrl: string,
    mode: "submit" | "coverage_retain" = "submit",
  ): Promise<string> {
    this.runId = runId;
    this.apiBaseUrl = apiBaseUrl;
    this.mode = mode;
    this.lastProbe = {};
    const port = 3200 + Math.floor(Math.random() * 400);
    const html =
      mode === "coverage_retain"
        ? this.coverageRetainHtml(runId)
        : this.submitHtml(runId);

    this.server = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/__probe") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.lastProbe));
        return;
      }
      if (req.method === "POST" && req.url === "/__probe") {
        void readJsonBody(req).then((body) => {
          this.lastProbe = body;
          res.writeHead(204);
          res.end();
        });
        return;
      }
      if (req.method === "POST" && req.url === "/__resolve") {
        void this.resolvePendingQuestions().finally(() => {
          res.writeHead(204);
          res.end();
        });
        return;
      }
      if (req.method === "POST" && req.url === "/__release") {
        void fetch(
          `${this.apiBaseUrl}/api/v1/application-runs/${this.runId}/release-submit`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "http://localhost:3000",
            },
            body: JSON.stringify({ owner_confirmation: "Submit this application" }),
          },
        ).finally(() => {
          res.writeHead(204);
          res.end();
        });
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, "127.0.0.1", () => resolve());
    });
    this.origin = `http://127.0.0.1:${port}`;
    return this.origin;
  }

  private submitHtml(runId: string): string {
    return `<!DOCTYPE html>
<html><head><title>Job Engine Smoke</title></head>
<body>
<p id="status">loading</p>
<script>
const runId = ${JSON.stringify(runId)};
async function waitForBridge(attempts) {
  for (let i = 0; i < attempts; i++) {
    if (window.jobEngineDesktop) {
      return window.jobEngineDesktop;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
async function main() {
  const api = await waitForBridge(50);
  if (!api) {
    document.getElementById("status").textContent = "no-bridge";
    return;
  }
  const opened = await api.openApplication({ runId });
  document.getElementById("status").textContent = opened.success
    ? "opened"
    : ("failed:" + (opened.error || ""));
  for (let i = 0; i < 90; i++) {
    const state = await api.getRuntimeState();
    if (state.phase === "paused" && state.status === "needs_input") {
      await fetch("/__resolve", { method: "POST" });
      await api.openApplication({ runId });
    }
    if (state.phase === "armed") {
      await fetch("/__release", { method: "POST" });
      await api.openApplication({ runId });
    }
    if (state.phase === "terminal") {
      document.getElementById("status").textContent = "terminal:" + (state.status || "");
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
main().catch((err) => {
  document.getElementById("status").textContent = String(err);
});
</script>
</body></html>`;
  }

  private coverageRetainHtml(runId: string): string {
    return `<!DOCTYPE html>
<html><head><title>Job Engine Coverage Retain Smoke</title></head>
<body>
<p id="status">loading</p>
<script>
const runId = ${JSON.stringify(runId)};
async function waitForBridge(attempts) {
  for (let i = 0; i < attempts; i++) {
    if (window.jobEngineDesktop) {
      return window.jobEngineDesktop;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
async function report(probe) {
  document.getElementById("status").textContent = JSON.stringify(probe);
  await fetch("/__probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(probe),
  });
}
async function main() {
  const api = await waitForBridge(50);
  if (!api) {
    await report({ ok: false, error: "no-bridge" });
    return;
  }
  let browserRunId = null;
  api.subscribeBrowserState((state) => {
    browserRunId = state.runId;
  });
  const opened = await api.openApplication({ runId });
  for (let i = 0; i < 60; i++) {
    const state = await api.getRuntimeState();
    if (state.phase === "paused") {
      await report({
        ok: true,
        phase: state.phase,
        reasonCode: state.reasonCode,
        runtimeRunId: state.runId,
        browserRunId,
        openedSuccess: opened.success,
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await report({ ok: false, error: "timeout", browserRunId });
}
main().catch(async (err) => {
  await report({ ok: false, error: String(err) });
});
</script>
</body></html>`;
  }

  private async resolvePendingQuestions(): Promise<void> {
    const response = await fetch(
      `${this.apiBaseUrl}/api/v1/application-runs/${this.runId}`,
    );
    if (!response.ok) {
      return;
    }
    const run = (await response.json()) as {
      exceptions?: {
        id: string;
        exception_type: string;
        status: string;
        field_reports?: {
          field_fingerprint: string;
          label: string;
          options?: string[];
        }[];
      }[];
    };
    const pending = (run.exceptions ?? []).find(
      (item) => item.status === "pending" && item.exception_type === "unresolved_question",
    );
    if (!pending?.field_reports?.length) {
      return;
    }
    await fetch(
      `${this.apiBaseUrl}/api/v1/application-runs/${this.runId}/resolve-answers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          exception_id: pending.id,
          answers: pending.field_reports.map((field) => ({
            field_fingerprint: field.field_fingerprint,
            answer_text: smokeAnswerFor(field.label, field.options ?? []),
            save_to_answer_bank: false,
          })),
        }),
      },
    );
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }
}

function smokeAnswerFor(label: string, options: string[]): string {
  const normalized = label.toLowerCase();
  if (options.length > 0) {
    const declined = options.find((option) => /^no$/i.test(option.trim()));
    return declined ?? options[0]!;
  }
  if (normalized.includes("first name")) {
    return "Ada";
  }
  if (normalized.includes("last name")) {
    return "Fixture";
  }
  if (normalized.includes("email")) {
    return "ada.fixture@example.test";
  }
  if (normalized.includes("phone")) {
    return "+15550100";
  }
  if (normalized.includes("linkedin")) {
    return "https://linkedin.com/in/ada-fixture";
  }
  if (normalized.includes("name")) {
    return "Ada Fixture";
  }
  return "Ada Fixture";
}
