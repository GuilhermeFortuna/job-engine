import crypto from "node:crypto";
import http from "node:http";

/**
 * In-memory implementation of the backend runner API.
 *
 * Mirrors the contract frozen in CROSS-010 step 1 -- including targeted
 * claiming, release-claim replay authorization, and the lease/grant rules --
 * so the deterministic fixture matrix exercises the same wire behavior the
 * real backend enforces.
 */

export interface MockRun {
  id: string;
  automation_mode: string;
  status: string;
  current_checkpoint: string | null;
  submit_attempted_at: string | null;
  attempt_count: number;
  retry_failure_count: number;
  platform_adapter_id: string;
  application_url: string;
  resume_sha256: string;
}

interface ReleaseRecord {
  leaseTokenHash: string;
  runnerId: string;
  reason: string;
  requestId: string;
  supersededAt: string | null;
}

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export class MockRunnerApiServer {
  private server: http.Server;
  public port = 0;
  public baseUrl = "";

  readonly runs = new Map<string, MockRun>();
  readonly decisions = new Map<string, unknown[]>();
  readonly evidence: { type: string; attempt: number; body: string }[] = [];
  readonly checkpoints: string[] = [];
  readonly exceptions: { type: string; context: unknown }[] = [];
  readonly claimCalls: { runId: string | null }[] = [];
  readonly completions: { status: string; receipt: unknown }[] = [];

  private leaseHash = new Map<string, string>();
  private grantHash = new Map<string, string>();
  private grantConsumed = new Set<string>();
  private releases = new Map<string, ReleaseRecord[]>();

  /** Bytes served for the resume grant, and their checksum. */
  resumeBytes = Buffer.from("%PDF-1.4 synthetic resume for fixtures");

  constructor(readonly runnerSecret = "fixture-runner-secret") {
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
  }

  get resumeSha256(): string {
    return crypto.createHash("sha256").update(this.resumeBytes).digest("hex");
  }

  seedRun(run: Partial<MockRun> & { id: string; application_url: string }): MockRun {
    const full: MockRun = {
      automation_mode: "semi_auto_pause_before_submit",
      status: "queued",
      current_checkpoint: null,
      submit_attempted_at: null,
      attempt_count: 0,
      retry_failure_count: 0,
      platform_adapter_id: "generic",
      resume_sha256: this.resumeSha256,
      ...run,
    };
    this.runs.set(full.id, full);
    return full;
  }

  /** Queue the decisions the next answer-decisions call returns. */
  setDecisions(runId: string, decisions: unknown[]): void {
    this.decisions.set(runId, decisions);
  }

  private authorized(req: http.IncomingMessage): boolean {
    const header = req.headers.authorization ?? "";
    return header === `Bearer ${this.runnerSecret}`;
  }

  private leaseValid(runId: string, req: http.IncomingMessage): boolean {
    const token = req.headers["x-runner-lease-token"];
    if (typeof token !== "string") {
      return false;
    }
    return this.leaseHash.get(runId) === sha256(token);
  }

  private async body(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private send(
    res: http.ServerResponse,
    status: number,
    payload?: unknown,
  ): void {
    if (payload === undefined) {
      res.writeHead(status);
      res.end();
      return;
    }
    const json = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(json),
    });
    res.end(json);
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const parts = url.pathname.split("/").filter(Boolean);

    // Owner-facing read, used while paused for review (no runner secret).
    if (
      req.method === "GET" &&
      parts[2] === "application-runs" &&
      parts.length === 4
    ) {
      const run = this.runs.get(parts[3]);
      return run ? this.send(res, 200, run) : this.send(res, 404, {});
    }

    if (!url.pathname.startsWith("/api/v1/runner")) {
      return this.send(res, 404, {});
    }
    if (!this.authorized(req)) {
      return this.send(res, 401, { detail: "Invalid runner credential" });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runner/claims") {
      return this.claim(req, res);
    }

    const runId = parts[4];
    const action = parts[5];
    const run = this.runs.get(runId ?? "");
    if (!run) {
      return this.send(res, 404, { detail: "Run not found" });
    }

    switch (action) {
      case "release-claim":
        return this.releaseClaim(req, res, run);
      case "heartbeat":
        return this.leaseValid(run.id, req)
          ? this.send(res, 200, run)
          : this.send(res, 401, { detail: "Lease invalid" });
      case "checkpoints":
        return this.checkpoint(req, res, run);
      case "exceptions":
        return this.exception(req, res, run);
      case "answer-decisions":
        return this.answerDecisions(req, res, run);
      case "resume-asset":
        return this.resumeAsset(req, res, run);
      case "evidence":
        return this.uploadEvidence(req, res, run);
      case "complete":
        return this.complete(req, res, run);
      default:
        return this.send(res, 404, {});
    }
  }

  private async claim(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const raw = await this.body(req);
    const requested = raw ? (JSON.parse(raw) as { run_id?: string }) : {};
    this.claimCalls.push({ runId: requested.run_id ?? null });

    const run = requested.run_id
      ? this.runs.get(requested.run_id)
      : [...this.runs.values()].find((r) => r.status === "queued");

    if (!run || run.status !== "queued") {
      return this.send(res, 204);
    }

    run.status = "claimed";
    run.attempt_count += 1;

    const leaseToken = crypto.randomBytes(24).toString("hex");
    const grantToken = crypto.randomBytes(24).toString("hex");
    this.leaseHash.set(run.id, sha256(leaseToken));
    this.grantHash.set(run.id, sha256(grantToken));
    this.grantConsumed.delete(run.id);

    // A later claim retires every outstanding release record.
    for (const record of this.releases.get(run.id) ?? []) {
      record.supersededAt = new Date().toISOString();
    }

    return this.send(res, 200, {
      run,
      lease_token: leaseToken,
      grant_token: grantToken,
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  private async releaseClaim(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): Promise<void> {
    const token = req.headers["x-runner-lease-token"];
    const runnerId = req.headers["x-runner-id"];
    const requestId = req.headers["idempotency-key"];
    if (typeof token !== "string") {
      return this.send(res, 401, { detail: "Missing lease token" });
    }
    if (typeof requestId !== "string" || requestId === "") {
      return this.send(res, 400, { detail: "Missing Idempotency-Key header" });
    }
    const { reason } = JSON.parse(await this.body(req)) as { reason: string };

    if (run.submit_attempted_at !== null || run.current_checkpoint === "submitting") {
      return this.send(res, 409, { detail: "Run cannot be released" });
    }

    const records = this.releases.get(run.id) ?? [];
    const existing = records.find((r) => r.leaseTokenHash === sha256(token));
    if (existing) {
      const matches =
        existing.supersededAt === null &&
        existing.runnerId === runnerId &&
        existing.reason === reason &&
        existing.requestId === requestId;
      return matches
        ? this.send(res, 200, run)
        : this.send(res, 401, { detail: "Lease invalid or expired" });
    }

    if (!this.leaseValid(run.id, req)) {
      return this.send(res, 401, { detail: "Lease invalid or expired" });
    }

    run.status = "queued";
    this.leaseHash.delete(run.id);
    this.grantConsumed.add(run.id);
    records.push({
      leaseTokenHash: sha256(token),
      runnerId: String(runnerId),
      reason,
      requestId,
      supersededAt: null,
    });
    this.releases.set(run.id, records);
    return this.send(res, 200, run);
  }

  private async checkpoint(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): Promise<void> {
    if (!this.leaseValid(run.id, req)) {
      return this.send(res, 401, { detail: "Lease invalid" });
    }
    const { checkpoint } = JSON.parse(await this.body(req)) as {
      checkpoint: string;
    };
    this.checkpoints.push(checkpoint);
    run.current_checkpoint = checkpoint;
    if (checkpoint === "submitting") {
      run.submit_attempted_at = new Date().toISOString();
    }
    if (run.status === "claimed") {
      run.status = "running";
    }
    return this.send(res, 200, run);
  }

  private async exception(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): Promise<void> {
    if (!this.leaseValid(run.id, req)) {
      return this.send(res, 401, { detail: "Lease invalid" });
    }
    const payload = JSON.parse(await this.body(req)) as {
      exception_type: string;
      context_payload: unknown;
    };
    this.exceptions.push({
      type: payload.exception_type,
      context: payload.context_payload,
    });
    run.status =
      payload.exception_type === "auth_required" ||
      payload.exception_type === "captcha_required"
        ? "paused_auth"
        : "needs_input";
    // Raising an exception drops the lease, exactly like the backend.
    this.leaseHash.delete(run.id);
    return this.send(res, 200, { id: crypto.randomUUID() });
  }

  private async answerDecisions(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): Promise<void> {
    if (!this.leaseValid(run.id, req)) {
      return this.send(res, 401, { detail: "Lease invalid" });
    }
    await this.body(req);
    return this.send(res, 200, {
      decisions: this.decisions.get(run.id) ?? [],
    });
  }

  private resumeAsset(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): void {
    const token = req.headers["x-resume-grant-token"];
    if (typeof token !== "string" || this.grantHash.get(run.id) !== sha256(token)) {
      return this.send(res, 401, { detail: "Grant invalid" });
    }
    if (this.grantConsumed.has(run.id)) {
      return this.send(res, 410, { detail: "Grant already consumed" });
    }
    this.grantConsumed.add(run.id);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "X-Resume-Sha256": this.resumeSha256,
      "Content-Length": this.resumeBytes.length,
    });
    res.end(this.resumeBytes);
  }

  private async uploadEvidence(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): Promise<void> {
    if (!this.leaseValid(run.id, req)) {
      return this.send(res, 401, { detail: "Lease invalid" });
    }
    const raw = await this.body(req);
    const type = /name="evidence_type"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] ?? "";
    const attempt = /name="attempt"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1] ?? "0";
    this.evidence.push({ type, attempt: Number(attempt), body: raw });
    return this.send(res, 200, {
      id: crypto.randomUUID(),
      relative_path: `runs/${run.id}/attempt_${attempt}/evidence`,
      sha256: sha256(raw),
      file_size_bytes: Buffer.byteLength(raw),
    });
  }

  private async complete(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    run: MockRun,
  ): Promise<void> {
    if (!this.leaseValid(run.id, req)) {
      return this.send(res, 401, { detail: "Lease invalid" });
    }
    const payload = JSON.parse(await this.body(req)) as {
      terminal_status: string;
      receipt: unknown;
    };
    if (payload.terminal_status === "submitted" && !payload.receipt) {
      return this.send(res, 400, { detail: "SUBMITTED requires a receipt" });
    }
    this.completions.push({
      status: payload.terminal_status,
      receipt: payload.receipt,
    });
    run.status = payload.terminal_status;
    this.leaseHash.delete(run.id);
    return this.send(res, 200, run);
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address() as { port: number };
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
