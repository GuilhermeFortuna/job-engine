import type { AdapterContext, FormAdapter } from "../adapters/contract";
import type { AdapterRegistry } from "../adapters/registry";
import type { ApplicationViewManager } from "../application-view";
import type { DesktopConfig } from "../config";
import { IsolatedWorldSession } from "../forms/isolated-world";
import type { StepOutcome } from "../forms/types";
import { attachResumeToFileInput } from "../forms/upload";
import {
  DesktopRuntimeState,
  INITIAL_RUNTIME_STATE,
  OperationResult,
  RuntimeReasonCode,
} from "../../shared/contracts";
import {
  resumePhaseFor,
  runProgressFrom,
  submitAlreadyAttempted,
} from "./checkpoints";
import { EvidenceRecorder } from "./evidence";
import { LeaseManager } from "./lease";
import {
  enforceRedaction,
  safeUrl,
  toExceptionFieldReports,
} from "./redaction";
import { MAX_STEPS, StepRunner } from "./runner";
import type { RunnerClient, RunnerRun } from "./runner-client";

export interface RuntimeCoordinatorDeps {
  config: DesktopConfig;
  viewManager: ApplicationViewManager;
  client: RunnerClient;
  leaseManager: LeaseManager;
  adapterRegistry: AdapterRegistry;
}

interface QueuedOpen {
  runId: string;
  applicationUrl: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a URL points at this machine.
 *
 * Only the local fixture servers are loopback, so this marks the one case
 * where the backend-named adapter may stand in for a host match. Parsed with
 * `URL` and compared by exact hostname, never by substring: a public host that
 * merely contains "localhost" is not local.
 */
function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

export class RuntimeCoordinator {
  private runtimeState: DesktopRuntimeState = { ...INITIAL_RUNTIME_STATE };
  private readonly stateListeners = new Set<
    (state: DesktopRuntimeState) => void
  >();
  private readonly queue: QueuedOpen[] = [];
  private busy = false;
  private disposed = false;
  private activeSession: IsolatedWorldSession | null = null;
  private activeAdapter: FormAdapter | null = null;
  private activeContext: AdapterContext | null = null;
  private resumeBytes: Buffer | null = null;
  private unsubscribeLifecycle: (() => void) | null = null;

  constructor(private readonly deps: RuntimeCoordinatorDeps) {
    this.unsubscribeLifecycle = deps.viewManager.onViewLifecycle((event) =>
      this.onViewLifecycle(event),
    );
  }

  subscribeState(
    listener: (state: DesktopRuntimeState) => void,
  ): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): DesktopRuntimeState {
    return { ...this.runtimeState };
  }

  private publish(
    patch: Partial<DesktopRuntimeState>,
  ): void {
    this.runtimeState = {
      ...this.runtimeState,
      ...patch,
      reasonCode:
        patch.reasonCode === undefined
          ? this.runtimeState.reasonCode
          : patch.reasonCode,
    };
    void enforceRedaction({
      phase: this.runtimeState.phase,
      status: this.runtimeState.status,
      reason: this.runtimeState.reasonCode,
    });
    for (const listener of this.stateListeners) {
      try {
        listener(this.getState());
      } catch {
        // Ignore listener errors.
      }
    }
  }

  async openRun(
    runId: string,
    applicationUrl: string,
  ): Promise<OperationResult> {
    if (this.disposed) {
      return { success: false, error: "Runtime is disposing" };
    }

    this.deps.leaseManager.allowRetry(runId);

    if (this.deps.viewManager.isReplacementBlocked()) {
      this.publish({
        runId,
        phase: "paused",
        reasonCode: "VIEW_LOCKED_SUBMITTING",
      });
      return {
        success: false,
        error: "Active submitting run cannot be replaced before receipt reconciliation",
      };
    }

    if (this.busy) {
      if (this.runtimeState.runId === runId) {
        return { success: true };
      }
      if (!this.queue.some((item) => item.runId === runId)) {
        this.queue.push({ runId, applicationUrl });
      }
      this.publish({ runId, phase: "queued", reasonCode: null });
      return { success: true };
    }

    return this.drive(runId, applicationUrl);
  }

