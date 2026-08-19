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
} from "../desktop-bridge";
import {
  collectFieldReports,
  workspacePath,
  type ApplicationRunDetail,
  type ResolveAnswerItem,
  type SafeResume,
} from "../types";
import { ApplicationStatusBar } from "./ApplicationStatusBar";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserViewport } from "./BrowserViewport";
import { ExceptionResolver } from "./ExceptionResolver";
import { FieldReviewPanel } from "./FieldReviewPanel";
import { JobContextPanel } from "./JobContextPanel";
import { SubmissionReceipt } from "./SubmissionReceipt";

const OWNER_SUBMIT_CONFIRMATION = "Submit this application";

export function ApplicationWorkspace({ runId }: { runId: string }) {
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

  const closedRef = useRef(false);
  const openedRef = useRef(false);
  const openingRef = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const detail = await fetchApplicationRunDetail(runId, { signal });
    if (detail.id !== runId) {
      throw new ApiError(409, "Mismatched run", detail);
    }
    setRun(detail);
    setLoadError(null);
    setDisconnected(false);
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
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(err instanceof Error ? err.message : "Unable to load application run");
        }
        return;
      }

      while (!stopped && !controller.signal.aborted) {
        try {
          lastEventId = await streamApplicationRunEvents({
            runId,
            lastEventId,
            signal: controller.signal,
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
    void closeApplicationView();
  }, []);

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

  useEffect(() => {
    if (!supported || !desktopAvailable || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    if (openedRef.current) {
      void setApplicationBounds(bounds);
      return;
    }
    if (openingRef.current) {
      return;
    }
    openingRef.current = true;
    void (async () => {
      await setApplicationBounds(bounds);
      if (closedRef.current) {
        openingRef.current = false;
        return;
      }
      const result = await openApplicationView(runId);
      openingRef.current = false;
      if (result.success) {
        openedRef.current = true;
        closedRef.current = false;
      }
    })();
  }, [bounds, desktopAvailable, runId, supported]);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const detail = await releaseSubmit(runId, OWNER_SUBMIT_CONFIRMATION);
      setRun(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to release submission");
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      const detail = await cancelApplicationRun(runId, "Owner cancelled from workspace");
      setRun(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to cancel the run");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (exceptionId: string, answers: ResolveAnswerItem[]) => {
    setSubmitting(true);
    setActionError(null);
    try {
      const detail = await resolveExceptionAnswers(runId, {
        exception_id: exceptionId,
        answers,
      });
      setRun(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to resolve answers");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResume = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      const detail = await resumeApplicationRun(runId);
      setRun(detail);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to resume the run");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError && !run) {
    return (
      <div className="application-workspace-error" role="alert">
        <h1>Unable to open workspace</h1>
        <p>{loadError}</p>
        <Link href="/jobs" className="btn btn-secondary">
          Back to search
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
              onBack={() => void goBack()}
              onForward={() => void goForward()}
              onReload={() => void reloadApplicationView()}
            />
            <BrowserViewport onBounds={setBounds} onSupportedChange={setSupported} />
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
            <SubmissionReceipt
              status={run.status}
              receipt={run.receipt_summary}
              evidence={run.evidence}
              terminalReason={run.terminal_reason}
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
        openRunId={browserState.runId}
        routeRunId={runId}
        submitting={submitting}
        disconnected={disconnected}
        onSubmit={() => void handleSubmit()}
        onCancel={() => void handleCancel()}
      />
    </div>
  );
}
