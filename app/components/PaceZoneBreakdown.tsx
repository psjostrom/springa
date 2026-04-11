"use client";

import { ZONE_COLORS, ZONE_DISPLAY_NAMES, computePaceZones, computePaceZoneTimes, type ZoneKey } from "@/lib/constants";
import type { DataPoint } from "@/lib/types";

interface PaceZoneBreakdownProps {
  paceData: DataPoint[];
  thresholdPace: number; // min/km
}

const ZONES: { key: ZoneKey }[] = [
  { key: "z5" },
  { key: "z4" },
  { key: "z3" },
  { key: "z2" },
  { key: "z1" },
];

function formatTime(seconds: number): string {
  const secs = Math.round(seconds % 60);
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h${remainingMins}m` : `${hours}h`;
  }
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function PaceZoneBreakdown({ paceData, thresholdPace }: PaceZoneBreakdownProps) {
  const paceZones = computePaceZones(thresholdPace);
  const interval = paceData.length >= 2 ? paceData[1].time - paceData[0].time : 1;
  const paceStream = paceData.map((d) => d.value);
  const zoneTimes = computePaceZoneTimes(paceStream, paceZones, interval);

  const total = zoneTimes.z1 + zoneTimes.z2 + zoneTimes.z3 + zoneTimes.z4 + zoneTimes.z5;
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      {ZONES.map(({ key }) => {
        const seconds = zoneTimes[key];
        if (seconds === 0) return null;
        const percentage = (seconds / total) * 100;
        const color = ZONE_COLORS[key];
        const name = ZONE_DISPLAY_NAMES[key];

        return (
          <div key={key} className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-28">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
              <span className="text-sm font-medium" style={{ color }}>
                {key.toUpperCase()} {name}
              </span>
            </div>
            <div className="flex-1 bg-surface-alt rounded-full h-2 overflow-hidden">
              <div
                className="h-full"
                style={{ backgroundColor: color, width: `${percentage}%` }}
              />
            </div>
            <div className="flex items-center gap-2 min-w-28">
              <span className="text-sm font-semibold text-text">
                {formatTime(seconds)}
              </span>
              <span className="text-sm text-muted">
                {percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