  async closeActive(reason: RuntimeReasonCode = null): Promise<OperationResult> {
    await this.settleActive("runtime_unavailable");
    this.deps.viewManager.setReplacementBlocked(false);
    const closed = this.deps.viewManager.closeApplication();
    this.publish({
      ...INITIAL_RUNTIME_STATE,
      reasonCode: reason,
    });
    await this.dequeueIfIdle();
    return closed;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.queue.length = 0;
    await this.settleActive("runtime_unavailable");
    this.deps.viewManager.setReplacementBlocked(false);
    this.deps.viewManager.closeApplication();
    this.unsubscribeLifecycle?.();
    this.unsubscribeLifecycle = null;
    this.publish({ ...INITIAL_RUNTIME_STATE });
  }

  private async onViewLifecycle(event: {
    type: string;
    runId: string;
  }): Promise<void> {
    if (event.type === "crashed") {
      await this.handleCrash(event.runId);
    }
  }

  private async handleCrash(runId: string): Promise<void> {
    const leaseToken = this.deps.leaseManager.leaseToken;
    const submitting = this.deps.viewManager.isReplacementBlocked();
    if (leaseToken && submitting) {
      try {
        await this.deps.client.complete(runId, leaseToken, {
          terminalStatus: "submission_unknown",
          terminalReason: "renderer_crashed_after_submit_attempt",
          receipt: null,
        });
      } catch {
        // Best effort; the backend retains submit_attempted_at.
      }
      this.deps.leaseManager.forget();
    } else {
      await this.settleActive("runtime_unavailable");
    }
    this.deps.viewManager.setReplacementBlocked(false);
    this.publish({
      runId,
      phase: "paused",
      reasonCode: "RENDERER_CRASHED",
    });
    this.busy = false;
  }

  private async settleActive(
    releaseReason: "runtime_unavailable" | "run_not_selected",
  ): Promise<void> {
    const leaseToken = this.deps.leaseManager.leaseToken;
    if (leaseToken && this.runtimeState.runId) {
      try {
        const evidence = new EvidenceRecorder(
          this.deps.client,
          this.runtimeState.runId,
          this.deps.leaseManager.lease?.run.attempt_count ?? 1,
        );
        evidence.record("runtime_settled", { reason: releaseReason });
        await evidence.flushLog(leaseToken);
      } catch {
        // Evidence flush is best effort during teardown.
      }
      await this.deps.leaseManager.release(releaseReason);
    } else {
      this.deps.leaseManager.forget();
    }
    this.activeSession?.dispose();
    this.activeSession = null;
    this.activeAdapter = null;
    this.activeContext = null;
    this.resumeBytes = null;
    this.busy = false;
  }

  private async dequeueIfIdle(): Promise<void> {
    if (this.busy || this.disposed || this.deps.viewManager.isReplacementBlocked()) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    await this.drive(next.runId, next.applicationUrl);
  }

