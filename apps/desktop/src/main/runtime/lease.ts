import type { ClaimResponse, ReleaseReason, RunnerClient } from "./runner-client";

/**
 * Owns the lease for exactly one run.
 *
 * Two properties matter most here. First, claiming is always targeted at the
 * run the owner opened, so the runtime can never be handed work it did not ask
 * for. Second, a run this runtime has refused is remembered, so refusing it
 * cannot become a claim/release loop.
 */

export type ClaimRefusal =
  | "NOT_CLAIMABLE"
  | "UNSUPPORTED_AUTOMATION_MODE"
  | "PREVIOUSLY_REFUSED";

export interface ClaimOutcome {
  claim: ClaimResponse | null;
  refusal: ClaimRefusal | null;
}

export interface LeaseTimers {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const DEFAULT_TIMERS: LeaseTimers = {
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

/** Backend lease lifetime is 60s; beat well inside it. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

export const SUPPORTED_AUTOMATION_MODE = "semi_auto_pause_before_submit";

export class LeaseManager {
  private current: ClaimResponse | null = null;
  private heartbeatHandle: unknown = null;
  private lastHeartbeatError: Error | null = null;

  /**
   * Runs this runtime claimed and immediately handed back.
   *
   * Only a fresh, explicit owner action clears an entry. Without this, opening
   * an unsupported run would claim and release it forever.
   */
  private readonly refused = new Set<string>();

  constructor(
    private readonly client: RunnerClient,
    private readonly timers: LeaseTimers = DEFAULT_TIMERS,
  ) {}

  get lease(): ClaimResponse | null {
    return this.current;
  }

  get leaseToken(): string | null {
    return this.current?.lease_token ?? null;
  }

  get heartbeatError(): Error | null {
    return this.lastHeartbeatError;
  }

  hasRefused(runId: string): boolean {
    return this.refused.has(runId);
  }

  /**
   * Clear a refusal so the owner can deliberately try the run again.
   *
   * Called only from an explicit owner action, never from a retry loop.
   */
  allowRetry(runId: string): void {
    this.refused.delete(runId);
  }

  /**
   * Claim the run the owner opened.
   *
   * A run in an automation mode this build does not execute is handed straight
   * back and remembered, so it is refused exactly once per owner action.
   */
  async claimFor(runId: string): Promise<ClaimOutcome> {
    if (this.refused.has(runId)) {
      return { claim: null, refusal: "PREVIOUSLY_REFUSED" };
    }

    const claim = await this.client.claim(runId);
    if (claim === null) {
      return { claim: null, refusal: "NOT_CLAIMABLE" };
    }

    if (claim.run.automation_mode !== SUPPORTED_AUTOMATION_MODE) {
      this.refused.add(runId);
      await this.safeRelease(
        runId,
        claim.lease_token,
        "unsupported_automation_mode",
      );
      return { claim: null, refusal: "UNSUPPORTED_AUTOMATION_MODE" };
    }

    // A targeted claim cannot return another run, but a mismatch would mean
    // the contract broke; hand it back rather than act on it.
    if (claim.run.id !== runId) {
      await this.safeRelease(
        claim.run.id,
        claim.lease_token,
        "run_not_selected",
      );
      return { claim: null, refusal: "NOT_CLAIMABLE" };
    }

    this.current = claim;
    this.lastHeartbeatError = null;
    return { claim, refusal: null };
  }

  startHeartbeat(): void {
    if (this.heartbeatHandle !== null || this.current === null) {
      return;
    }
    this.heartbeatHandle = this.timers.setInterval(() => {
      void this.beat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async beat(): Promise<void> {
    const lease = this.current;
    if (lease === null) {
      return;
    }
    try {
      await this.client.heartbeat(lease.run.id, lease.lease_token);
      this.lastHeartbeatError = null;
    } catch (error) {
      // A lost lease is not recoverable by beating harder. Record it and stop;
      // the backend reclaims the run on expiry.
      this.lastHeartbeatError =
        error instanceof Error ? error : new Error("heartbeat failed");
      this.stopHeartbeat();
    }
  }

  stopHeartbeat(): void {
    if (this.heartbeatHandle !== null) {
      this.timers.clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  /** Hand the current lease back and stop beating. */
  async release(reason: ReleaseReason): Promise<void> {
    const lease = this.current;
    this.stopHeartbeat();
    this.current = null;
    if (lease === null) {
      return;
    }
    await this.safeRelease(lease.run.id, lease.lease_token, reason);
  }

  /**
   * Forget the lease without releasing it.
   *
   * Used once the backend has already cleared it -- raising an exception or
   * completing a run drops the lease server side, so a release call would only
   * fail.
   */
  forget(): void {
    this.stopHeartbeat();
    this.current = null;
  }

  private async safeRelease(
    runId: string,
    leaseToken: string,
    reason: ReleaseReason,
  ): Promise<void> {
    try {
      await this.client.releaseClaim(runId, leaseToken, reason);
    } catch {
      // Releasing is best effort: if it fails the lease simply expires and the
      // backend requeues the run. Never retry in a loop.
    }
  }
}
