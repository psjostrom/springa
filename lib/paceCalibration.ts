import type { ZoneName, DataPoint, PaceTable } from "./types";
import { classifyHR, FALLBACK_PACE_TABLE } from "./constants";
import { linearRegression } from "./math";

// --- Types ---

export interface ZoneSegment {
  zone: ZoneName;
  avgPace: number; // min/km
  avgHr: number;
  durationMin: number;
  activityId: string;
  activityDate: string;
}

export interface ZoneSummary {
  zone: ZoneName;
  avgPace: number;
  avgHr: number;
  segmentCount: number;
  totalMinutes: number;
}

export interface CalibratedPaceTable {
  table: Record<ZoneName, { pace: number; calibrated: boolean }>;
  segments: ZoneSegment[];
  zoneSummaries: Map<ZoneName, ZoneSummary>;
  hardExtrapolated: boolean;
}

// --- Constants ---

/** Minimum consecutive minutes in same zone to count as a segment. */
const MIN_SEGMENT_MINUTES: Record<ZoneName, number> = {
  z1: 3,
  z2: 3,
  z3: 2,
  z4: 1,
  z5: 1, // unused — z5 is always extrapolated
};

/** Pace bounds (min/km) — reject outliers outside this range. */
const PACE_MIN = 2.0;
const PACE_MAX = 12.0;

// --- Core Functions ---

/**
 * Walk HR + pace streams minute-by-minute, find sustained zone segments.
 * Hard zone segments are intentionally excluded — hard pace is always extrapolated.
 */
export function extractZoneSegments(
  hr: DataPoint[],
  pace: DataPoint[],
  hrZones: number[],
  activityId: string,
  activityDate: string,
): ZoneSegment[] {
  if (hr.length === 0 || pace.length === 0 || hrZones.length !== 5) return [];

  // Build pace lookup by minute
  const paceByMinute = new Map<number, number>();
  for (const p of pace) {
    const minute = Math.round(p.time);
    if (p.value >= PACE_MIN && p.value <= PACE_MAX) {
      paceByMinute.set(minute, p.value);
    }
  }

  // Walk HR stream, classify each minute
  const classified: { minute: number; zone: ZoneName; hr: number }[] = [];
  for (const h of hr) {
    const minute = Math.round(h.time);
    const zone = classifyHR(h.value, hrZones);
    classified.push({ minute, zone, hr: h.value });
  }

  // Sort by minute
  classified.sort((a, b) => a.minute - b.minute);

  // Find consecutive segments in same zone
  const segments: ZoneSegment[] = [];
  let segStart = 0;

  for (let i = 1; i <= classified.length; i++) {
    const sameZone = i < classified.length && classified[i].zone === classified[segStart].zone;
    if (!sameZone) {
      const zone = classified[segStart].zone;
      // Skip z5 — always extrapolated
      if (zone !== "z5") {
        const segEntries = classified.slice(segStart, i);
        const durationMin = segEntries.length;
        const minDuration = MIN_SEGMENT_MINUTES[zone];

        if (durationMin >= minDuration) {
          // Collect pace values for this segment
          const paces: number[] = [];
          let hrSum = 0;
          for (const entry of segEntries) {
            const p = paceByMinute.get(entry.minute);
            if (p != null) paces.push(p);
            hrSum += entry.hr;
          }

          if (paces.length > 0) {
            segments.push({
              zone,
              avgPace: paces.reduce((a, b) => a + b, 0) / paces.length,
              avgHr: hrSum / segEntries.length,
              durationMin,
              activityId,
              activityDate,
            });
          }
        }
      }
      segStart = i;
    }
  }

  return segments;
}

/**
 * Aggregate segments into a calibrated pace table.
 * Duration-weighted average per zone. Hard is extrapolated via linear regression.
 */
