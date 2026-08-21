"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJobDetail } from "@/features/jobs/api";
import type { JobDetail } from "@/features/jobs/types";
import {
  ApiError,
  cancelApplicationRun,
  fetchApplicationRunDetail,
  fetchResumes,
  releaseSubmit,
  resolveExceptionAnswers,
  resumeApplicationRun,
  streamApplicationRunEvents,
} from "../api";
import {
  INITIAL_BROWSER_STATE,
  closeApplicationView,
  getCapabilities,
  goBack,
  goForward,
  isSupportedWorkspaceSize,
  openApplicationView,
  reloadApplicationView,
  setApplicationBounds,
  subscribeBrowserState,
  type ApplicationBounds,
  type DesktopBrowserState,
  type OperationResult,
} from "../desktop-bridge";
import {
  collectFieldReports,
  isHttpsApplicationUrl,
  latestPendingException,
  requiredFieldsResolved,
  workspacePath,
  type ApplicationRunDetail,
  type ResolveAnswerItem,
  type SafeResume,
} from "../types";
import {
  runtimeReasonText,
  selectDurableRunAction,
  type DurableRunAction,
} from "../projections";
import { useApplicationRuntime } from "../hooks/useApplicationRuntime";
import {
  DESKTOP_OPEN_REQUESTED,
  DESKTOP_OPEN_UNAVAILABLE,
  type LaunchOutcome,
} from "../launch-outcome";
import { ApplicationStatusBar } from "./ApplicationStatusBar";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserViewport } from "./BrowserViewport";
import { ExceptionResolver } from "./ExceptionResolver";
import { FieldReviewPanel } from "./FieldReviewPanel";
import { JobContextPanel } from "./JobContextPanel";
import { SubmissionReceipt } from "./SubmissionReceipt";

const OWNER_SUBMIT_CONFIRMATION = "Submit this application";
const SUBMIT_FAILURE =
  "Submission release failed. Review the application and try again.";
const CANCEL_FAILURE =
  "Cancellation failed. Review the run status and try again.";
const RESOLVE_FAILURE =
  "Answer update failed. Review the answers and try again.";
const RESUME_FAILURE = "Resume failed. Review the run status and try again.";
const POSITION_FAILURE = "Unable to position the desktop application view.";
const OPEN_FAILURE =
  "Unable to open the desktop application view. The run remains available in this workspace.";
const CLOSE_FAILURE = "Unable to close the desktop application view.";
const BACK_FAILURE =
  "Unable to navigate back in the desktop application view.";
const FORWARD_FAILURE =
  "Unable to navigate forward in the desktop application view.";
const RELOAD_FAILURE = "Unable to reload the desktop application view.";

function runRevision(run: ApplicationRunDetail): string {
  return [
    run.id,
    run.status,
    run.current_checkpoint ?? "",
    run.submit_attempted_at ?? "",
    run.updated_at,
  ].join(":");
}

function durableActionFor(
  run: ApplicationRunDetail,
  reasonCode: Parameters<typeof selectDurableRunAction>[1],
): DurableRunAction {
  const selected = selectDurableRunAction(run, reasonCode).action;
  if (selected !== "RELEASE_SUBMIT") {
    return selected;
  }
  const pending = latestPendingException(run.exceptions);
  return pending?.exception_type === "semi_auto_armed" &&
    requiredFieldsResolved(collectFieldReports(run.exceptions))
    ? selected
    : null;
}