  private async drive(
    runId: string,
    applicationUrl: string,
  ): Promise<OperationResult> {
    this.busy = true;
    this.publish({
      runId,
      phase: "claiming",
      reasonCode: null,
      blockingFieldCount: 0,
      adapterId: null,
    });

    const opened = await this.deps.viewManager.openApplication(
      runId,
      applicationUrl,
    );
    if (!opened.success) {
      this.busy = false;
      this.publish({
        runId,
        phase: "paused",
        reasonCode: "CLAIM_REFUSED",
      });
      await this.dequeueIfIdle();
      return opened;
    }

    await wait(400);
    const view = this.deps.viewManager.getActiveView();
    if (!view || view.webContents.isDestroyed()) {
      this.busy = false;
      return { success: false, error: "Embedded view is not available" };
    }

    const visibleUrl = view.webContents.getURL();
    if (safeUrl(visibleUrl) !== safeUrl(applicationUrl)) {
      this.publish({
        runId,
        phase: "paused",
        reasonCode: "URL_MISMATCH",
      });
      this.busy = false;
      this.deps.viewManager.closeApplication();
      await this.dequeueIfIdle();
      return { success: false, error: "Visible URL does not match the resolved run" };
    }

    const outcome = await this.deps.leaseManager.claimFor(runId);
    if (outcome.claim === null) {
      const reasonCode: RuntimeReasonCode =
        outcome.refusal === "UNAUTHORIZED_FULL_AUTO"
          ? "UNAUTHORIZED_FULL_AUTO"
          : outcome.refusal === "UNSUPPORTED_AUTOMATION_MODE"
            ? "UNSUPPORTED_AUTOMATION_MODE"
            : "CLAIM_REFUSED";
      this.publish({ runId, phase: "paused", reasonCode });
      this.busy = false;
      this.deps.viewManager.closeApplication();
      await this.dequeueIfIdle();
      return { success: false, error: `Run is not claimable: ${outcome.refusal}` };
    }

    const claim = outcome.claim;
    this.deps.leaseManager.startHeartbeat();
    this.publish({
      runId,
      phase: "filling",
      status: claim.run.status,
      checkpoint: claim.run.current_checkpoint ?? null,
      automationMode: claim.run.automation_mode,
      adapterId: claim.run.platform_adapter_id,
    });

    const adapter = this.selectAdapter(claim.run, visibleUrl);
    if (adapter === null) {
      await this.raiseAndPause(
        runId,
        "step_error",
        { detail: "No adapter could drive this page" },
        "ADAPTER_UNAVAILABLE",
      );
      return { success: false, error: "No adapter available for this application" };
    }
    this.activeAdapter = adapter;
    this.publish({ adapterId: adapter.adapterId });

    const session = new IsolatedWorldSession(view.webContents.debugger);
    await session.attach();
    this.activeSession = session;

    let resumeBytes: Buffer | null = null;
    const loadResume = async (): Promise<Buffer> => {
      if (resumeBytes === null) {
        const fetched = await this.deps.client.fetchResume(
          runId,
          claim.grant_token,
          claim.run.resume_sha256,
        );
        resumeBytes = fetched.bytes;
        this.resumeBytes = resumeBytes;
      }
      return resumeBytes;
    };

    const context: AdapterContext = {
      callInIsolatedWorld: (args) => session.call(args),
      currentUrl: () => this.logicalUrl(adapter, claim.run, view.webContents.getURL()),
      waitForStable: () => wait(150),
      attachResume: async (semanticKey) => {
        const bytes = await loadResume();
        const result = await attachResumeToFileInput({
          session,
          semanticKey,
          bytes,
        });
        return { attached: result.attached };
      },
    };
    this.activeContext = context;

    const detected = await adapter.detect(context);
    if (!detected) {
      await this.raiseAndPause(
        runId,
        "step_error",
        { detail: "Adapter could not detect an application form" },
        "ADAPTER_UNAVAILABLE",
      );
      return { success: false, error: "Application form was not detected" };
    }

    const evidence = new EvidenceRecorder(
      this.deps.client,
      runId,
      claim.run.attempt_count,
    );
    const runner = new StepRunner(
      {
        client: this.deps.client,
        lease: this.deps.leaseManager,
        adapter,
        context,
        evidence,
        loadResume,
      },
      runId,
    );
    runner.setCheckpointFrom(claim.run);

    try {
      await this.execute(runId, claim.run, runner, evidence, adapter, context);
    } catch (error) {
      evidence.record("runtime_error", {
        detail: error instanceof Error ? error.message : "unknown",
      });
      await this.raiseAndPause(
        runId,
        "step_error",
        { detail: "Runtime error while driving the form" },
        "NEEDS_INPUT",
        evidence,
      );
    }

    return { success: true };
  }

