import type { HRZoneName, DataPoint, IntervalsStream } from "./types";
import { DEFAULT_LTHR } from "./constants";
import { classifyZone } from "./constants";
import { convertGlucoseToMmol } from "./utils";

// --- Types ---

export interface BGObservation {
  zone: HRZoneName;
  bgRate: number; // mmol/L per 10 min
  fuelRate: number | null; // g/h (from the activity's planned fuel), null if unknown
  activityId: string;
  timeMinute: number;
  startBG: number; // activity starting glucose (mmol/L)
  relativeMinute: number; // minutes since activity start
}

export interface ZoneBGResponse {
  zone: HRZoneName;
  avgRate: number; // mmol/L per 10 min (negative = dropping)
  medianRate: number;
  sampleCount: number;
  confidence: "low" | "medium" | "high"; // <10 / 10-30 / 30+
  avgFuelRate: number | null; // null if no activities in this zone had fuel data
}

export interface BGResponseModel {
  zones: Record<HRZoneName, ZoneBGResponse | null>;
  observations: BGObservation[];
  activitiesAnalyzed: number;
  bgByStartLevel: BGBandResponse[];
  bgByTime: TimeBucketResponse[];
  targetFuelRates: TargetFuelResult[];
}

export interface FuelSuggestion {
  zone: HRZoneName;
  currentAvgFuel: number | null; // g/h, null if no fuel data
  suggestedIncrease: number; // g/h
  avgDropRate: number; // mmol/L per 10 min
}

// --- Starting BG Analysis ---

export type BGBand = "<8" | "8-10" | "10-12" | "12+";

export interface BGBandResponse {
  band: BGBand;
  avgRate: number;
  medianRate: number;
  sampleCount: number;
  activityCount: number;
}

export function classifyBGBand(bgMmol: number): BGBand {
  if (bgMmol < 8) return "<8";
  if (bgMmol < 10) return "8-10";
  if (bgMmol < 12) return "10-12";
  return "12+";
}

export function analyzeBGByStartLevel(observations: BGObservation[]): BGBandResponse[] {
  if (observations.length === 0) return [];

  const bands: BGBand[] = ["<8", "8-10", "10-12", "12+"];
  const results: BGBandResponse[] = [];

  for (const band of bands) {
    const obs = observations.filter((o) => classifyBGBand(o.startBG) === band);
    if (obs.length === 0) continue;

    const rates = obs.map((o) => o.bgRate);
    const activityIds = new Set(obs.map((o) => o.activityId));

    results.push({
      band,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      medianRate: median(rates),
      sampleCount: obs.length,
      activityCount: activityIds.size,
    });
  }

  return results;
}

// --- Time Decay Analysis ---

export type TimeBucket = "0-15" | "15-30" | "30-45" | "45+";

export interface TimeBucketResponse {
  bucket: TimeBucket;
  avgRate: number;
  medianRate: number;
  sampleCount: number;
}

export function classifyTimeBucket(relativeMinute: number): TimeBucket {
  if (relativeMinute < 15) return "0-15";
  if (relativeMinute < 30) return "15-30";
  if (relativeMinute < 45) return "30-45";
  return "45+";
}

export function analyzeBGByTime(
  observations: BGObservation[],
  zone?: HRZoneName,
): TimeBucketResponse[] {
  const filtered = zone ? observations.filter((o) => o.zone === zone) : observations;
  if (filtered.length === 0) return [];

  const buckets: TimeBucket[] = ["0-15", "15-30", "30-45", "45+"];
  const results: TimeBucketResponse[] = [];

  for (const bucket of buckets) {
    const obs = filtered.filter((o) => classifyTimeBucket(o.relativeMinute) === bucket);
    if (obs.length === 0) continue;

    const rates = obs.map((o) => o.bgRate);

    results.push({
      bucket,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      medianRate: median(rates),
      sampleCount: obs.length,
    });
  }

  return results;
}

// --- Target Fuel Rate ---

export interface TargetFuelResult {
  zone: HRZoneName;
  targetFuelRate: number;
  currentAvgFuel: number | null;
  method: "regression" | "extrapolation";
  confidence: "low" | "medium" | "high";
}

export function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const p of points) {
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - (slope * p.x + intercept)) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

const EXTRAPOLATION_FACTOR = 12; // g/h per 1.0 mmol/L/10min