export function ApplicationWorkspace({
  runId,
  launchOutcome = null,
}: {
  runId: string;
  launchOutcome?: LaunchOutcome | null;
}) {
  const [run, setRun] = useState<ApplicationRunDetail | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [resume, setResume] = useState<SafeResume | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [supported, setSupported] = useState(true);
  const [bounds, setBounds] = useState<ApplicationBounds | null>(null);
  const [browserState, setBrowserState] = useState<DesktopBrowserState>(INITIAL_BROWSER_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const runtime = useApplicationRuntime(runId);

  const closedRef = useRef(false);
  const openedRef = useRef(false);
  const openingRef = useRef(false);
  const mountedRef = useRef(false);
  const actionLockRef = useRef(false);
  const openAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showActionFailure = useCallback((message: string) => {
    if (mountedRef.current) {
      setActionError(message);
    }
  }, []);

  const runBridgeOperation = useCallback(
    async (
      operation: () => Promise<OperationResult>,
      failureMessage: string,
    ) => {
      if (mountedRef.current) {
        setActionError(null);
      }
      try {
        const result = await operation();
        if (!result.success) {
          showActionFailure(failureMessage);
        }
      } catch {
        showActionFailure(failureMessage);
      }
    },
    [showActionFailure],
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const detail = await fetchApplicationRunDetail(runId, { signal });
    if (detail.id !== runId) {
      throw new ApiError(409, "Mismatched run", detail);
    }
    setRun(detail);
    setLoadError(null);
    return detail;
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    void getCapabilities().then((caps) => {
      if (!cancelled) {
        setDesktopAvailable(caps.embeddedBrowser);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const checkSize = () => {
      setSupported(isSupportedWorkspaceSize(window.innerWidth, window.innerHeight));
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let lastEventId: string | undefined;

    const boot = async () => {
      try {
        const detail = await refresh(controller.signal);
        try {
          const [jobDetail, resumes] = await Promise.all([
            fetchJobDetail(detail.job_group_id, { signal: controller.signal }),
            fetchResumes({ signal: controller.signal }),
          ]);
          if (!controller.signal.aborted) {
            setJob(jobDetail);
            setResume(
              resumes.find((item) => item.id === detail.resume_asset_id) ??
                resumes.find((item) => item.resume_id === detail.policy_snapshot?.resume_id) ??
                null,
            );
          }
        } catch {
          // Job/resume context is supplemental; the run remains usable.
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoadError("Unable to load application workspace.");
        }
        return;
      }

      while (!stopped && !controller.signal.aborted) {
        try {
          lastEventId = await streamApplicationRunEvents({
            runId,
            lastEventId,
            signal: controller.signal,
            onConnected: () => setDisconnected(false),
            onStateChanging: () => {
              void refresh(controller.signal);
            },
          });
          const terminal = ["submitted", "submission_unknown", "failed_final", "cancelled"];
          if (terminal.includes((await fetchApplicationRunDetail(runId, { signal: controller.signal })).status)) {
            break;
          }
        } catch {
          if (controller.signal.aborted || stopped) {
            break;
          }
          setDisconnected(true);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    };

    void boot();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [refresh, runId]);

  const closeOnce = useCallback(() => {
    if (closedRef.current) {
      return;
    }
    closedRef.current = true;
    openedRef.current = false;
    openingRef.current = false;
    openAttemptRef.current = null;
    void runBridgeOperation(closeApplicationView, CLOSE_FAILURE);
  }, [runBridgeOperation]);

  useEffect(() => {
    closedRef.current = false;
    openedRef.current = false;
    return () => {
      closeOnce();
    };
  }, [closeOnce, runId]);

  useEffect(() => {
    if (!supported) {
      closeOnce();
      return;
    }
    closedRef.current = false;
    return subscribeBrowserState(setBrowserState);
  }, [closeOnce, supported]);

  const runtimeReason = runtime.runtimeState
    ? runtimeReasonText(runtime.runtimeState.reasonCode)
    : null;
  const action = run
    ? durableActionFor(run, runtime.runtimeState?.reasonCode ?? null)
    : null;

  const requestDesktopOpen = useCallback(
    async (completedAction?: "resolved" | "released" | "resumed") => {
      const continueFromDesktop = completedAction
        ? `${completedAction} — continue from desktop.`
        : null;
      if (
        !supported ||
        !desktopAvailable ||
        !bounds ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        if (continueFromDesktop) {
          setActionNotice(continueFromDesktop);
        } else {
          showActionFailure(OPEN_FAILURE);
        }
        return false;
      }
      openingRef.current = true;
      let boundsResult: OperationResult;
      try {
        boundsResult = await setApplicationBounds(bounds);
      } catch {
        if (continueFromDesktop) {
          setActionNotice(continueFromDesktop);
        } else {
          showActionFailure(POSITION_FAILURE);
        }
        openingRef.current = false;
        return false;
      }
      if (!boundsResult.success) {
        if (continueFromDesktop) {
          setActionNotice(continueFromDesktop);
        } else {
          showActionFailure(POSITION_FAILURE);
        }
        openingRef.current = false;
        return false;
      }
      try {
        if (closedRef.current) {
          return false;
        }
        const result = await openApplicationView(runId);
        if (!result.success) {
          if (continueFromDesktop) {
            setActionNotice(continueFromDesktop);
          } else {
            showActionFailure(OPEN_FAILURE);
          }
          return false;
        }
        openedRef.current = true;
        closedRef.current = false;
        setActionNotice(
          completedAction
            ? `${completedAction} request accepted/queued. Automation has not resumed until matching runtime progress reaches claiming or filling.`
            : "Desktop reopen request accepted/queued. Automation has not resumed until matching runtime progress reaches claiming or filling.",
        );
        return true;
      } catch {
        if (continueFromDesktop) {
          setActionNotice(continueFromDesktop);
        } else {
          showActionFailure(OPEN_FAILURE);
        }
        return false;
      } finally {
        openingRef.current = false;
      }
    },
    [
      bounds,
      desktopAvailable,
      runId,
      showActionFailure,
      supported,
    ],
  );

  useEffect(() => {
    if (
      !run ||
      action !== "REOPEN" ||
      runtime.viewAttached ||
      !supported ||
      !desktopAvailable ||
      !bounds
    ) {
      return;
    }
    const revision = runRevision(run);
    if (openAttemptRef.current === revision || openingRef.current) {
      return;
    }
    openAttemptRef.current = revision;
    void requestDesktopOpen();
  }, [
    action,
    bounds,
    desktopAvailable,
    requestDesktopOpen,
    run,
    runtime.viewAttached,
    supported,
  ]);

  useEffect(() => {
    if (
      !openedRef.current ||
      openingRef.current ||
      !supported ||
      !desktopAvailable ||
      !bounds
    ) {
      return;
    }
    void runBridgeOperation(
      () => setApplicationBounds(bounds),
      POSITION_FAILURE,
    );
  }, [
    bounds,
    desktopAvailable,
    runBridgeOperation,
    supported,
  ]);

  const beginAction = () => {
    if (actionLockRef.current) {
      return false;
    }
    actionLockRef.current = true;
    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    return true;
  };

  const finishAction = () => {
    actionLockRef.current = false;
    if (mountedRef.current) {
      setSubmitting(false);
    }
  };

  const reopenAfterMutation = async (
    detail: ApplicationRunDetail,
    completedAction: "resolved" | "released" | "resumed",
  ) => {
    const revision = runRevision(detail);
    // Claim this revision while the open is in flight so the REOPEN effect does
    // not double-open. Clear on failure so the effect can retry once bounds or
    // desktop availability catch up (common race right after submit).
    openAttemptRef.current = revision;
    setRun(detail);
    const opened = await requestDesktopOpen(completedAction);
    if (!opened && openAttemptRef.current === revision) {
      openAttemptRef.current = null;
    }
  };

  const handleSubmit = async () => {
    if (action !== "RELEASE_SUBMIT" || !beginAction()) {
      return;
    }
    try {
      const detail = await releaseSubmit(runId, OWNER_SUBMIT_CONFIRMATION);
      await reopenAfterMutation(detail, "released");
    } catch {
      setActionError(SUBMIT_FAILURE);
    } finally {
      finishAction();
    }
  };

  const handleCancel = async () => {
    if (!beginAction()) {
      return;
    }
    try {
      const detail = await cancelApplicationRun(runId, "Owner cancelled from workspace");
      setRun(detail);
    } catch {
      setActionError(CANCEL_FAILURE);
    } finally {
      finishAction();
    }
  };

  const handleResolve = async (exceptionId: string, answers: ResolveAnswerItem[]) => {
    if (action !== "RESOLVE" || !beginAction()) {
      return;
    }
    try {
      const detail = await resolveExceptionAnswers(runId, {
        exception_id: exceptionId,
        answers,
      });
      await reopenAfterMutation(detail, "resolved");
    } catch {
      setActionError(RESOLVE_FAILURE);
    } finally {
      finishAction();
    }
  };

  const handleResume = async () => {
    if (action !== "RESUME" || !beginAction()) {
      return;
    }
    try {
      const detail = await resumeApplicationRun(runId);
      await reopenAfterMutation(detail, "resumed");
    } catch {
      setActionError(RESUME_FAILURE);
    } finally {
      finishAction();
    }
  };

  const handlePrimaryAction = () => {
    switch (action) {
      case "REOPEN":
        void requestDesktopOpen();
        break;
      case "RELEASE_SUBMIT":
        void handleSubmit();
        break;
      case "RESUME":
        void handleResume();
        break;
      case "RESOLVE":
      case "BLOCKED":
      case null:
        break;
      default: {
        const exhaustive: never = action;
        throw new Error(`Unhandled durable action: ${String(exhaustive)}`);
      }
    }
  };

  if (loadError && !run) {
    return (
      <div className="application-workspace-error" role="alert">
        <h1>{loadError}</h1>
        <p>Return to Applications and try opening this run again.</p>
        <Link href="/applications" className="btn btn-secondary">
          Back to Applications
        </Link>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="application-workspace-loading" role="status" aria-live="polite">
        Loading application workspace…
      </div>
    );
  }

  let origin = run.canonical_application_url;
  try {
    origin = new URL(run.canonical_application_url).origin;
  } catch {
    origin = run.canonical_application_url;
  }

  return (
    <div
      className={`application-workspace${supported ? "" : " application-workspace-unsupported"}`}
      data-status={run.status}
    >
      <div className="application-workspace-nav">
        <Link href="/jobs" className="btn btn-secondary">
          Back to search
        </Link>
        <span className="sr-only">{workspacePath(runId)}</span>
      </div>

      {launchOutcome === DESKTOP_OPEN_REQUESTED ? (
        <p role="status" aria-label="Launch outcome">
          Run accepted and queued. The desktop view request was accepted.
          Automation has not resumed unless this run reports claiming or
          filling.
        </p>
      ) : launchOutcome === DESKTOP_OPEN_UNAVAILABLE ? (
        <p role="alert" aria-label="Launch outcome">
          Run accepted and queued, but the desktop application view was
          unavailable or failed to open. Review this workspace before
          continuing.
        </p>
      ) : null}

      {actionNotice ? (
        <p role="status" aria-live="polite">
          {actionNotice}
        </p>
      ) : null}
      {runtime.runtimeState?.phase === "claiming" ||
      runtime.runtimeState?.phase === "filling" ? (
        <p role="status">Resumed progress confirmed by the matching runtime.</p>
      ) : null}
      {runtime.error ? (
        <p role="alert">
          Runtime status is unavailable. Durable backend state remains
          authoritative.
        </p>
      ) : null}

      {!supported ? (
        <p className="workspace-unsupported" role="alert">
          This embedded workspace needs a 1280×720 window or larger. The native
          application view is closed so it cannot cover trusted controls.
        </p>
      ) : (
        <div className="application-workspace-layout">
          <JobContextPanel
            title={job?.title ?? "Selected job"}
            company={job?.company ?? "Company unavailable"}
            sourceName={job?.sources[0]?.source_name ?? run.platform_adapter_id}
            applicationOrigin={origin}
            resume={resume}
            status={run.status}
            checkpoint={run.current_checkpoint}
            currentStep={run.current_step}
          />

          <section className="application-workspace-browser" aria-label="Embedded application">
            <BrowserToolbar
              desktopAvailable={desktopAvailable}
              browserState={browserState}
              onBack={() =>
                void runBridgeOperation(goBack, BACK_FAILURE)
              }
              onForward={() =>
                void runBridgeOperation(goForward, FORWARD_FAILURE)
              }
              onReload={() =>
                void runBridgeOperation(reloadApplicationView, RELOAD_FAILURE)
              }
            />
            <BrowserViewport
              onBounds={setBounds}
              onSupportedChange={setSupported}
              viewSurrendered={
                runtime.viewAttached === false &&
                (runtime.runtimeState?.phase === "armed" ||
                  runtime.runtimeState?.phase === "paused")
              }
            />
          </section>

          <aside className="application-workspace-assist" aria-label="Assistance">
            <FieldReviewPanel reports={collectFieldReports(run.exceptions)} />
            <ExceptionResolver
              runStatus={run.status}
              exceptions={run.exceptions}
              submitting={submitting}
              onResolve={(exceptionId, answers) => void handleResolve(exceptionId, answers)}
              onResume={() => void handleResume()}
            />
            {run.status === "paused_auth" &&
            isHttpsApplicationUrl(run.application_url) ? (
              <a
                className="btn btn-secondary"
                href={run.application_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open external application
              </a>
            ) : null}
            <SubmissionReceipt
              status={run.status}
              receipt={run.receipt_summary}
              evidence={run.evidence}
              terminalReason={run.terminal_reason}
              applicationUrl={run.application_url}
            />
          </aside>
        </div>
      )}

      {actionError ? (
        <p className="application-workspace-action-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <ApplicationStatusBar
        status={run.status}
        checkpoint={run.current_checkpoint}
        exceptions={run.exceptions}
        mode={run.automation_mode}
        automaticSubmissionAuthorized={run.automatic_submission_authorized}
        automaticSubmissionAuthorizedAt={
          run.automatic_submission_authorized_at
        }
        submitAttemptedAt={run.submit_attempted_at}
        runtimePhase={runtime.runtimeState?.phase ?? null}
        runtimeReasonText={runtimeReason}
        action={action}
        submitting={submitting}
        disconnected={disconnected}
        onPrimaryAction={handlePrimaryAction}
        onCancel={() => void handleCancel()}
      />
    </div>
  );
}