  /**
   * Choose the adapter for the page that is actually on screen.
   *
   * The visible URL decides. It has already been checked against the run the
   * backend resolved, so a platform match here is the page the owner opened.
   *
   * Two fallbacks follow, in order of how much they trust the page. The frozen
   * canonical URL is consulted first: it is the real posting address, so
   * resolving it is still a URL decision. Only a loopback page -- the local
   * HTTPS fixture servers, which no platform adapter can match on host -- falls
   * back to the adapter the backend named. Letting the named adapter win on a
   * public host would drive platform selectors against a page that never
   * matched them.
   */
  private selectAdapter(run: RunnerRun, visibleUrl: string): FormAdapter | null {
    const { adapterRegistry } = this.deps;
    const visible = adapterRegistry.resolve(visibleUrl);
    if (visible && visible.adapterId !== "generic") {
      return visible;
    }
    const canonical = run.canonical_application_url
      ? adapterRegistry.resolve(run.canonical_application_url)
      : null;
    if (canonical && canonical.adapterId !== "generic") {
      return canonical;
    }
    if (isLoopbackUrl(visibleUrl)) {
      const named = adapterRegistry.adapterById(run.platform_adapter_id);
      if (named) {
        return named;
      }
    }
    return canonical ?? visible;
  }

  private logicalUrl(
    adapter: FormAdapter,
    run: RunnerRun,
    visibleUrl: string,
  ): URL {
    try {
      const visible = new URL(visibleUrl);
      if (adapter.matches(visible)) {
        return visible;
      }
    } catch {
      // Fall through to the frozen canonical URL.
    }
    const candidate = run.canonical_application_url ?? run.application_url;
    try {
      const canonical = new URL(candidate);
      if (adapter.matches(canonical)) {
        return canonical;
      }
    } catch {
      // Fall through.
    }
    return new URL(visibleUrl);
  }

  private async execute(
    runId: string,
    claimed: RunnerRun,
    runner: StepRunner,
    evidence: EvidenceRecorder,
    adapter: FormAdapter,
    context: AdapterContext,
  ): Promise<void> {
    const phase = resumePhaseFor(runProgressFrom(claimed));
    if (phase === "reconcile_submit") {
      await this.reconcileSubmit(runId, evidence, adapter, context);
      return;
    }
    if (phase === "submit") {
      await this.submitOnce(runId, evidence, adapter, context);
      return;
    }

    for (let step = 0; step < MAX_STEPS; step += 1) {
      if (this.deps.leaseManager.heartbeatError) {
        this.publish({ runId, phase: "paused", reasonCode: "LEASE_LOST" });
        await this.settleActive("runtime_unavailable");
        this.deps.viewManager.closeApplication();
        await this.dequeueIfIdle();
        return;
      }

      const result = await runner.runStep();
      this.publish({
        runId,
        phase: "filling",
        blockingFieldCount: result.fields.length,
        checkpoint: this.deps.leaseManager.lease?.run.current_checkpoint ?? null,
      });

      if (result.outcome === "PROGRESSED") {
        await context.waitForStable();
        continue;
      }

      if (result.outcome === "READY_FOR_REVIEW") {
        await this.handleReadyForReview(
          runId,
          claimed,
          evidence,
          adapter,
          context,
        );
        return;
      }

      await this.mapOutcome(runId, result.outcome, result.fields, evidence);
      return;
    }

    await this.raiseAndPause(
      runId,
      "step_error",
      { detail: "Step loop exhausted without reaching review" },
      "STEP_EXHAUSTED",
      evidence,
    );
  }

  private async handleReadyForReview(
    runId: string,
    claimed: RunnerRun,
    evidence: EvidenceRecorder,
    adapter: FormAdapter,
    context: AdapterContext,
  ): Promise<void> {
    const leaseToken = this.deps.leaseManager.leaseToken;
    if (leaseToken === null) {
      await this.raiseAndPause(
        runId,
        "step_error",
        { detail: "Lease lost before review" },
        "LEASE_LOST",
        evidence,
      );
      return;
    }

    await this.deps.client.checkpoint(
      runId,
      leaseToken,
      "submit_armed",
      "Ready for review",
    );

    const authorizedFullAuto =
      claimed.automation_mode === "full_auto" &&
      claimed.automatic_submission_authorized === true;

    if (authorizedFullAuto) {
      await this.submitOnce(runId, evidence, adapter, context);
      return;
    }

    await this.deps.client.raiseException(runId, leaseToken, "semi_auto_armed", {
      step: "review",
    });
    try {
      await evidence.flushLog(leaseToken);
    } catch {
      // Lease may already be cleared by the exception.
    }
    this.deps.leaseManager.forget();
    this.activeSession?.dispose();
    this.activeSession = null;
    this.deps.viewManager.setReplacementBlocked(false);
    this.deps.viewManager.closeApplication();
    this.busy = false;
    this.queue.splice(
      0,
      this.queue.length,
      ...this.queue.filter((item) => item.runId !== runId),
    );
    this.publish({
      runId,
      phase: "armed",
      status: "needs_input",
      checkpoint: "submit_armed",
      reasonCode: null,
    });
    await this.dequeueIfIdle();
  }

