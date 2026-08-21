"use client";

import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptAttribute,
  validateUploadFile,
  type FileKind,
} from "../file-validation";

interface FileDropZoneProps {
  kind: FileKind;
  label: string;
  hint: string;
  disabled?: boolean;
  onFile: (file: File) => void | Promise<void>;
}

export function FileDropZone({
  kind,
  label,
  hint,
  disabled = false,
  onFile,
}: FileDropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | null | undefined) {
    if (!file || disabled || busy) {
      return;
    }
    const result = validateUploadFile(file, kind);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onFile(file);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div className="profile-file-drop">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || busy}
        aria-describedby={`${inputId}-hint`}
        data-dragging={dragging || undefined}
        className="profile-file-drop-target"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (!disabled && !busy) {
            inputRef.current?.click();
          }
        }}
      >
        <p className="profile-file-drop-label">{label}</p>
        <p id={`${inputId}-hint`} className="profile-file-drop-hint">
          {busy ? "Uploading…" : hint}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose file
        </Button>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={acceptAttribute(kind)}
          disabled={disabled || busy}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="profile-inline-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
