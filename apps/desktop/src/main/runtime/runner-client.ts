import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  answerDecisionResponseSchema,
  type AnswerDecision,
  type QuestionObservation,
} from "../forms/types";

/**
 * Typed client for the backend runner API.
 *
 * Credentials live here and nowhere else: the runner bearer secret, the lease
 * token, and the single-use resume grant stay in main-process memory and are
 * never exposed through the preload bridge or written to disk.
 */

export const runSchema = z.object({
  id: z.string(),
  automation_mode: z.string(),
  status: z.string(),
  current_checkpoint: z.string().nullable().optional(),
  submit_attempted_at: z.string().nullable().optional(),
  attempt_count: z.number(),
  platform_adapter_id: z.string(),
  application_url: z.string(),
  canonical_application_url: z.string().optional(),
  resume_sha256: z.string(),
  automatic_submission_authorized: z.boolean().optional().default(false),
  automatic_submission_authorized_at: z.string().nullable().optional(),
});
export type RunnerRun = z.infer<typeof runSchema>;

export const claimResponseSchema = z.object({
  run: runSchema,
  lease_token: z.string(),
  grant_token: z.string(),
  lease_expires_at: z.string(),
});
export type ClaimResponse = z.infer<typeof claimResponseSchema>;

const evidenceResponseSchema = z.object({
  id: z.string(),
  relative_path: z.string(),
  sha256: z.string(),
  file_size_bytes: z.number(),
});

/** Reasons the runtime may hand a claimed run back. Backend enum verbatim. */
export type ReleaseReason =
  | "unsupported_automation_mode"
  | "run_not_selected"
  | "runtime_unavailable";

export class RunnerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface RunnerCredentials {
  /** Process-level runner bearer secret. */
  runnerSecret: string;
  /** Stable identity for this runner, used for release replay authorization. */
  runnerId: string;
}

