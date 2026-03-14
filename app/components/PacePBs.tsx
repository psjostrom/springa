"use client";

import type { BestEffort } from "@/lib/types";

interface PacePBsProps {
  bestEfforts: BestEffort[];
  longestRun: { distance: number; activityId: string; activityName: string; activityDate?: string } | null;
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

  const handleCardClick = (activityId?: string) => {
    if (activityId && onActivitySelect) {
      onActivitySelect(activityId);
    }
  };

  return (
    <div className="bg-[#1e1535] rounded-xl border border-[#3d2b5a] p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {bestEfforts.map((effort) => (
          <div
            key={effort.label}
            className={`bg-[#2a1f3d] rounded-lg p-3 ${effort.activityId && onActivitySelect ? "cursor-pointer active:bg-[#3d2b5a] transition-colors" : ""}`}
            onClick={() => { handleCardClick(effort.activityId); }}
          >
            <div className="text-xs text-[#b8a5d4] uppercase">{effort.label}</div>
            <div className="text-lg font-bold text-white">
              {formatTime(effort.timeSeconds)}
            </div>
            <div className="text-xs text-[#8b7ba8]">
              {formatPace(effort.pace)}/km
            </div>
          </div>
        ))}
        {longestRun && (
          <div
            className={`bg-[#2a1f3d] rounded-lg p-3 ${onActivitySelect ? "cursor-pointer active:bg-[#3d2b5a] transition-colors" : ""}`}
            onClick={() => { handleCardClick(longestRun.activityId); }}
          >
            <div className="text-xs text-[#b8a5d4] uppercase">Longest Run</div>
            <div className="text-lg font-bold text-white">
              {formatDistance(longestRun.distance)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
