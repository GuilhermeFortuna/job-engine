import { describe, expect, it, vi } from "vitest";

import { LeaseManager, type LeaseTimers } from "../../src/main/runtime/lease";
import type { ClaimResponse, RunnerClient } from "../../src/main/runtime/runner-client";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

function makeClaim(overrides: Partial<ClaimResponse["run"]> = {}): ClaimResponse {
  return {
    run: {
      id: RUN_ID,
      automation_mode: "semi_auto_pause_before_submit",
      status: "claimed",
      current_checkpoint: null,
      submit_attempted_at: null,
      attempt_count: 1,
      platform_adapter_id: "generic",
      application_url: "https://jobs.example.com/apply",
      resume_sha256: "a".repeat(64),
      automatic_submission_authorized: false,
      automatic_submission_authorized_at: null,
      ...overrides,
    },
    lease_token: "lease-token",
    grant_token: "grant-token",
    lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

function makeClient(overrides: Partial<RunnerClient> = {}): RunnerClient {
  return {
    claim: vi.fn(async () => makeClaim()),
    releaseClaim: vi.fn(async () => undefined),
    heartbeat: vi.fn(async () => makeClaim().run),
    ...overrides,
  } as unknown as RunnerClient;
}

/** Timers we drive by hand, so heartbeat behavior is deterministic. */
function manualTimers(): LeaseTimers & { fire(): Promise<void>; active: boolean } {
  let handler: (() => void) | null = null;
  return {
    setInterval(fn) {
      handler = fn;
      return 1;
    },
    clearInterval() {
      handler = null;
    },
    get active() {
      return handler !== null;
    },
    async fire() {
      handler?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("targeted claiming", () => {
  it("claims the run the owner opened", async () => {
    const client = makeClient();
    const manager = new LeaseManager(client);
    const outcome = await manager.claimFor(RUN_ID);

    expect(client.claim).toHaveBeenCalledWith(RUN_ID);
    expect(outcome.refusal).toBeNull();
    expect(manager.leaseToken).toBe("lease-token");
  });

  it("reports a run that is not claimable without releasing anything", async () => {
    const client = makeClient({ claim: vi.fn(async () => null) });
    const manager = new LeaseManager(client);
    const outcome = await manager.claimFor(RUN_ID);

    expect(outcome.refusal).toBe("NOT_CLAIMABLE");
    expect(client.releaseClaim).not.toHaveBeenCalled();
    expect(manager.lease).toBeNull();
  });
});

describe("unsupported automation mode", () => {
  it("hands an unauthorized full_auto run straight back and never executes it", async () => {
    const client = makeClient({
      claim: vi.fn(async () => makeClaim({ automation_mode: "full_auto" })),
    });
    const manager = new LeaseManager(client);
    const outcome = await manager.claimFor(RUN_ID);

    expect(outcome.claim).toBeNull();
    expect(outcome.refusal).toBe("UNAUTHORIZED_FULL_AUTO");
    expect(client.releaseClaim).toHaveBeenCalledWith(
      RUN_ID,
      "lease-token",
      "unsupported_automation_mode",
    );
    expect(manager.lease).toBeNull();
  });

  it("claims an authorized full_auto run", async () => {
    const client = makeClient({
      claim: vi.fn(async () =>
        makeClaim({
          automation_mode: "full_auto",
          automatic_submission_authorized: true,
          automatic_submission_authorized_at: "2026-08-19T00:00:00Z",
        }),
      ),
    });
    const manager = new LeaseManager(client);
    const outcome = await manager.claimFor(RUN_ID);

    expect(outcome.refusal).toBeNull();
    expect(outcome.claim?.run.automation_mode).toBe("full_auto");
    expect(client.releaseClaim).not.toHaveBeenCalled();
  });

  it("refuses a rejected run again without re-claiming it", async () => {
    const client = makeClient({
      claim: vi.fn(async () => makeClaim({ automation_mode: "full_auto" })),
    });
    const manager = new LeaseManager(client);

    await manager.claimFor(RUN_ID);
    const second = await manager.claimFor(RUN_ID);
    const third = await manager.claimFor(RUN_ID);

    // Exactly one claim and one release, no matter how often it is retried.
    expect(client.claim).toHaveBeenCalledTimes(1);
    expect(client.releaseClaim).toHaveBeenCalledTimes(1);
    expect(second.refusal).toBe("PREVIOUSLY_REFUSED");
    expect(third.refusal).toBe("PREVIOUSLY_REFUSED");
  });

  it("lets an explicit owner action try the run again", async () => {
    const client = makeClient({
      claim: vi.fn(async () => makeClaim({ automation_mode: "full_auto" })),
    });
    const manager = new LeaseManager(client);

    await manager.claimFor(RUN_ID);
    manager.allowRetry(RUN_ID);
    await manager.claimFor(RUN_ID);

    expect(client.claim).toHaveBeenCalledTimes(2);
  });

  it("keeps going when the release call itself fails", async () => {
    const client = makeClient({
      claim: vi.fn(async () => makeClaim({ automation_mode: "full_auto" })),
      releaseClaim: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    const manager = new LeaseManager(client);
    const outcome = await manager.claimFor(RUN_ID);

    // The lease simply expires; refusing must not throw or retry.
    expect(outcome.refusal).toBe("UNAUTHORIZED_FULL_AUTO");
    expect(manager.hasRefused(RUN_ID)).toBe(true);
  });

  it("hands back a run that does not match the requested id", async () => {
    const client = makeClient({
      claim: vi.fn(async () => makeClaim({ id: "some-other-run" })),
    });
    const manager = new LeaseManager(client);
    const outcome = await manager.claimFor(RUN_ID);

    expect(outcome.refusal).toBe("NOT_CLAIMABLE");
    expect(client.releaseClaim).toHaveBeenCalledWith(
      "some-other-run",
      "lease-token",
      "run_not_selected",
    );
  });
});

describe("heartbeat", () => {
  it("beats while the lease is held", async () => {
    const client = makeClient();
    const timers = manualTimers();
    const manager = new LeaseManager(client, timers);

    await manager.claimFor(RUN_ID);
    manager.startHeartbeat();
    await timers.fire();

    expect(client.heartbeat).toHaveBeenCalledWith(RUN_ID, "lease-token");
  });

  it("does not beat without a lease", async () => {
    const timers = manualTimers();
    const manager = new LeaseManager(makeClient(), timers);
    manager.startHeartbeat();
    expect(timers.active).toBe(false);
  });

  it("stops beating once the lease is lost rather than retrying", async () => {
    const client = makeClient({
      heartbeat: vi.fn(async () => {
        throw new Error("401 lease expired");
      }),
    });
    const timers = manualTimers();
    const manager = new LeaseManager(client, timers);

    await manager.claimFor(RUN_ID);
    manager.startHeartbeat();
    await timers.fire();

    expect(timers.active).toBe(false);
    expect(manager.heartbeatError?.message).toContain("401");
  });

  it("starts only one heartbeat", async () => {
    const timers = manualTimers();
    const spy = vi.spyOn(timers, "setInterval");
    const manager = new LeaseManager(makeClient(), timers);

    await manager.claimFor(RUN_ID);
    manager.startHeartbeat();
    manager.startHeartbeat();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("release and forget", () => {
  it("releases the lease and stops beating", async () => {
    const client = makeClient();
    const timers = manualTimers();
    const manager = new LeaseManager(client, timers);

    await manager.claimFor(RUN_ID);
    manager.startHeartbeat();
    await manager.release("runtime_unavailable");

    expect(client.releaseClaim).toHaveBeenCalledWith(
      RUN_ID,
      "lease-token",
      "runtime_unavailable",
    );
    expect(manager.lease).toBeNull();
    expect(timers.active).toBe(false);
  });

  it("releasing without a lease is a no-op", async () => {
    const client = makeClient();
    const manager = new LeaseManager(client);
    await manager.release("runtime_unavailable");
    expect(client.releaseClaim).not.toHaveBeenCalled();
  });

  it("forget drops a lease the backend already cleared", async () => {
    const client = makeClient();
    const timers = manualTimers();
    const manager = new LeaseManager(client, timers);

    await manager.claimFor(RUN_ID);
    manager.startHeartbeat();
    manager.forget();

    // Raising an exception already cleared it server side; calling release
    // would only fail.
    expect(client.releaseClaim).not.toHaveBeenCalled();
    expect(manager.lease).toBeNull();
    expect(timers.active).toBe(false);
  });
});