  private async submitOnce(
    runId: string,
    evidence: EvidenceRecorder,
    adapter: FormAdapter,
    context: AdapterContext,
  ): Promise<void> {
    const leaseToken = this.deps.leaseManager.leaseToken;
    if (leaseToken === null) {
      await this.raiseAndPause(
        runId,
        "step_error",
        { detail: "Lease lost before submit" },
        "LEASE_LOST",
        evidence,
      );
      return;
    }

    const latest = await this.deps.client.getRun(runId);
    if (submitAlreadyAttempted(runProgressFrom(latest))) {
      await this.reconcileSubmit(runId, evidence, adapter, context);
      return;
    }

    this.deps.viewManager.setReplacementBlocked(true);
    this.publish({ runId, phase: "submitting", checkpoint: "submitting" });
    await this.deps.client.checkpoint(
      runId,
      leaseToken,
      "submitting",
      "Activating submit",
    );

    const observation = await adapter.observeStep(context);
    const activated = await adapter.submitAfterRelease(context, observation);
    await context.waitForStable();

    if (!activated.activated) {
      await this.finishTerminal(
        runId,
        leaseToken,
        evidence,
        adapter,
        context,
        "submission_unknown",
      );
      return;
    }

    await this.finishTerminal(
      runId,
      leaseToken,
      evidence,
      adapter,
      context,
      null,
    );
  }

  private async reconcileSubmit(
    runId: string,
    evidence: EvidenceRecorder,
    adapter: FormAdapter,
    context: AdapterContext,
  ): Promise<void> {
    const leaseToken = this.deps.leaseManager.leaseToken;
    if (leaseToken === null) {
      this.publish({ runId, phase: "terminal", reasonCode: "SUBMISSION_UNKNOWN" });
      this.busy = false;
      return;
    }
    this.deps.viewManager.setReplacementBlocked(true);
    await this.finishTerminal(
      runId,
      leaseToken,
      evidence,
      adapter,
      context,
      "submission_unknown",
    );
  }

  private async finishTerminal(
    runId: string,
    leaseToken: string,
    evidence: EvidenceRecorder,
    adapter: FormAdapter,
    context: AdapterContext,
    forcedStatus: "submission_unknown" | null,
  ): Promise<void> {
    const receipt = await adapter.captureReceipt(context);
    let terminalStatus: string;
    let receiptPayload: Record<string, unknown> | null = null;
    if (forcedStatus === "submission_unknown" || receipt === null) {
      terminalStatus = "submission_unknown";
    } else {
      const stored = await evidence.recordReceipt(leaseToken, receipt);
      terminalStatus = "submitted";
      receiptPayload = {
        platform_adapter_id: adapter.adapterId,
        final_url: receipt.finalUrl,
        platform_receipt_id: receipt.platformReceiptId,
        confirmation_signal: receipt.confirmationSignal,
        capture_timestamp: new Date().toISOString(),
        artifact_hash: stored.sha256,
        summary_notes: receipt.summaryNotes,
      };
    }

    try {
      await evidence.flushLog(leaseToken);
    } catch {
      // Completion still proceeds; the receipt is the required artifact.
    }

    await this.deps.client.complete(runId, leaseToken, {
      terminalStatus,
      terminalReason: terminalStatus === "submission_unknown" ? "ambiguous_receipt" : null,
      receipt: receiptPayload,
    });
    this.deps.leaseManager.forget();
    this.deps.viewManager.setReplacementBlocked(false);
    this.activeSession?.dispose();
    this.activeSession = null;
    this.busy = false;
    this.publish({
      runId,
      phase: "terminal",
      status: terminalStatus,
      checkpoint: terminalStatus === "submitted" ? "submitted" : "submitting",
      reasonCode: terminalStatus === "submission_unknown" ? "SUBMISSION_UNKNOWN" : null,
    });
    this.deps.viewManager.closeApplication();
    await this.dequeueIfIdle();
  }

