"use client";

import type { ReactNode } from "react";

const ACCENT_CLASSES = {
  brand: "bg-brand text-bg",
  success: "bg-success text-bg",
  warning: "bg-warning text-bg",
} as const;

interface ToastProps {
  message: ReactNode;
  actionLabel: string;
  onAction?: () => void;
  actionHref?: string;
  onDismiss: () => void;
  accent?: "brand" | "success" | "warning";
}

export function Toast({
  message,
  actionLabel,
  onAction,
  actionHref,
  onDismiss,
  accent = "brand",
}: ToastProps) {
  const accentClass = ACCENT_CLASSES[accent];

  const cta = actionHref ? (
    <a
      href={actionHref}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg shrink-0 ${accentClass}`}
    >
      {actionLabel}
    </a>
  ) : (
    <button
      type="button"
      onClick={onAction}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg shrink-0 ${accentClass}`}
    >
      {actionLabel}
    </button>
  );

  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-black/40 animate-[toast-enter_200ms_ease-out]">
      <p className="text-sm text-muted flex-1 truncate">{message}</p>
      {cta}
      <button
        type="button"
        onClick={onDismiss}
        className="text-muted hover:text-text text-lg leading-none shrink-0"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
