// --- Types ---
//
// IMPORTANT: xDrip+ companion mode (used when CGM is connected to CamAPS FX
// or similar AID) returns WRONG direction and delta fields. The direction lags
// behind actual sgv changes by 2-3 readings (~10-15 min), measured at a 31%
// mismatch rate across 550 readings. BG can be rising while direction still
// says "FortyFiveDown". See: github.com/NightscoutFoundation/xDrip/issues/3787
//
// We NEVER trust the direction field from xDrip+. On ingestion, we recompute
// direction from 3-point averaged sgv values ~5 min apart via
// recomputeDirections(). The Garmin apps (SugarRun, SugarWave) do the same
// computation on-device.

import { MGDL_TO_MMOL } from "./constants";
import { linearRegression } from "./math";

export interface XdripReading {
  sgv: number; // mg/dL (raw from Nightscout)
  mmol: number; // converted to mmol/L
  ts: number; // timestamp ms
  direction: string; // recomputed from sgv — NOT from xDrip+ API
}

// --- Nightscout direction → arrow ---

const DIRECTION_ARROWS: Record<string, string> = {
  DoubleUp: "⇈",
  SingleUp: "↑",
  FortyFiveUp: "↗",
  Flat: "→",
  FortyFiveDown: "↘",
  SingleDown: "↓",
  DoubleDown: "⇊",
  "NOT COMPUTABLE": "?",
  "RATE OUT OF RANGE": "⚠",
};

export function trendArrow(direction: string): string {
  return DIRECTION_ARROWS[direction] ?? "?";
}

/** Derive arrow directly from slope (mmol/L per min) — always consistent. */
export function slopeToArrow(slopePerMin: number): string {
  const deltaMgdlPerMin = slopePerMin * MGDL_TO_MMOL;
  return trendArrow(directionFromDelta(deltaMgdlPerMin));
}

// --- Parse Nightscout entries ---

function isValidEntry(
  e: unknown,
): e is { sgv: number; date?: number; dateString?: string; direction?: string } {
  if (typeof e !== "object" || e === null) return false;
  const obj = e as Record<string, unknown>;
  return typeof obj.sgv === "number" && obj.sgv > 0;
}

export function parseNightscoutEntries(body: unknown): XdripReading[] {
  const arr = Array.isArray(body) ? body : [body];
  const readings: XdripReading[] = [];

  for (const entry of arr) {
    if (!isValidEntry(entry)) continue;

    const rawTs =
      typeof entry.date === "number"
        ? entry.date
        : typeof entry.dateString === "string"
          ? new Date(entry.dateString).getTime()
          : Date.now();

    if (isNaN(rawTs)) continue;

    const ts = rawTs;

    readings.push({
      sgv: entry.sgv,
      mmol: Math.round((entry.sgv / MGDL_TO_MMOL) * 10) / 10,
      ts,
      direction: entry.direction ?? "NONE",
    });
  }

  return readings;
}

// --- Recompute direction from sgv values ---
// xDrip+ companion mode returns stale/wrong direction fields (~31% error rate).
// See: https://github.com/NightscoutFoundation/xDrip/issues/3787
// Recomputes direction using 3-point averaged sgv values ~5 min apart to reduce
// per-minute noise. Thresholds in mg/dL per minute (SuperStable/xDrip+ values ÷ 5).

function directionFromDelta(deltaMgdlPerMin: number): string {
  if (deltaMgdlPerMin <= -3.5) return "DoubleDown";
  if (deltaMgdlPerMin <= -2.0) return "SingleDown";
  if (deltaMgdlPerMin <= -1.0) return "FortyFiveDown";
  if (deltaMgdlPerMin <= 1.0) return "Flat";
  if (deltaMgdlPerMin <= 2.0) return "FortyFiveUp";
  if (deltaMgdlPerMin <= 3.5) return "SingleUp";
  return "DoubleUp";
}

export function recomputeDirections(readings: XdripReading[]): void {
  const WINDOW_MS = 5 * 60 * 1000;

  // Average sgv of readings[idx-1..idx+1] (clamped to array bounds)
  const avgSgv = (idx: number) => {
    const lo = Math.max(0, idx - 1);
    const hi = Math.min(readings.length - 1, idx + 1);
    let sum = 0, count = 0;
    for (let j = lo; j <= hi; j++) { sum += readings[j].sgv; count++; }
    return sum / count;
  };

  for (let i = 0; i < readings.length; i++) {
    const curr = readings[i];

    // Find reading closest to 5 min before current
    let pastIdx: number | null = null;
    const targetTs = curr.ts - WINDOW_MS;
    for (let j = i - 1; j >= 0; j--) {
      if (readings[j].ts <= targetTs) {
        const next = j + 1 < i ? j + 1 : null;
        pastIdx = next != null && Math.abs(readings[next].ts - targetTs) < Math.abs(readings[j].ts - targetTs) ? next : j;
        break;
      }
    }

    if (pastIdx === null || curr.ts - readings[pastIdx].ts > 600000) {
      readings[i].direction = "NONE";
      continue;
    }

    const dtMin = (curr.ts - readings[pastIdx].ts) / 60000;
    if (dtMin <= 0) { readings[i].direction = "NONE"; continue; }

    const deltaPerMin = (avgSgv(i) - avgSgv(pastIdx)) / dtMin;
    readings[i].direction = directionFromDelta(deltaPerMin);
  }
}

// --- Trend computation from stored readings ---

export function computeTrend(
  readings: XdripReading[],
): { slope: number; direction: string } | null {
  if (readings.length < 2) return null;

  // Use last 30 minutes of readings
  const now = readings[readings.length - 1].ts;
  const cutoff = now - 30 * 60 * 1000;
  const recent = readings.filter((r) => r.ts >= cutoff);

  if (recent.length < 2) return null;

  // Linear regression: time (minutes) vs mmol/L
  const first = recent[0];
  const points = recent.map((r) => ({
    x: (r.ts - first.ts) / 60000, // minutes
    y: r.mmol,
  }));

  const { slope: slopePerMin } = linearRegression(points);
  const slopeRounded = Math.round(slopePerMin * 100) / 100;

  const deltaMgdlPerMin = slopeRounded * MGDL_TO_MMOL;
  const direction = directionFromDelta(deltaMgdlPerMin);

  return { slope: slopeRounded, direction };
}
