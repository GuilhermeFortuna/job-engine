import { describe, expect, it, vi } from "vitest";

import { createDefaultAdapterRegistry } from "../../src/main/adapters/registry";
import type {
  ApplicationViewManager,
  ViewLifecycleEvent,
  ViewLifecycleListener,
} from "../../src/main/application-view";
import type { DesktopConfig } from "../../src/main/config";
import { RuntimeCoordinator } from "../../src/main/runtime/coordinator";
import { LeaseManager } from "../../src/main/runtime/lease";
import type { ClaimResponse, RunnerClient } from "../../src/main/runtime/runner-client";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_URL = "https://jobs.example.test/apply";

function mockView(
  url: string,
): NonNullable<ReturnType<ApplicationViewManager["getActiveView"]>> {
  return {
    webContents: {
      isDestroyed: () => false,
      getURL: () => url,
    },
  } as unknown as NonNullable<ReturnType<ApplicationViewManager["getActiveView"]>>;
}

function mockViewManager(
  overrides: Partial<ApplicationViewManager> = {},
): ApplicationViewManager {
  return {
    isReplacementBlocked: () => false,
    setReplacementBlocked: vi.fn(),
    openApplication: vi.fn(async () => ({ success: true })),
    closeApplication: vi.fn(() => ({ success: true })),
    onViewLifecycle: () => () => undefined,
    getActiveView: () => mockView(APPLICATION_URL),
    getCurrentRunId: () => RUN_ID,
    ...overrides,
  } as unknown as ApplicationViewManager;
}

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
      application_url: APPLICATION_URL,
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
    complete: vi.fn(async () => undefined),
    checkpoint: vi.fn(async () => undefined),
    raiseException: vi.fn(async () => undefined),
    getRun: vi.fn(async () => makeClaim().run),
    ...overrides,
  } as unknown as RunnerClient;
}

function coordinatorOf(
  viewManager: ApplicationViewManager,
  client: RunnerClient,
): RuntimeCoordinator {
  return new RuntimeCoordinator({
    config: { apiBaseUrl: "http://127.0.0.1:8000" } as DesktopConfig,
    viewManager,
    client,
    leaseManager: new LeaseManager(client),
    adapterRegistry: createDefaultAdapterRegistry(),
  });
}

describe("RuntimeCoordinator admission", () => {
  it("refuses to replace a submitting run", async () => {
    const viewManager = mockViewManager({
      isReplacementBlocked: () => true,
    });
    const client = makeClient();
    const coordinator = coordinatorOf(viewManager, client);

    const result = await coordinator.openRun(RUN_ID, APPLICATION_URL);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/submitting run cannot be replaced/i);
    expect(coordinator.getState().reasonCode).toBe("VIEW_LOCKED_SUBMITTING");
    expect(client.claim).not.toHaveBeenCalled();
  });

  it("refuses when the visible URL does not match the resolved run", async () => {
    const viewManager = mockViewManager({
      getActiveView: () => mockView("https://jobs.example.test/other"),
    });
    const client = makeClient();
    const coordinator = coordinatorOf(viewManager, client);

    const result = await coordinator.openRun(RUN_ID, APPLICATION_URL);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not match/i);
    expect(coordinator.getState().reasonCode).toBe("URL_MISMATCH");
    expect(client.claim).not.toHaveBeenCalled();
    expect(viewManager.closeApplication).toHaveBeenCalled();
  });

  it("surfaces unauthorized full-auto instead of claiming it", async () => {
    const client = makeClient({
      claim: vi.fn(async () =>
        makeClaim({
          automation_mode: "full_auto",
          automatic_submission_authorized: false,
        }),
      ),
    });
    const coordinator = coordinatorOf(mockViewManager(), client);

    const result = await coordinator.openRun(RUN_ID, APPLICATION_URL);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not claimable/i);
    expect(coordinator.getState().reasonCode).toBe("UNAUTHORIZED_FULL_AUTO");
    expect(client.releaseClaim).toHaveBeenCalled();
  });

  it("reconciles crash during submit as submission_unknown", async () => {
    const held: { listener: ViewLifecycleListener | null } = { listener: null };
    const viewManager = mockViewManager({
      isReplacementBlocked: () => true,
      onViewLifecycle: (next) => {
        held.listener = next;
        return () => undefined;
      },
    });
    const client = makeClient();
    const leaseManager = new LeaseManager(client);
    const coordinator = new RuntimeCoordinator({
      config: { apiBaseUrl: "http://127.0.0.1:8000" } as DesktopConfig,
      viewManager,
      client,
      leaseManager,
      adapterRegistry: createDefaultAdapterRegistry(),
    });

    await leaseManager.claimFor(RUN_ID);
    const event: ViewLifecycleEvent = { type: "crashed", runId: RUN_ID };
    await held.listener?.(event);

    expect(client.complete).toHaveBeenCalledWith(
      RUN_ID,
      "lease-token",
      expect.objectContaining({ terminalStatus: "submission_unknown" }),
    );
    expect(coordinator.getState().reasonCode).toBe("RENDERER_CRASHED");
  });
});

describe("RuntimeCoordinator adapter selection", () => {
  function selectFor(
    run: Partial<ClaimResponse["run"]>,
    visibleUrl: string,
  ): string | null {
    const coordinator = coordinatorOf(mockViewManager(), makeClient());
    const select = (
      coordinator as unknown as {
        selectAdapter: (
          run: ClaimResponse["run"],
          visibleUrl: string,
        ) => { adapterId: string } | null;
      }
    ).selectAdapter.bind(coordinator);
    return select(makeClaim(run).run, visibleUrl)?.adapterId ?? null;
  }

  it("binds the platform adapter the visible host matches", () => {
    expect(
      selectFor(
        { platform_adapter_id: "generic" },
        "https://boards.greenhouse.io/acme/jobs/1",
      ),
    ).toBe("greenhouse");
  });

  it("falls back to the frozen canonical URL before the named adapter", () => {
    expect(
      selectFor(
        {
          platform_adapter_id: "lever",
          canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
        },
        "https://unknown.example.test/apply",
      ),
    ).toBe("greenhouse");
  });

  it("accepts the backend-named adapter only for a loopback page", () => {
    expect(
      selectFor({ platform_adapter_id: "greenhouse" }, "https://127.0.0.1:8443/greenhouse/standard"),
    ).toBe("greenhouse");
  });

  it("never lets the named adapter override a public non-matching host", () => {
    // A backend row naming greenhouse must not drive greenhouse selectors
    // against a page whose host no platform adapter matches.
    expect(
      selectFor(
        { platform_adapter_id: "greenhouse" },
        "https://careers.unknown.example.test/apply",
      ),
    ).toBe("generic");
  });
});