export function calculateTargetFuelRates(observations: BGObservation[]): TargetFuelResult[] {
  const zoneNames: HRZoneName[] = ["easy", "steady", "tempo", "hard"];
  const results: TargetFuelResult[] = [];

  for (const zone of zoneNames) {
    const zoneObs = observations.filter((o) => o.zone === zone && o.fuelRate != null);
    if (zoneObs.length === 0) continue;

    const rates = zoneObs.map((o) => o.bgRate);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;

    // Only suggest for zones where BG is dropping
    if (avgRate >= 0) continue;

    const fuels = zoneObs.map((o) => o.fuelRate!);
    const currentAvgFuel = fuels.reduce((a, b) => a + b, 0) / fuels.length;

    // Group by distinct fuel rates
    const fuelGroups = new Map<number, BGObservation[]>();
    for (const obs of zoneObs) {
      const key = obs.fuelRate!;
      const list = fuelGroups.get(key) ?? [];
      list.push(obs);
      fuelGroups.set(key, list);
    }

    // Check if we have 2+ distinct fuel rates with 3+ observations each
    const qualifiedGroups = [...fuelGroups.entries()].filter(([, obs]) => obs.length >= 3);

    if (qualifiedGroups.length >= 2) {
      // Regression: fuel rate (x) vs avg BG rate (y) per group
      const points = qualifiedGroups.map(([fuel, obs]) => {
        const groupRates = obs.map((o) => o.bgRate);
        return { x: fuel, y: groupRates.reduce((a, b) => a + b, 0) / groupRates.length };
      });

      const reg = linearRegression(points);
      // x-intercept: where y = 0 → x = -intercept / slope
      const target = reg.slope !== 0 ? -reg.intercept / reg.slope : currentAvgFuel;
      const confidence = getConfidence(zoneObs.length);

      results.push({
        zone,
        targetFuelRate: Math.max(0, Math.round(target)),
        currentAvgFuel,
        method: "regression",
        confidence,
      });
    } else {
      // Extrapolation: target = current + |avgRate| * factor
      const target = currentAvgFuel + Math.abs(avgRate) * EXTRAPOLATION_FACTOR;
      const confidence = getConfidence(zoneObs.length);

      results.push({
        zone,
        targetFuelRate: Math.max(0, Math.round(target)),
        currentAvgFuel,
        method: "extrapolation",
        confidence,
      });
    }
  }

  return results;
}

// --- Stream alignment ---

/** Align HR and glucose streams by time (1-min resolution, <=1 min tolerance). */
export function alignStreams(
  streams: IntervalsStream[],
): { hr: DataPoint[]; glucose: DataPoint[] } | null {
  let timeData: number[] = [];
  let hrRaw: number[] = [];
  let glucoseRaw: number[] = [];

  for (const s of streams) {
    if (s.type === "time") timeData = s.data;
    if (s.type === "heartrate") hrRaw = s.data;
    if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) {
      glucoseRaw = s.data;
    }
  }

  if (timeData.length === 0 || hrRaw.length === 0 || glucoseRaw.length === 0) {
    return null;
  }

  const glucoseInMmol = convertGlucoseToMmol(glucoseRaw);

  // Build minute-indexed maps
  const hrByMinute = new Map<number, number>();
  const glucoseByMinute = new Map<number, number>();

  for (let i = 0; i < timeData.length; i++) {
    const minute = Math.round(timeData[i] / 60);
    if (i < hrRaw.length && hrRaw[i] > 0) {
      hrByMinute.set(minute, hrRaw[i]);
    }
    if (i < glucoseInMmol.length && glucoseInMmol[i] > 0) {
      glucoseByMinute.set(minute, glucoseInMmol[i]);
    }
  }

  // Find overlapping minutes (tolerance: exact match at minute resolution)
  const hr: DataPoint[] = [];
  const glucose: DataPoint[] = [];

  for (const [minute, hrVal] of hrByMinute) {
    const gVal = glucoseByMinute.get(minute)
      ?? glucoseByMinute.get(minute - 1)
      ?? glucoseByMinute.get(minute + 1);
    if (gVal != null) {
      hr.push({ time: minute, value: hrVal });
      glucose.push({ time: minute, value: gVal });
    }
  }

  // Sort by time
  hr.sort((a, b) => a.time - b.time);
  glucose.sort((a, b) => a.time - b.time);

  if (hr.length < 7) return null; // Need at least 5min window + margins

  return { hr, glucose };
}

// --- Window extraction ---

const WINDOW_SIZE = 5; // minutes
const SKIP_START = 5; // skip first 5 minutes
const SKIP_END = 2; // skip last 2 minutes

