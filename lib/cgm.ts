// --- Types ---
//
// Direction and delta are computed by the uploader (Strimma) and stored by Scout
// as sent. Springa displays them as they are and never recomputes them.

import { linearRegression } from "./math";

export interface BGReading {
  sgv: number; // mg/dL (raw from Nightscout)
  mmol: number; // converted to mmol/L
  ts: number; // timestamp ms
  direction: string; // as computed by the uploader
  delta: number; // SGV change in mg/dL over ~5 min, as computed by the uploader
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

// --- Trend computation from stored readings ---

export function computeTrend(
  readings: BGReading[],
): { slope: number } | null {
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
  return { slope: Math.round(slopePerMin * 100) / 100 };
}
