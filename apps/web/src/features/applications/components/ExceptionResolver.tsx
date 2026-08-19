"use client";

import { useId, useState, type FormEvent } from "react";
import {
  isResolvableException,
  type ResolveAnswerItem,
  type SafeException,
  type SafeFieldReport,
} from "../types";

export interface ExceptionResolverProps {
  runStatus: string;
  exceptions: SafeException[];
  submitting: boolean;
  onResolve: (exceptionId: string, answers: ResolveAnswerItem[]) => void;
  onResume: () => void;
}

function FieldInput({
  report,
  value,
  onChange,
  autoFocus,
}: {
  report: SafeFieldReport;
  value: string;
  onChange: (value: string) => void;
  autoFocus: boolean;
}) {
  const id = useId();
  if (report.options.length > 0 && report.control_type !== "multi_select") {
    return (
      <>
        <label htmlFor={id}>{report.label}</label>
        <select
          id={id}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          required={report.required}
        >
          <option value="">Select an option</option>
          {report.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </>
    );
  }
  const InputTag = report.control_type === "textarea" ? "textarea" : "input";
  return (
    <>
      <label htmlFor={id}>{report.label}</label>
      <InputTag
        id={id}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        required={report.required}
        minLength={report.min_length ?? undefined}
        maxLength={report.max_length ?? undefined}
        pattern={report.pattern ?? undefined}
      />
    </>
  );
}

function ResolvableExceptionForm({
  exception,
  submitting,
  onResolve,
}: {
  exception: SafeException;
  submitting: boolean;
  onResolve: (exceptionId: string, answers: ResolveAnswerItem[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveFlags, setSaveFlags] = useState<Record<string, boolean>>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload: ResolveAnswerItem[] = exception.field_reports.map((report) => ({
      field_fingerprint: report.field_fingerprint,
      answer_text: answers[report.field_fingerprint]?.trim() ?? "",
      save_to_answer_bank: Boolean(saveFlags[report.field_fingerprint]),
    }));
    onResolve(exception.id, payload);
  };

  return (
    <form onSubmit={submit}>
      {exception.field_reports.map((report, index) => (
        <div key={report.field_fingerprint} className="exception-field">
          <FieldInput
            report={report}
            value={answers[report.field_fingerprint] ?? ""}
            autoFocus={index === 0}
            onChange={(value) =>
              setAnswers((current) => ({
                ...current,
                [report.field_fingerprint]: value,
              }))
            }
          />
          {report.reason_code ? <p>Reason: {report.reason_code}</p> : null}
          {report.allow_save_to_answer_bank ? (
            <label>
              <input
                type="checkbox"
                checked={Boolean(saveFlags[report.field_fingerprint])}
                onChange={(event) =>
                  setSaveFlags((current) => ({
                    ...current,
                    [report.field_fingerprint]: event.target.checked,
                  }))
                }
              />
              Save to answer bank for future runs
            </label>
          ) : null}
        </div>
      ))}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        Submit answers
      </button>
    </form>
  );
}

export function ExceptionResolver({
  runStatus,
  exceptions,
  submitting,
  onResolve,
  onResume,
}: ExceptionResolverProps) {
  const pending = [...exceptions].reverse().find((exception) => exception.status === "pending");

  if (runStatus === "paused_auth") {
    return (
      <section className="exception-resolver" aria-labelledby="exception-heading">
        <h2 id="exception-heading">Authentication pause</h2>
        <p>
          Complete the sign-in or CAPTCHA challenge directly in the embedded
          application page. Job Engine never asks for credentials here.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting}
          onClick={onResume}
        >
          Resume application
        </button>
      </section>
    );
  }

  if (!pending) {
    return null;
  }

  if (pending.exception_type === "semi_auto_armed") {
    return (
      <section className="exception-resolver" aria-labelledby="exception-heading">
        <h2 id="exception-heading">Ready to submit</h2>
        <p>
          Review the prepared application, then use Submit application in the
          trusted status bar.
        </p>
      </section>
    );
  }

  if (!isResolvableException(pending)) {
    return (
      <section className="exception-resolver" aria-labelledby="exception-heading">
        <h2 id="exception-heading">Needs attention</h2>
        <p>Exception: {pending.exception_type.replaceAll("_", " ")}</p>
      </section>
    );
  }

  return (
    <section className="exception-resolver" aria-labelledby="exception-heading">
      <h2 id="exception-heading">Resolve missing answers</h2>
      <p>Exception: {pending.exception_type.replaceAll("_", " ")}</p>
      <ResolvableExceptionForm
        key={pending.id}
        exception={pending}
        submitting={submitting}
        onResolve={onResolve}
      />
    </section>
  );
}