/** Extract BG observations from aligned HR + glucose streams. */
export function extractObservations(
  hr: DataPoint[],
  glucose: DataPoint[],
  lthr: number,
  activityId: string,
  fuelRate: number | null,
  startBG: number,
): BGObservation[] {
  if (hr.length < WINDOW_SIZE) return [];

  const observations: BGObservation[] = [];
  const startTime = hr[0].time + SKIP_START;
  const endTime = hr[hr.length - 1].time - SKIP_END;

  // Build lookup maps for fast access
  const hrMap = new Map(hr.map((p) => [p.time, p.value]));
  const gMap = new Map(glucose.map((p) => [p.time, p.value]));

  for (let t = startTime; t <= endTime - WINDOW_SIZE; t++) {
    // Collect HR values in this window
    const windowHR: number[] = [];
    let gStart: number | null = null;
    let gEnd: number | null = null;

    for (let m = t; m < t + WINDOW_SIZE; m++) {
      const h = hrMap.get(m);
      if (h != null) windowHR.push(h);
      const g = gMap.get(m);
      if (g != null) {
        if (gStart == null) gStart = g;
        gEnd = g;
      }
    }

    // Need sufficient data points
    if (windowHR.length < 3 || gStart == null || gEnd == null) continue;

    const avgHR = windowHR.reduce((a, b) => a + b, 0) / windowHR.length;
    const lthrPercent = (avgHR / lthr) * 100;
    const zone = classifyZone(lthrPercent);

    // BG slope: (end - start) / windowMin * 10 → mmol/L per 10 min
    const bgRate = ((gEnd - gStart) / WINDOW_SIZE) * 10;

    observations.push({
      zone,
      bgRate,
      fuelRate,
      activityId,
      timeMinute: t,
      startBG,
      relativeMinute: t - hr[0].time,
    });
  }

  return observations;
}

// --- Aggregation ---

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function getConfidence(count: number): "low" | "medium" | "high" {
  if (count >= 30) return "high";
  if (count >= 10) return "medium";
  return "low";
}

/** Build BG response model from activity streams. */
export function buildBGModel(
  activitiesData: Array<{
    streams: IntervalsStream[];
    activityId: string;
    fuelRate: number | null; // g/h, null if unknown
  }>,
  lthr: number = DEFAULT_LTHR,
): BGResponseModel {
  const allObservations: BGObservation[] = [];
  let analyzed = 0;

  for (const { streams, activityId, fuelRate } of activitiesData) {
    const aligned = alignStreams(streams);
    if (!aligned) continue;

    const startBG = aligned.glucose[0].value;

    const obs = extractObservations(
      aligned.hr,
      aligned.glucose,
      lthr,
      activityId,
      fuelRate,
      startBG,
    );

    if (obs.length > 0) {
      allObservations.push(...obs);
      analyzed++;
    }
  }

  const zones: Record<HRZoneName, ZoneBGResponse | null> = {
    easy: null,
    steady: null,
    tempo: null,
    hard: null,
  };

  const zoneNames: HRZoneName[] = ["easy", "steady", "tempo", "hard"];

  for (const zone of zoneNames) {
    const zoneObs = allObservations.filter((o) => o.zone === zone);
    if (zoneObs.length === 0) continue;

    const rates = zoneObs.map((o) => o.bgRate);
    const fuels = zoneObs.map((o) => o.fuelRate).filter((f): f is number => f != null);

    zones[zone] = {
      zone,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      medianRate: median(rates),
      sampleCount: zoneObs.length,
      confidence: getConfidence(zoneObs.length),
      avgFuelRate: fuels.length > 0 ? fuels.reduce((a, b) => a + b, 0) / fuels.length : null,
    };
  }

  return {
    zones,
    observations: allObservations,
    activitiesAnalyzed: analyzed,
    bgByStartLevel: analyzeBGByStartLevel(allObservations),
    bgByTime: analyzeBGByTime(allObservations),
    targetFuelRates: calculateTargetFuelRates(allObservations),
  };
}

// --- Fuel suggestions ---

const DROP_THRESHOLD = -1.0; // mmol/L per 10 min — suggest fuel increase beyond this
const FUEL_INCREASE_PER_HALF = 6; // +6 g/h per 0.5 mmol/L/10min excess drop

/** Suggest fuel adjustments for zones with excessive BG drops. */
export function suggestFuelAdjustments(model: BGResponseModel): FuelSuggestion[] {
  const suggestions: FuelSuggestion[] = [];

  for (const [, response] of Object.entries(model.zones)) {
    if (!response) continue;
    if (response.avgRate >= DROP_THRESHOLD) continue;

    const excessDrop = Math.abs(response.avgRate) - Math.abs(DROP_THRESHOLD);
    const suggestedIncrease = Math.ceil(excessDrop / 0.5) * FUEL_INCREASE_PER_HALF;

    suggestions.push({
      zone: response.zone,
      currentAvgFuel: response.avgFuelRate,
      suggestedIncrease,
      avgDropRate: response.avgRate,
    });
  }

  return suggestions;
}
