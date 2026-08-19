import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Boots the real FastAPI service against a throwaway PostgreSQL database.
 *
 * The lifecycle fixture is mandatory, so nothing here degrades to a skip: if
 * PostgreSQL is unreachable the fixture fails with a clear message.
 */

const API_ROOT = path.resolve(__dirname, "..", "..", "..", "api");
const SEED_SCRIPT = path.join(__dirname, "backend", "seed_synthetic_run.py");

export const FIXTURE_RUNNER_SECRET =
  "desktop-fixture-runner-secret-at-least-thirty-two-chars";

export interface SeededBackend {
  databaseUrl: string;
  databaseName: string;
  runId: string;
  resumeSha256: string;
  resumeRoot: string;
  evidenceRoot: string;
}

export interface RunningApi {
  baseUrl: string;
  /** Service log, surfaced when a lifecycle case fails. */
  readonly stderr: string;
  stop: () => Promise<void>;
}

/** Create a disposable database, migrate it, and seed one synthetic run. */
export function seedBackend(applicationUrl: string): SeededBackend {
  const resumeRoot = mkdtempSync(path.join(tmpdir(), "job-engine-fixture-resumes-"));
  const evidenceRoot = mkdtempSync(path.join(tmpdir(), "job-engine-fixture-evidence-"));

  const result = spawnSync(
    "uv",
    ["run", "python", SEED_SCRIPT, applicationUrl, resumeRoot],
    { cwd: API_ROOT, encoding: "utf8", timeout: 180_000 },
  );

  if (result.status !== 0) {
    throw new Error(
      "Failed to seed the fixture database. PostgreSQL must be running " +
        "(docker compose up -d postgres).\n" +
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
    run_id: string;
    resume_sha256: string;
  };

  return {
    databaseUrl: parsed.database_url,
    databaseName: parsed.database_name,
    runId: parsed.run_id,
    resumeSha256: parsed.resume_sha256,
    resumeRoot,
    evidenceRoot,
  };
}

/** Start uvicorn against the seeded database and wait until it answers. */
export async function startApi(seeded: SeededBackend): Promise<RunningApi> {
  const port = 8100 + Math.floor(Math.random() * 400);
  const child: ChildProcess = spawn(
    "uv",
    [
      "run",
      "uvicorn",
      // The app is a factory, matching the documented dev command.
      "job_engine.main:create_app",
      "--factory",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--log-level",
      "warning",
    ],
    {
      cwd: API_ROOT,
      env: {
        ...process.env,
        // Settings reads DATABASE_URL: unlike the other keys it has no
        // job_engine_ alias, so only this name actually points the API at the
        // throwaway database.
        DATABASE_URL: seeded.databaseUrl,
        JOB_ENGINE_RUNNER_SECRET: FIXTURE_RUNNER_SECRET,
        JOB_ENGINE_RESUME_ROOT: seeded.resumeRoot,
        JOB_ENGINE_EVIDENCE_ROOT: seeded.evidenceRoot,
        // Deterministic answers only: no external provider is ever contacted.
        JOB_ENGINE_ANSWER_PROVIDER: "deterministic",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr?.on("data", (data) => {
    stderr += String(data);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(`API did not become ready in time:\n${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) {
        break;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    baseUrl,
    get stderr() {
      return stderr;
    },
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

/**
 * Drop the throwaway database and remove the fixture's temporary roots.
 *
 * Failures are warned about rather than thrown: teardown must not turn a
 * passing lifecycle into a failing one, but a silent leak is worse than noise.
 */
export function teardownBackend(seeded: SeededBackend): void {
  for (const dir of [seeded.resumeRoot, seeded.evidenceRoot]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Could not remove fixture directory ${dir}: ${String(error)}`);
    }
  }

  const result = spawnSync(
    "uv",
    [
      "run",
      "python",
      "-c",
      "import sys;" +
        "from sqlalchemy import create_engine, text;" +
        "from job_engine.config import DOCUMENTED_DATABASE_URL;" +
        "from job_engine.db.session import to_sync_url;" +
        "e=create_engine(to_sync_url(DOCUMENTED_DATABASE_URL), isolation_level='AUTOCOMMIT');" +
        "c=e.connect();" +
        'c.execute(text(f\'DROP DATABASE IF EXISTS "{sys.argv[1]}" WITH (FORCE)\'));' +
        "c.close();e.dispose()",
      seeded.databaseName,
    ],
    { cwd: API_ROOT, encoding: "utf8", timeout: 60_000 },
  );

  if (result.status !== 0) {
    console.warn(
      `Could not drop fixture database ${seeded.databaseName}:\n${result.stderr ?? ""}`,
    );
  }
}
