import type { ZoneName, PaceTable, ZonePaceEntry } from "./types";
import { FALLBACK_PACE_TABLE } from "./constants";

// Prescription labels — plain language for workout cards ("Easy", "Race Pace").
// Distinct from ZONE_DISPLAY_NAMES in constants.ts which are analysis labels
// ("Endurance", "Tempo") shown in zone charts and settings.
const ZONE_LABELS: Record<ZoneName, string> = {
  z1: "Recovery",
  z2: "Easy",
  z3: "Race Pace",
  z4: "Interval",
  z5: "Hard",
};

export function getZoneLabel(zone: ZoneName): string {
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

/** Format seconds for zone time display: "45s", "2m 15s", "1h30m". */
export function formatZoneTime(seconds: number): string {
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

/** Returns data-driven entry or falls back to hardcoded values */
export function getPaceForZone(
  table: PaceTable,
  zone: ZoneName,
): ZonePaceEntry {
  return table[zone] ?? FALLBACK_PACE_TABLE[zone] ?? { zone, avgPace: 7.25, sampleCount: 0 };
}

/** Extract numeric event ID from prefixed string (e.g. "event-1002" → 1002). Returns NaN for non-event IDs. */
export function parseEventId(id: string): number {
  return parseInt(id.replace("event-", ""), 10);
}

/** Format seconds as goal time display. Always minute precision — no seconds.
 *  >=1h: "H:MM" (e.g., "2:20"). <1h: "MM" (e.g., "27"). */
export function formatGoalTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return String(m);
}

/** Convert empty string / undefined to null. Intervals.icu uses "" for unset text fields. */
export function nonEmpty(v: string | undefined): string | null {
  if (v === undefined || v === "") return null;
  return v;
}
