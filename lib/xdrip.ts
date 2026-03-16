// --- Types ---
//
// IMPORTANT: xDrip+ companion mode (used when CGM is connected to CamAPS FX
// or similar AID) returns WRONG direction and delta fields. The direction lags
// behind actual sgv changes by 2-3 readings (~10-15 min), measured at a 31%
// mismatch rate across 550 readings. BG can be rising while direction still
// says "FortyFiveDown". See: github.com/NightscoutFoundation/xDrip/issues/3787
//
// We NEVER trust the direction field from xDrip+. On ingestion, we recompute
// direction from adjacent sgv values via recomputeDirections(). The Garmin
// apps (SugarRun, SugarWave) do the same computation on-device.

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
// This function recomputes direction for each reading from adjacent sgv values,
// using mg/dL-per-minute thresholds (derived from SuperStable/xDrip+ values ÷ 5).

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
  for (let i = 0; i < readings.length; i++) {
    if (i === 0) {
      readings[i].direction = "NONE";
      continue;
    }
    const prev = readings[i - 1];
    const curr = readings[i];
    const dtMs = curr.ts - prev.ts;
    if (dtMs <= 0 || dtMs > 600000) {
      // Gap > 10 min or invalid — can't compute reliably
      readings[i].direction = "NONE";
      continue;
    }
    const rawDelta = curr.sgv - prev.sgv;
    const deltaPerMin = rawDelta / (dtMs / 60000);
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
