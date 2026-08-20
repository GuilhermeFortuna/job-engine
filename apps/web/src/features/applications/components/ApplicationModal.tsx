"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface BoundarySnapshot {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

interface ApplicationModalProps {
  label: string;
  children: ReactNode;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function ApplicationModal({
  label,
  children,
  onClose,
  returnFocusRef,
  fallbackFocusRef,
}: ApplicationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [portal] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const element = document.createElement("div");
    element.dataset.applicationModalRoot = "true";
    return element;
  });

  useLayoutEffect(() => {
    if (!portal) {
      return;
    }
    document.body.append(portal);
    const returnTarget = returnFocusRef.current;
    const fallbackTarget = fallbackFocusRef?.current;
    const boundaries: BoundarySnapshot[] = Array.from(
      document.body.children,
    )
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== portal,
      )
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    for (const boundary of boundaries) {
      boundary.element.inert = true;
      boundary.element.setAttribute("aria-hidden", "true");
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      FOCUSABLE_SELECTOR,
    );
    focusables?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const currentFocusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      );
      if (currentFocusables.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = currentFocusables[0];
      const last = currentFocusables.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) {
        const first = dialogRef.current?.querySelector<HTMLElement>(
          FOCUSABLE_SELECTOR,
        );
        (first ?? dialogRef.current)?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      for (const boundary of boundaries) {
        boundary.element.inert = boundary.inert;
        if (boundary.ariaHidden === null) {
          boundary.element.removeAttribute("aria-hidden");
        } else {
          boundary.element.setAttribute("aria-hidden", boundary.ariaHidden);
        }
      }
      document.body.style.overflow = previousOverflow;
      portal.remove();
      if (returnTarget?.isConnected) {
        returnTarget.focus();
      } else if (fallbackTarget?.isConnected) {
        fallbackTarget.focus();
      }
    };
  }, [fallbackFocusRef, onClose, portal, returnFocusRef]);

  if (!portal) {
    return null;
  }
  return createPortal(
    <div
      className="application-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="application-settings-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={dialogRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    portal,
  );
}