export function buildCalibratedPaceTable(
  segments: ZoneSegment[],
): CalibratedPaceTable {
  const zones: ZoneName[] = ["z1", "z2", "z3", "z4", "z5"];
  const summaries = new Map<ZoneName, ZoneSummary>();
  const table = {} as CalibratedPaceTable["table"];
  let hardExtrapolated = false;

  // Compute duration-weighted average pace per zone (excluding z5)
  for (const zone of zones) {
    if (zone === "z5") continue;
    const zoneSegs = segments.filter((s) => s.zone === zone);
    if (zoneSegs.length === 0) continue;

    let totalWeightedPace = 0;
    let totalWeightedHr = 0;
    let totalMinutes = 0;

    for (const seg of zoneSegs) {
      totalWeightedPace += seg.avgPace * seg.durationMin;
      totalWeightedHr += seg.avgHr * seg.durationMin;
      totalMinutes += seg.durationMin;
    }

    summaries.set(zone, {
      zone,
      avgPace: totalWeightedPace / totalMinutes,
      avgHr: totalWeightedHr / totalMinutes,
      segmentCount: zoneSegs.length,
      totalMinutes,
    });
  }

  // Set calibrated paces or fallback for z1-z4
  for (const zone of ["z1", "z2", "z3", "z4"] as ZoneName[]) {
    const summary = summaries.get(zone);
    if (summary) {
      table[zone] = { pace: summary.avgPace, calibrated: true };
    } else {
      const fb = FALLBACK_PACE_TABLE[zone];
      table[zone] = { pace: fb ? fb.avgPace : 6.0, calibrated: false };
    }
  }

  // Extrapolate z5 via linear regression on calibrated zones
  const regressionPoints: { x: number; y: number }[] = [];
  // x = zone index (0=z2, 1=z3, 2=z4), y = pace
  const calibratedZones: ZoneName[] = ["z2", "z3", "z4"];
  for (let i = 0; i < calibratedZones.length; i++) {
    const summary = summaries.get(calibratedZones[i]);
    if (summary) {
      regressionPoints.push({ x: i, y: summary.avgPace });
    }
  }

  if (regressionPoints.length >= 2) {
    const reg = linearRegression(regressionPoints);
    // Extrapolate to x=3 (z5)
    const hardPace = reg.intercept + reg.slope * 3;
    // Clamp to reasonable range
    const clampedHard = Math.max(PACE_MIN, Math.min(PACE_MAX, hardPace));
    table.z5 = { pace: clampedHard, calibrated: true };
    hardExtrapolated = true;
  } else {
    const fb = FALLBACK_PACE_TABLE.z5;
    table.z5 = { pace: fb ? fb.avgPace : 4.75, calibrated: false };
  }

  return { table, segments, zoneSummaries: summaries, hardExtrapolated };
}

/**
 * Filter outliers using IQR method.
 * Returns indices of non-outlier values.
 */
function filterOutliersIQR(values: number[]): Set<number> {
  if (values.length < 4) return new Set(values.map((_, i) => i));

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  const validIndices = new Set<number>();
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= lower && values[i] <= upper) {
      validIndices.add(i);
    }
  }
  return validIndices;
}

/**
 * Compute pace trend for a specific zone over time.
 * Returns pace change per day (negative = getting faster).
 * Returns null if insufficient data.
 */
export function computeZonePaceTrend(
  segments: ZoneSegment[],
  zone: ZoneName,
  windowDays = 90,
  baselineMs?: number,
): number | null {
  const MIN_SEGMENTS = 6;
  const zoneSegs = segments.filter((s) => s.zone === zone && s.activityDate);
  if (zoneSegs.length < MIN_SEGMENTS) return null;

  // Parse dates and filter to window (and baseline if set)
  const now = Date.now();
  const windowCutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const cutoff = baselineMs ? Math.max(windowCutoff, baselineMs) : windowCutoff;

  const dated = zoneSegs
    .map((s) => ({ ...s, dateMs: new Date(s.activityDate).getTime() }))
    .filter((s) => s.dateMs >= cutoff && !isNaN(s.dateMs))
    .sort((a, b) => a.dateMs - b.dateMs);

  if (dated.length < MIN_SEGMENTS) return null;

  // Filter pace outliers using IQR
  const paces = dated.map((s) => s.avgPace);
  const validIndices = filterOutliersIQR(paces);
  const filtered = dated.filter((_, i) => validIndices.has(i));

  if (filtered.length < MIN_SEGMENTS) return null;

  // Linear regression: x = days since first, y = pace
  const firstDay = filtered[0].dateMs;
  const points = filtered.map((s) => ({
    x: (s.dateMs - firstDay) / (24 * 60 * 60 * 1000),
    y: s.avgPace,
  }));

  const reg = linearRegression(points);

  // Only report trend if there's enough time span (at least 14 days)
  const spanDays = (filtered[filtered.length - 1].dateMs - firstDay) / (24 * 60 * 60 * 1000);
  if (spanDays < 14) return null;

  return reg.slope; // min/km per day — negative means getting faster
}

/**
 * Convert CalibratedPaceTable into a PaceTable compatible with getPaceForZone().
 * Calibrated zones get real data; uncalibrated zones fall back to FALLBACK_PACE_TABLE.
 */
export function toPaceTable(calibration: CalibratedPaceTable): PaceTable {
  const zones: ZoneName[] = ["z1", "z2", "z3", "z4", "z5"];
  const result = {} as PaceTable;
  for (const zone of zones) {
    const entry = calibration.table[zone];
    const summary = calibration.zoneSummaries.get(zone);
    if (entry.calibrated) {
      result[zone] = {
        zone,
        avgPace: entry.pace,
        sampleCount: summary?.segmentCount ?? 0,
        avgHr: summary ? Math.round(summary.avgHr) : undefined,
      };
    } else {
      result[zone] = FALLBACK_PACE_TABLE[zone];
    }
  }
  return result;
}