  private async mapOutcome(
    runId: string,
    outcome: StepOutcome,
    fields: Parameters<typeof toExceptionFieldReports>[0],
    evidence: EvidenceRecorder,
  ): Promise<void> {
    switch (outcome) {
      case "CAPTCHA":
        await this.raiseAndPause(
          runId,
          "captcha_required",
          { fields: toExceptionFieldReports(fields) },
          "CAPTCHA_REQUIRED",
          evidence,
        );
        return;
      case "NEEDS_AUTH":
        await this.raiseAndPause(
          runId,
          "auth_required",
          { fields: toExceptionFieldReports(fields) },
          "AUTH_REQUIRED",
          evidence,
        );
        return;
      case "NEEDS_ANSWERS":
        await this.raiseAndPause(
          runId,
          "unresolved_question",
          { fields: toExceptionFieldReports(fields) },
          "NEEDS_INPUT",
          evidence,
        );
        return;
      case "UNSUPPORTED":
        await this.raiseAndPause(
          runId,
          "step_error",
          { fields: toExceptionFieldReports(fields) },
          "UNSUPPORTED_CONTROL",
          evidence,
        );
        return;
      case "FAILED_RETRYABLE":
        await this.raiseAndPause(
          runId,
          "step_error",
          { detail: "Retryable step failure" },
          "STEP_RETRYABLE",
          evidence,
        );
        return;
      case "FAILED_FINAL": {
        const leaseToken = this.deps.leaseManager.leaseToken;
        if (leaseToken) {
          await evidence.flushLog(leaseToken).catch(() => undefined);
          await this.deps.client.complete(runId, leaseToken, {
            terminalStatus: "failed_final",
            terminalReason: "final_step_failure",
            receipt: null,
          });
          this.deps.leaseManager.forget();
        }
        this.busy = false;
        this.publish({ runId, phase: "terminal", status: "failed_final" });
        this.deps.viewManager.closeApplication();
        await this.dequeueIfIdle();
        return;
      }
      case "PROGRESSED":
      case "READY_FOR_REVIEW":
      case "SUBMITTED":
      case "SUBMISSION_UNKNOWN":
        return;
      default: {
        const exhaustive: never = outcome;
        throw new Error(`Unhandled step outcome: ${String(exhaustive)}`);
      }
    }
  }

  private async raiseAndPause(
    runId: string,
    exceptionType: string,
    contextPayload: Record<string, unknown>,
    reasonCode: RuntimeReasonCode,
    evidence?: EvidenceRecorder,
  ): Promise<void> {
    const leaseToken = this.deps.leaseManager.leaseToken;
    if (leaseToken && evidence) {
      try {
        await evidence.flushLog(leaseToken);
      } catch {
        // Exception still records the pause.
      }
    }
    if (leaseToken) {
      await this.deps.client.raiseException(
        runId,
        leaseToken,
        exceptionType,
        contextPayload,
      );
      this.deps.leaseManager.forget();
    }
    this.activeSession?.dispose();
    this.activeSession = null;
    this.busy = false;
    this.deps.viewManager.setReplacementBlocked(false);
    this.deps.viewManager.closeApplication();
    this.publish({
      runId,
      phase: "paused",
      reasonCode,
      status:
        reasonCode === "CAPTCHA_REQUIRED" || reasonCode === "AUTH_REQUIRED"
          ? "paused_auth"
          : "needs_input",
    });
    await this.dequeueIfIdle();
  }
}
