"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LocalAiProposal, ProposedField } from "../types";

interface ExtractionReviewProps {
  proposal: LocalAiProposal;
  busy?: boolean;
  onAcceptSelected: (input: {
    acceptedPaths: string[];
    edits: Record<string, unknown>;
  }) => void | Promise<void>;
  onDeclineAll: () => void | Promise<void>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function parseEditedValue(raw: string, original: unknown): unknown {
  if (typeof original === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : original;
  }
  if (typeof original === "object" && original !== null) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return original;
    }
  }
  return raw;
}

type Decision = "pending" | "accept" | "decline";

export function ExtractionReview({
  proposal,
  busy = false,
  onAcceptSelected,
  onDeclineAll,
}: ExtractionReviewProps) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(proposal.fields.map((field) => [field.field_path, "pending"])),
  );
  const [edits, setEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      proposal.fields.map((field) => [field.field_path, displayValue(field.value)]),
    ),
  );

  const fields = useMemo(() => proposal.fields, [proposal.fields]);

  function setDecision(path: string, decision: Decision) {
    setDecisions((current) => ({ ...current, [path]: decision }));
  }

  async function submitAccepted() {
    const acceptedPaths = Object.entries(decisions)
      .filter(([, decision]) => decision === "accept")
      .map(([path]) => path);
    const fieldEdits: Record<string, unknown> = {};
    for (const field of fields) {
      if (decisions[field.field_path] !== "accept") {
        continue;
      }
      const edited = edits[field.field_path] ?? "";
      const originalText = displayValue(field.value);
      if (edited !== originalText) {
        fieldEdits[field.field_path] = parseEditedValue(edited, field.value);
      }
    }
    await onAcceptSelected({ acceptedPaths, edits: fieldEdits });
  }

  if (fields.length === 0) {
    return (
      <div className="extraction-review">
        <p>No suggestions were found. You can continue and enter details yourself.</p>
        <Button type="button" disabled={busy} onClick={() => void onDeclineAll()}>
          Continue without suggestions
        </Button>
      </div>
    );
  }

  return (
    <div className="extraction-review">
      <p className="extraction-review-intro">
        Suggestions from your resume are highlighted. Accept, edit, or decline each
        one — nothing is saved until you confirm.
      </p>
      <ul className="extraction-review-list">
        {fields.map((field) => (
          <ExtractionFieldRow
            key={field.field_path}
            field={field}
            decision={decisions[field.field_path] ?? "pending"}
            editValue={edits[field.field_path] ?? ""}
            disabled={busy}
            onDecision={(decision) => setDecision(field.field_path, decision)}
            onEdit={(value) =>
              setEdits((current) => ({ ...current, [field.field_path]: value }))
            }
          />
        ))}
      </ul>
      <div className="extraction-review-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void onDeclineAll()}
        >
          Decline all
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void submitAccepted()}
        >
          Accept selected
        </Button>
      </div>
    </div>
  );
}

function ExtractionFieldRow({
  field,
  decision,
  editValue,
  disabled,
  onDecision,
  onEdit,
}: {
  field: ProposedField;
  decision: Decision;
  editValue: string;
  disabled: boolean;
  onDecision: (decision: Decision) => void;
  onEdit: (value: string) => void;
}) {
  const evidence = field.evidence[0]?.excerpt?.trim();
  const complex = typeof field.value === "object" && field.value !== null;

  return (
    <li
      className="extraction-review-item"
      data-decision={decision}
      data-suggestion="true"
    >
      <div className="extraction-review-heading">
        <strong>{humanizePath(field.field_path)}</strong>
        <span className="extraction-suggestion-badge">Suggestion</span>
      </div>
      {evidence ? (
        <p className="extraction-evidence">
          Source: “{evidence.slice(0, 160)}
          {evidence.length > 160 ? "…" : ""}”
        </p>
      ) : (
        <p className="extraction-evidence">Source: resume extraction</p>
      )}
      {complex ? (
        <Textarea
          aria-label={`Edit ${humanizePath(field.field_path)}`}
          value={editValue}
          disabled={disabled || decision === "decline"}
          onChange={(event) => onEdit(event.target.value)}
        />
      ) : (
        <Input
          aria-label={`Edit ${humanizePath(field.field_path)}`}
          value={editValue}
          disabled={disabled || decision === "decline"}
          onChange={(event) => onEdit(event.target.value)}
        />
      )}
      <div className="extraction-review-item-actions">
        <Button
          type="button"
          size="sm"
          variant={decision === "accept" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onDecision("accept")}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant={decision === "decline" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onDecision("decline")}
        >
          Decline
        </Button>
      </div>
    </li>
  );
}

function humanizePath(path: string): string {
  return path
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