export class RunnerClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly credentials: RunnerCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.credentials.runnerSecret}`,
      "X-Runner-Id": this.credentials.runnerId,
      ...extra,
    };
  }

  private async request(
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, init);
    } catch (error) {
      // Never echo the request back: it carries credentials.
      throw new RunnerApiError(
        `Runner API unreachable: ${error instanceof Error ? error.message : "unknown"}`,
        0,
      );
    }
    return response;
  }

  private async json<T>(
    response: Response,
    schema: z.ZodType<T>,
    context: string,
  ): Promise<T> {
    if (!response.ok) {
      throw new RunnerApiError(
        `${context} failed with HTTP ${response.status}`,
        response.status,
      );
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new RunnerApiError(
        `${context} returned an unexpected response shape`,
        response.status,
      );
    }
    return parsed.data;
  }

  /**
   * Claim exactly one run by ID.
   *
   * The runtime never claims untargeted: it claims the run the owner opened,
   * so it can never be handed someone else's work. `null` means the run was
   * not claimable.
   */
  async claim(runId: string): Promise<ClaimResponse | null> {
    const response = await this.request("/api/v1/runner/claims", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ run_id: runId }),
    });
    if (response.status === 204) {
      return null;
    }
    return this.json(response, claimResponseSchema, "Claim");
  }

  /** Hand a claimed run back without consuming its retry budget. */
  async releaseClaim(
    runId: string,
    leaseToken: string,
    reason: ReleaseReason,
    idempotencyKey: string = randomUUID(),
  ): Promise<void> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/release-claim`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Runner-Lease-Token": leaseToken,
          "Idempotency-Key": idempotencyKey,
        }),
        body: JSON.stringify({ reason }),
      },
    );
    if (!response.ok) {
      throw new RunnerApiError(
        `Release claim failed with HTTP ${response.status}`,
        response.status,
      );
    }
  }

  async heartbeat(
    runId: string,
    leaseToken: string,
    extendSeconds = 60,
  ): Promise<RunnerRun> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/heartbeat`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Runner-Lease-Token": leaseToken,
        }),
        body: JSON.stringify({ extend_seconds: extendSeconds }),
      },
    );
    return this.json(response, runSchema, "Heartbeat");
  }

  async checkpoint(
    runId: string,
    leaseToken: string,
    checkpoint: string,
    stepDescription: string | null,
  ): Promise<RunnerRun> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/checkpoints`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Runner-Lease-Token": leaseToken,
        }),
        body: JSON.stringify({
          checkpoint,
          step_description: stepDescription,
        }),
      },
    );
    return this.json(response, runSchema, "Checkpoint");
  }

  async raiseException(
    runId: string,
    leaseToken: string,
    exceptionType: string,
    contextPayload: Record<string, unknown>,
  ): Promise<void> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/exceptions`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Runner-Lease-Token": leaseToken,
        }),
        body: JSON.stringify({
          exception_type: exceptionType,
          context_payload: contextPayload,
        }),
      },
    );
    if (!response.ok) {
      throw new RunnerApiError(
        `Raise exception failed with HTTP ${response.status}`,
        response.status,
      );
    }
  }

  /**
   * Ask the backend what may be filled.
   *
   * The runtime sends observations only. It never proposes an answer, scores
   * confidence, or overrides policy: every value it writes came from here.
   */
  async answerDecisions(
    runId: string,
    leaseToken: string,
    observations: readonly QuestionObservation[],
  ): Promise<AnswerDecision[]> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/answer-decisions`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Runner-Lease-Token": leaseToken,
        }),
        body: JSON.stringify({ observations }),
      },
    );
    const parsed = await this.json(
      response,
      answerDecisionResponseSchema,
      "Answer decisions",
    );
    return parsed.decisions;
  }

  /**
   * Fetch the granted resume and verify it against the claimed run.
   *
   * The grant is single use, so a failed checksum is terminal for the attempt
   * rather than something to retry.
   */
  async fetchResume(
    runId: string,
    grantToken: string,
    expectedSha256: string,
  ): Promise<{ bytes: Buffer; filename: string }> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/resume-asset`,
      {
        method: "GET",
        headers: this.headers({ "X-Resume-Grant-Token": grantToken }),
      },
    );
    if (!response.ok) {
      throw new RunnerApiError(
        `Resume fetch failed with HTTP ${response.status}`,
        response.status,
      );
    }

    const advertised = response.headers.get("X-Resume-Sha256");
    if (!advertised || advertised.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new RunnerApiError(
        "Resume checksum does not match the claimed run",
        response.status,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const { createHash } = await import("node:crypto");
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== advertised.toLowerCase()) {
      throw new RunnerApiError(
        "Resume bytes do not match the advertised checksum",
        response.status,
      );
    }

    return { bytes, filename: "resume.pdf" };
  }

  /** Upload an evidence artifact. Only `receipt` and `log` are ever sent. */
  async uploadEvidence(
    runId: string,
    leaseToken: string,
    input: {
      attempt: number;
      evidenceType: "receipt" | "log";
      filename: string;
      contents: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ sha256: string; relativePath: string }> {
    const form = new FormData();
    form.set("attempt", String(input.attempt));
    form.set("evidence_type", input.evidenceType);
    form.set("metadata_json", JSON.stringify(input.metadata));
    form.set(
      "file",
      new Blob([input.contents], { type: "application/json" }),
      input.filename,
    );

    const response = await this.request(
      `/api/v1/runner/runs/${runId}/evidence`,
      {
        method: "POST",
        headers: this.headers({ "X-Runner-Lease-Token": leaseToken }),
        body: form,
      },
    );
    const parsed = await this.json(
      response,
      evidenceResponseSchema,
      "Evidence upload",
    );
    return { sha256: parsed.sha256, relativePath: parsed.relative_path };
  }

  async complete(
    runId: string,
    leaseToken: string,
    input: {
      terminalStatus: string;
      terminalReason: string | null;
      receipt: Record<string, unknown> | null;
    },
  ): Promise<RunnerRun> {
    const response = await this.request(
      `/api/v1/runner/runs/${runId}/complete`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Runner-Lease-Token": leaseToken,
        }),
        body: JSON.stringify({
          terminal_status: input.terminalStatus,
          terminal_reason: input.terminalReason,
          receipt: input.receipt,
        }),
      },
    );
    return this.json(response, runSchema, "Complete");
  }

  /**
   * Read a run through the owner-facing endpoint.
   *
   * Used while paused for review, when the runtime holds no lease: raising an
   * exception clears it, so this is the only way to notice the owner's
   * release.
   */
  async getRun(runId: string): Promise<RunnerRun> {
    const response = await this.request(`/api/v1/application-runs/${runId}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return this.json(response, runSchema, "Get run");
  }
}
