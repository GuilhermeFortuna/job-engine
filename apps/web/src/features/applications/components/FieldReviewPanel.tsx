import {
  FILLED_FIELD_STATUSES,
  REVIEW_FIELD_STATUSES,
  countFieldReports,
  type SafeFieldReport,
} from "../types";

export interface FieldReviewPanelProps {
  reports: SafeFieldReport[];
}

function safeFieldStatus(status: string): string {
  if (FILLED_FIELD_STATUSES.has(status)) {
    return "Filled";
  }
  if (REVIEW_FIELD_STATUSES.has(status)) {
    return "Review required";
  }
  return "Unresolved";
}

export function FieldReviewPanel({ reports }: FieldReviewPanelProps) {
  const counts = countFieldReports(reports);
  return (
    <section className="field-review-panel" aria-labelledby="field-review-heading">
      <h2 id="field-review-heading">Field review</h2>
      <p className="field-review-counts">
        Filled {counts.filled}. Review {counts.review}. Unresolved {counts.unresolved}.
      </p>
      {reports.length === 0 ? (
        <p>No field reports yet.</p>
      ) : (
        <ul className="field-review-list">
          {reports.map((report) => (
            <li key={report.field_fingerprint}>
              <p>
                <strong>{report.label}</strong>
                {report.required ? " (required)" : ""}
              </p>
              <p>Status: {safeFieldStatus(report.status)}</p>
              {report.question_intent ? (
                <p>Intent: {report.question_intent.replaceAll("_", " ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
