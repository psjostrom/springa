"use client";

import type { BestEffort } from "@/lib/types";

interface PacePBsProps {
  bestEfforts: BestEffort[];
  longestRun: { distance: number; activityId: string; activityName: string; activityDate?: string; movingTime?: number } | null;
  onActivitySelect?: (activityId: string) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`;
  }
  return `${meters}m`;
}

export function PacePBs({ bestEfforts, longestRun, onActivitySelect }: PacePBsProps) {
  if (bestEfforts.length === 0 && !longestRun) {
    return null;
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {bestEfforts.map((effort) => (
          <div
            key={effort.label}
            className={`bg-surface-alt rounded-lg p-3 ${effort.activityId && onActivitySelect ? "cursor-pointer active:bg-border transition-colors" : ""}`}
            onClick={() => { if (effort.activityId) onActivitySelect?.(effort.activityId); }}
          >
            <div className="text-xs text-muted uppercase tracking-wider font-semibold">{effort.label}</div>
            <div className="text-lg font-bold text-text">
              {formatTime(effort.timeSeconds)}
            </div>
            <div className="text-xs text-muted">
              {formatPace(effort.pace)}/km
            </div>
            {effort.activityName && (
              <div className="text-[10px] text-muted/70 mt-1 truncate">{effort.activityName}</div>
            )}
            {effort.activityDate && (
              <div className="text-[10px] text-muted/70">
                {new Date(effort.activityDate).toLocaleDateString("sv-SE")}
              </div>
            )}
          </div>
        ))}
        {longestRun && (
          <div
            className={`bg-surface-alt rounded-lg p-3 ${onActivitySelect ? "cursor-pointer active:bg-border transition-colors" : ""}`}
            onClick={() => { onActivitySelect?.(longestRun.activityId); }}
          >
            <div className="text-xs text-muted uppercase tracking-wider font-semibold">Longest Run</div>
            <div className="text-lg font-bold text-text">
              {formatDistance(longestRun.distance)}
            </div>
            {longestRun.movingTime && longestRun.distance > 0 && (
              <div className="text-xs text-muted">
                {formatPace((longestRun.movingTime / longestRun.distance) * 1000 / 60)}/km
              </div>
            )}
            {longestRun.activityName && (
              <div className="text-[10px] text-muted/70 mt-1 truncate">{longestRun.activityName}</div>
            )}
            {longestRun.activityDate && (
              <div className="text-[10px] text-muted/70">
                {new Date(longestRun.activityDate).toLocaleDateString("sv-SE")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
