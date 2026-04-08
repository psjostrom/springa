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

/** Format seconds as goal time display: "H:MM" for >=1h, "MM:SS" for <1h. */
export function formatGoalTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Convert empty string / undefined to null. Intervals.icu uses "" for unset text fields. */
export function nonEmpty(v: string | undefined): string | null {
  if (v === undefined || v === "") return null;
  return v;
}
