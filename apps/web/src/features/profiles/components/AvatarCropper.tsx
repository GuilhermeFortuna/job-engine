"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import type { AvatarCrop } from "../types";

interface AvatarCropperProps {
  imageUrl: string;
  initialCrop?: AvatarCrop | null;
  onConfirm: (crop: AvatarCrop) => void | Promise<void>;
  onCancel: () => void;
}

const DEFAULT_CROP: AvatarCrop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

function clampCrop(crop: AvatarCrop): AvatarCrop {
  const width = Math.min(Math.max(crop.width, 0.15), 1);
  const height = Math.min(Math.max(crop.height, 0.15), 1);
  const side = Math.min(width, height);
  const x = Math.min(Math.max(crop.x, 0), 1 - side);
  const y = Math.min(Math.max(crop.y, 0), 1 - side);
  return { x, y, width: side, height: side };
}

export function AvatarCropper({
  imageUrl,
  initialCrop,
  onConfirm,
  onCancel,
}: AvatarCropperProps) {
  const titleId = useId();
  const [crop, setCrop] = useState<AvatarCrop>(() =>
    clampCrop(initialCrop ?? DEFAULT_CROP),
  );
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const cropSourceKey = `${imageUrl}:${JSON.stringify(initialCrop ?? null)}`;
  const [appliedKey, setAppliedKey] = useState(cropSourceKey);
  if (appliedKey !== cropSourceKey) {
    setAppliedKey(cropSourceKey);
    setCrop(clampCrop(initialCrop ?? DEFAULT_CROP));
  }

  function nudge(dx: number, dy: number) {
    setCrop((current) =>
      clampCrop({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      }),
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.05 : 0.02;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        nudge(-step, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        nudge(step, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        nudge(0, -step);
        break;
      case "ArrowDown":
        event.preventDefault();
        nudge(0, step);
        break;
      case "+":
      case "=":
        event.preventDefault();
        setCrop((current) =>
          clampCrop({
            ...current,
            width: current.width + 0.05,
            height: current.height + 0.05,
          }),
        );
        break;
      case "-":
        event.preventDefault();
        setCrop((current) =>
          clampCrop({
            ...current,
            width: current.width - 0.05,
            height: current.height - 0.05,
          }),
        );
        break;
      default:
        break;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - crop.width / 2;
    const relY = (event.clientY - rect.top) / rect.height - crop.height / 2;
    setCrop((current) =>
      clampCrop({ ...current, x: relX, y: relY }),
    );
  }

  return (
    <div className="avatar-cropper" role="group" aria-labelledby={titleId}>
      <h3 id={titleId}>Crop profile photo</h3>
      <p className="avatar-cropper-hint">
        Drag the square or use arrow keys. Plus and minus change size.
      </p>
      <div
        className="avatar-cropper-stage"
        tabIndex={0}
        role="img"
        aria-label="Square crop preview"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerMove={onPointerMove}
        style={{ backgroundImage: `url(${imageUrl})` }}
      >
        <div
          className="avatar-cropper-frame"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
        />
      </div>
      <div className="avatar-cropper-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void Promise.resolve(onConfirm(crop)).finally(() => setBusy(false));
          }}
        >
          {busy ? "Saving…" : "Save crop"}
        </Button>
      </div>
    </div>
  );
}
