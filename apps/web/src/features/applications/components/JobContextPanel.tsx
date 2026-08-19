import type { ApplicationRunStatus, SafeResume } from "../types";

export interface JobContextPanelProps {
  title: string;
  company: string;
  sourceName: string;
  applicationOrigin: string;
  resume: SafeResume | null;
  status: ApplicationRunStatus | string;
  checkpoint: string | null;
  currentStep: string | null;
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function JobContextPanel({
  title,
  company,
  sourceName,
  applicationOrigin,
  resume,
  status,
  checkpoint,
  currentStep,
}: JobContextPanelProps) {
  return (
    <aside className="job-context-panel" aria-label="Application context">
      <h2>Application context</h2>
      <dl>
        <div>
          <dt>Job</dt>
          <dd>{title}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{company}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{sourceName}</dd>
        </div>
        <div>
          <dt>Application origin</dt>
          <dd>{applicationOrigin}</dd>
        </div>
        <div>
          <dt>Resume</dt>
          <dd>
            {resume
              ? `${resume.label} (${resume.checksum_summary})`
              : "Resume details unavailable"}
          </dd>
        </div>
        <div>
          <dt>Run status</dt>
          <dd>{formatStatus(status)}</dd>
        </div>
        <div>
          <dt>Checkpoint</dt>
          <dd>{checkpoint ? formatStatus(checkpoint) : "None yet"}</dd>
        </div>
        <div>
          <dt>Current step</dt>
          <dd>{currentStep || "Waiting"}</dd>
        </div>
      </dl>
    </aside>
  );
}
