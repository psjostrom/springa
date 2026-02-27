import type { HRZoneName, PaceTable, ZonePaceEntry } from "./types";
import { FALLBACK_PACE_TABLE } from "./constants";

const ZONE_LABELS: Record<HRZoneName, string> = {
  easy: "Easy",
  steady: "Race Pace",
  tempo: "Interval",
  hard: "Hard",
};

export function getZoneLabel(zone: HRZoneName): string {
  return ZONE_LABELS[zone];
}

/** Format decimal pace (e.g. 6.15) as "6:09" */
export function formatPace(paceMinPerKm: number): string {
  const totalSeconds = Math.round(paceMinPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Format seconds as "Xh Ym" or "Ym". */
export function formatDuration(seconds: number): string {
  const secs = Math.round(seconds % 60);
  const totalMins = Math.floor(seconds / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/** Returns data-driven entry or falls back to hardcoded values */
export function getPaceForZone(
  table: PaceTable,
  zone: HRZoneName,
): ZonePaceEntry {
  return table[zone] ?? FALLBACK_PACE_TABLE[zone] ?? { zone, avgPace: 7.25, sampleCount: 0 };
}

/** Extract numeric event ID from prefixed string (e.g. "event-1002" → 1002). Returns NaN for non-event IDs. */
export function parseEventId(id: string): number {
  return parseInt(id.replace("event-", ""), 10);
}
