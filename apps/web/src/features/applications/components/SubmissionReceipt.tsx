import type {
  ApplicationRunReceipt,
  ApplicationRunStatus,
  EvidenceMetadata,
} from "../types";
import { isHttpsApplicationUrl } from "../types";

export interface SubmissionReceiptProps {
  status: ApplicationRunStatus | string;
  receipt: ApplicationRunReceipt | null;
  evidence: EvidenceMetadata[];
  terminalReason: string | null;
  applicationUrl?: string | null;
}

export function SubmissionReceipt({
  status,
  receipt,
  applicationUrl = null,
}: SubmissionReceiptProps) {
  if (status === "submitted") {
    return (
      <section
        className="submission-receipt submission-receipt-submitted"
        aria-labelledby="outcome-heading"
      >
        <h2 id="outcome-heading">Submitted</h2>
        {receipt ? (
          <dl>
            <div>
              <dt>Platform</dt>
              <dd>{receipt.platform_adapter_id}</dd>
            </div>
            <div>
              <dt>Captured</dt>
              <dd>{receipt.capture_timestamp}</dd>
            </div>
          </dl>
        ) : (
          <p>Waiting for a backend receipt before treating this as submitted.</p>
        )}
      </section>
    );
  }

  if (status === "submission_unknown") {
    return (
      <section
        className="submission-receipt submission-receipt-unknown"
        aria-labelledby="outcome-heading"
      >
        <h2 id="outcome-heading">Submission unknown</h2>
        <p>
          Verify directly in the ATS and check the confirmation email. Do not
          retry blindly.
        </p>
        {isHttpsApplicationUrl(applicationUrl) ? (
          <a
            className="btn btn-secondary"
            href={applicationUrl ?? undefined}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open external application
          </a>
        ) : null}
      </section>
    );
  }

  if (status === "failed_final" || status === "failed_retryable") {
    return (
      <section
        className="submission-receipt submission-receipt-failed"
        aria-labelledby="outcome-heading"
      >
        <h2 id="outcome-heading">
          {status === "failed_retryable" ? "Retryable failure" : "Failed"}
        </h2>
        <p>
          {status === "failed_retryable"
            ? "The backend permits resuming this run from its durable checkpoint."
            : "The application run failed and cannot be retried."}
        </p>
      </section>
    );
  }

  if (status === "cancelled") {
    return (
      <section
        className="submission-receipt submission-receipt-cancelled"
        aria-labelledby="outcome-heading"
      >
        <h2 id="outcome-heading">Cancelled</h2>
        <p>This application run was cancelled.</p>
      </section>
    );
  }

  return null;
}
