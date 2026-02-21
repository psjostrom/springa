import type { XdripReading } from "../../xdrip";

/** Generate XdripReading[] at 5-min intervals from a starting timestamp. */
export function makeReadings(
  startMs: number,
  mmolValues: number[],
): XdripReading[] {
  return mmolValues.map((mmol, i) => ({
    sgv: Math.round(mmol * 18.018),
    mmol,
    ts: startMs + i * 5 * 60 * 1000, // 5-min intervals
    direction: "Flat",
  }));
}

/** Add Gaussian noise to a base value. */
function noisy(base: number, stddev: number): number {
  // Box-Muller transform (approximation)
  const u1 = Math.max(0.001, Math.abs(Math.sin(base * 17.3 + stddev * 7.1)));
  const u2 = Math.max(0.001, Math.abs(Math.cos(base * 13.7 + stddev * 3.9)));
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.round((base + z * stddev) * 10) / 10;
}

/** Linearly interpolate between start and end over count steps. */
function interpolate(start: number, end: number, count: number): number[] {
  if (count <= 1) return [start];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return Math.round((start + (end - start) * t) * 10) / 10;
  });
}

// --- Pre-built scenarios ---

/** 2h of readings steady around 10 mmol/L (±0.2 noise) */
export function stableAt10(startMs: number): XdripReading[] {
  const values = Array.from({ length: 24 }, (_, i) => noisy(10, 0.2));
  return makeReadings(startMs, values);
}

/** 2h of readings dropping from 12 to 7 */
export function droppingFrom12(startMs: number): XdripReading[] {
  return makeReadings(startMs, interpolate(12, 7, 24));
}

/** 2h of readings crashing from 10 to 3.5 (hypo) */
export function crashingFrom10(startMs: number): XdripReading[] {
  return makeReadings(startMs, interpolate(10, 3.5, 24));
}

/** 2h of readings rising from 6 to 11 */
export function risingFrom6(startMs: number): XdripReading[] {
  return makeReadings(startMs, interpolate(6, 11, 24));
}

/** 2h of readings bouncing 6-13 randomly */
export function volatile(startMs: number): XdripReading[] {
  const values = [
    8, 12, 6, 13, 7, 11, 6.5, 12.5, 7.5, 10, 6, 13, 8, 11, 7, 12, 6, 13, 9,
    10, 7.5, 12, 6.5, 11,
  ];
  return makeReadings(startMs, values);
}

/** Only 3 readings in 2h (sensor warmup gaps) */
export function sparse(startMs: number): XdripReading[] {
  return [
    { sgv: 180, mmol: 10.0, ts: startMs, direction: "Flat" },
    {
      sgv: 162,
      mmol: 9.0,
      ts: startMs + 60 * 60 * 1000,
      direction: "Flat",
    },
    {
      sgv: 144,
      mmol: 8.0,
      ts: startMs + 2 * 60 * 60 * 1000,
      direction: "Flat",
    },
  ];
}

/** No readings */
export function empty(): XdripReading[] {
  return [];
}

export const SCENARIOS = {
  stableAt10,
  droppingFrom12,
  crashingFrom10,
  risingFrom6,
  volatile,
  sparse,
  empty,
};
