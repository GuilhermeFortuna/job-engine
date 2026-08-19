import type {
  ApplicationRunReceipt,
  ApplicationRunStatus,
  EvidenceMetadata,
} from "../types";

export interface SubmissionReceiptProps {
  status: ApplicationRunStatus | string;
  receipt: ApplicationRunReceipt | null;
  evidence: EvidenceMetadata[];
  terminalReason: string | null;
}

function allowlistedEvidence(item: EvidenceMetadata): EvidenceMetadata | null {
  if (item.evidence_type !== "receipt" && item.evidence_type !== "log") {
    return null;
  }
  return item;
}

export function SubmissionReceipt({
  status,
  receipt,
  evidence,
  terminalReason,
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
              <dt>Confirmation</dt>
              <dd>{receipt.confirmation_signal}</dd>
            </div>
            <div>
              <dt>Captured</dt>
              <dd>{receipt.capture_timestamp}</dd>
            </div>
            <div>
              <dt>Receipt hash</dt>
              <dd>{receipt.artifact_hash}</dd>
            </div>
          </dl>
        ) : (
          <p>Waiting for a backend receipt before treating this as submitted.</p>
        )}
      </section>
    );
  }

  if (status === "submission_unknown") {
    const items = evidence.map(allowlistedEvidence).filter(Boolean) as EvidenceMetadata[];
    return (
      <section
        className="submission-receipt submission-receipt-unknown"
        aria-labelledby="outcome-heading"
      >
        <h2 id="outcome-heading">Submission unknown</h2>
        <p>
          The backend could not confirm the site receipt. Inspect allowlisted
          evidence metadata only. Blind retry is not offered.
        </p>
        {items.length === 0 ? (
          <p>No receipt or log metadata is available.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                Type: {item.evidence_type}. Captured: {item.captured_at}. Hash:{" "}
                {item.sha256}. Size: {item.file_size_bytes ?? "unknown"} bytes.
              </li>
            ))}
          </ul>
        )}
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
        <p>{terminalReason || "The application run failed."}</p>
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
        <p>{terminalReason || "This application run was cancelled."}</p>
      </section>
    );
  }

  return null;
}
