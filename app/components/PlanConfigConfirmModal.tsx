"use client";

import { useEffect } from "react";

interface PlanConfigConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  busy?: boolean;
}

export function PlanConfigConfirmModal({
  open,
  onConfirm,
  onDecline,
  busy = false,
}: PlanConfigConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      onDecline();
    };
    window.addEventListener("keydown", handleEscape);
    return () => { window.removeEventListener("keydown", handleEscape); };
  }, [open, busy, onDecline]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-config-confirm-title"
    >
      <div className="bg-surface rounded-t-2xl sm:rounded-xl px-4 py-5 sm:p-6 w-full sm:max-w-md border-t sm:border border-border shadow-xl">
        <h2 id="plan-config-confirm-title" className="text-base font-semibold text-text">
          Update future workouts to match your new settings?
        </h2>
        <p className="text-sm text-muted mt-2">
          Your settings are already saved. Updating rewrites future planned workouts; declining leaves them as they are.
        </p>
        <div className="flex justify-end gap-3 mt-5">
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="px-3 py-1.5 text-sm text-muted hover:text-text transition disabled:opacity-50"
          >
            Keep workouts
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-4 py-1.5 bg-brand-btn text-white rounded-lg text-sm font-bold hover:bg-brand-hover transition disabled:opacity-50"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
