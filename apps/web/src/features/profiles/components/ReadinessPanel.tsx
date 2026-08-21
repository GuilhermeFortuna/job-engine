"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProductReadiness } from "../types";

interface ReadinessPanelProps {
  readiness: ProductReadiness;
  title?: string;
  onRetrySelfTest?: () => void | Promise<void>;
  selfTestBusy?: boolean;
}

export function ReadinessPanel({
  readiness,
  title = "Readiness",
  onRetrySelfTest,
  selfTestBusy = false,
}: ReadinessPanelProps) {
  return (
    <section className="readiness-panel" aria-labelledby="readiness-panel-heading">
      <div className="readiness-panel-header">
        <h2 id="readiness-panel-heading">{title}</h2>
        <p
          className="readiness-panel-label"
          data-label={readiness.label}
          role="status"
        >
          {readiness.label}
        </p>
      </div>

      {readiness.blockers.length > 0 ? (
        <div className="readiness-panel-group">
          <h3>Required next steps</h3>
          <ul>
            {readiness.blockers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {readiness.exceptions.length > 0 ? (
        <div className="readiness-panel-group">
          <h3>Exceptions</h3>
          <ul>
            {readiness.exceptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {readiness.actions.length > 0 ? (
        <div className="readiness-panel-actions">
          {readiness.actions.map((action) =>
            action.href ? (
              <Link
                key={action.id}
                href={action.href}
                className="btn btn-secondary"
              >
                {action.label}
              </Link>
            ) : (
              <span key={action.id} className="readiness-action-text">
                {action.label}
              </span>
            ),
          )}
          {onRetrySelfTest ? (
            <Button
              type="button"
              variant="outline"
              disabled={selfTestBusy}
              onClick={() => void onRetrySelfTest()}
            >
              {selfTestBusy ? "Running self-test…" : "Run local model self-test"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
