"use client";

import { useState } from "react";

interface VolumeCompactProps {
  actualKm: number;
  targetKm: number;
  completedRuns: number;
  totalRuns: number;
}

function VolumePopover({ actualKm, targetKm, completedRuns, totalRuns, onClose }: VolumeCompactProps & { onClose: () => void }) {
  const remaining = Math.max(0, targetKm - actualKm);
  const runsLeft = Math.max(0, totalRuns - completedRuns);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl border border-border p-4 w-64 shadow-xl"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Weekly Volume</span>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-white text-sm">✕</button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Completed</span>
            <span className="text-white">{Math.round(actualKm * 10) / 10} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Target</span>
            <span className="text-white">{Math.round(targetKm * 10) / 10} km</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">Remaining</span>
              <span className="text-chart-secondary">{Math.round(remaining * 10) / 10} km</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">Runs completed</span>
            <span className="text-white">{completedRuns} of {totalRuns}</span>
          </div>
          {runsLeft > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">Runs left</span>
              <span className="text-chart-secondary">{runsLeft}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VolumeCompact({ actualKm, targetKm, completedRuns, totalRuns }: VolumeCompactProps) {
  const [showPopover, setShowPopover] = useState(false);

  if (targetKm <= 0 && actualKm <= 0) return null;
  const pct = targetKm > 0 ? Math.min(100, Math.round((actualKm / targetKm) * 100)) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => { setShowPopover(true); }}
        className="w-full text-left bg-surface rounded-xl border border-border p-4 transition-colors active:bg-border"
      >
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xl font-bold text-white">{Math.round(actualKm)} km</span>
          <span className="text-sm text-muted">{Math.round(targetKm)} km target</span>
        </div>
        <div
          className="h-2 bg-surface rounded-full overflow-hidden mb-1.5"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              backgroundColor: pct >= 100 ? "var(--color-success)" : "var(--color-chart-secondary)",
            }}
          />
        </div>
        <span className="text-xs text-muted">{completedRuns} of {totalRuns} runs</span>
      </button>
      {showPopover && (
        <VolumePopover
          actualKm={actualKm}
          targetKm={targetKm}
          completedRuns={completedRuns}
          totalRuns={totalRuns}
          onClose={() => { setShowPopover(false); }}
        />
      )}
    </>
  );
}
