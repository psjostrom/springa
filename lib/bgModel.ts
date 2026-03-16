import type { WorkoutCategory, DataPoint } from "./types";
import type { EnrichedActivity } from "./activityStreamsDb";
import { linearRegression } from "./math";
import { extractObservations, MIN_ALIGNED_POINTS } from "./bgObservations";
import { extractPostRunSpikes, type PostRunSpikeData } from "./postRunSpike";

// --- Types ---

export interface BGObservation {
  category: WorkoutCategory;
  bgRate: number; // mmol/L per min
  fuelRate: number | null; // g/h (from the activity's planned fuel), null if unknown
  activityId: string;
  timeMinute: number;
  startBG: number; // activity starting glucose (mmol/L)
  relativeMinute: number; // minutes since activity start
  entrySlope: number | null; // mmol/L per min pre-workout trend, null if insufficient data
}

export interface CategoryBGResponse {
  category: WorkoutCategory;
  avgRate: number; // mmol/L per min (negative = dropping)
  medianRate: number;
  sampleCount: number;
  confidence: "low" | "medium" | "high"; // <10 / 10-30 / 30+
  avgFuelRate: number | null; // null if no activities in this category had fuel data
  activityCount: number;
  maxDurationMin: number; // longest activity duration in minutes for this category
}

export interface BGResponseModel {
  categories: Record<WorkoutCategory, CategoryBGResponse | null>;
  observations: BGObservation[];
  activitiesAnalyzed: number;
  bgByStartLevel: BGBandResponse[];
  bgByEntrySlope: EntrySlopeResponse[];
  bgByTime: TimeBucketResponse[];
  targetFuelRates: TargetFuelResult[];
}

export interface FuelSuggestion {
  category: WorkoutCategory;
  currentAvgFuel: number | null; // g/h, null if no fuel data
  suggestedIncrease: number; // g/h
  avgDropRate: number; // mmol/L per min
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

// --- Entry Slope (Pre-Workout BG Trend) ---

export type EntrySlope = "crashing" | "dropping" | "stable" | "rising";

export interface EntrySlopeResponse {
  slope: EntrySlope;
  avgRate: number;
  medianRate: number;
  sampleCount: number;
  activityCount: number;
}

const SKIP_START = 5; // minutes — used by computeEntrySlope

/** Compute BG rate of change from glucose points in the first SKIP_START minutes.
 *  Uses linear regression to smooth out single-reading noise.
 *  Returns mmol/L per min. Null if fewer than 2 points in that window. */
export function computeEntrySlope(glucose: DataPoint[]): number | null {
  const entryPoints = glucose.filter((p) => p.time < SKIP_START);
  if (entryPoints.length < 2) return null;

  const first = entryPoints[0];
  const last = entryPoints[entryPoints.length - 1];
  if (last.time - first.time <= 0) return null;

  const points = entryPoints.map((p) => ({ x: p.time - first.time, y: p.value }));
  return linearRegression(points).slope;
}

export function classifyEntrySlope(slope: number): EntrySlope {
  if (slope < -0.1) return "crashing";
  if (slope < -0.03) return "dropping";
  if (slope <= 0.03) return "stable";
  return "rising";
}

export function analyzeBGByEntrySlope(observations: BGObservation[]): EntrySlopeResponse[] {
  const withSlope = observations.filter((o) => o.entrySlope != null);
  if (withSlope.length === 0) return [];

  const slopeNames: EntrySlope[] = ["crashing", "dropping", "stable", "rising"];
  const results: EntrySlopeResponse[] = [];

  for (const slope of slopeNames) {
    const obs = withSlope.filter((o) => o.entrySlope != null && classifyEntrySlope(o.entrySlope) === slope);
    if (obs.length === 0) continue;

    const rates = obs.map((o) => o.bgRate);
    const activityIds = new Set(obs.map((o) => o.activityId));

    results.push({
      slope,
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
  category?: WorkoutCategory,
): TimeBucketResponse[] {
  const filtered = category ? observations.filter((o) => o.category === category) : observations;
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
  category: WorkoutCategory;
  targetFuelRate: number;
  currentAvgFuel: number | null;
  method: "regression" | "extrapolation";
  confidence: "low" | "medium" | "high";
  spikeAdjustment: number | null;
}

const EXTRAPOLATION_FACTOR = 60; // g/h per 1.0 mmol/L/min excess drop
const ACCEPTABLE_DROP = -0.02; // mmol/L per min — a mild drop is normal during running
const MIN_DROP_TO_SUGGEST = -0.05; // only suggest fuel increases beyond this threshold
const MAX_FUEL_MULTIPLIER = 1.5; // cap target at 1.5× current fuel
const MAX_FUEL_ABSOLUTE = 90; // absolute ceiling in g/h
const ACCEPTABLE_SPIKE = 2.0; // mmol/L post-run 30m peak above end BG
const SPIKE_PENALTY_FACTOR = 4; // g/h per 1.0 mmol/L excess spike
const MIN_POST_RUN_OBS = 5;
const MIN_FUEL_RATE = 20; // g/h safety floor

function capFuel(target: number, current: number): number {
  const upperBound = current > 0
    ? Math.min(current * MAX_FUEL_MULTIPLIER, MAX_FUEL_ABSOLUTE)
    : MAX_FUEL_ABSOLUTE;
  return Math.max(0, Math.round(Math.min(target, upperBound)));
}

export function calculateTargetFuelRates(
  observations: BGObservation[],
  spikeData?: PostRunSpikeData[],
): TargetFuelResult[] {
  const categoryNames: WorkoutCategory[] = ["easy", "long", "interval"];
  const results: TargetFuelResult[] = [];

  for (const category of categoryNames) {
    const catObs = observations.filter((o) => o.category === category && o.fuelRate != null);
    if (catObs.length === 0) continue;

    const rates = catObs.map((o) => o.bgRate);
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;

    // Only suggest for categories where BG is dropping meaningfully
    if (avgRate >= MIN_DROP_TO_SUGGEST) continue;

    const fuels = catObs.map((o) => o.fuelRate ?? 0);
    const currentAvgFuel = fuels.reduce((a, b) => a + b, 0) / fuels.length;

    // Group by distinct fuel rates
    const fuelGroups = new Map<number, BGObservation[]>();
    for (const obs of catObs) {
      const key = obs.fuelRate ?? 0;
      const list = fuelGroups.get(key) ?? [];
      list.push(obs);
      fuelGroups.set(key, list);
    }

    // Check if we have 2+ distinct fuel rates with 3+ observations each
    const qualifiedGroups = [...fuelGroups.entries()].filter(([, obs]) => obs.length >= 3);

    let target: number;
    let method: "regression" | "extrapolation";
    const confidence = getConfidence(catObs.length);

    if (qualifiedGroups.length >= 2) {
      // Regression: fuel rate (x) vs avg BG rate (y) per group
      const points = qualifiedGroups.map(([fuel, obs]) => {
        const groupRates = obs.map((o) => o.bgRate);
        return { x: fuel, y: groupRates.reduce((a, b) => a + b, 0) / groupRates.length };
      });

      const reg = linearRegression(points);
      // Solve for y = ACCEPTABLE_DROP → x = (ACCEPTABLE_DROP - intercept) / slope
      target = reg.slope > 0
        ? (ACCEPTABLE_DROP - reg.intercept) / reg.slope
        : currentAvgFuel;
      method = "regression";
    } else {
      // Extrapolation: only compensate for the excess drop beyond acceptable
      const excessDrop = Math.abs(avgRate) - Math.abs(ACCEPTABLE_DROP);
      target = currentAvgFuel + excessDrop * EXTRAPOLATION_FACTOR;
      method = "extrapolation";
    }

    // Apply spike penalty from the fuel-rate group closest to the computed target.
    // Per-group averaging prevents old high-rate runs from inflating the spike
    // after the model has already reduced the target — required for convergence.
    let spikeAdjustment: number | null = null;
    if (spikeData) {
      const catSpikes = spikeData.filter((s) => s.category === category);
      if (catSpikes.length >= MIN_POST_RUN_OBS) {
        // Group spikes by fuel rate
        const spikeGroups = new Map<number, number[]>();
        for (const s of catSpikes) {
          const key = s.fuelRate ?? 0;
          const list = spikeGroups.get(key) ?? [];
          list.push(s.spike30m);
          spikeGroups.set(key, list);
        }

        // Find group closest to the computed target
        let closestRate = 0;
        let closestDist = Infinity;
        for (const rate of spikeGroups.keys()) {
          const dist = Math.abs(rate - target);
          if (dist < closestDist) {
            closestDist = dist;
            closestRate = rate;
          }
        }

        const groupSpikes = spikeGroups.get(closestRate);
        if (groupSpikes && groupSpikes.length >= MIN_POST_RUN_OBS) {
          const avgSpike = groupSpikes.reduce((a, b) => a + b, 0) / groupSpikes.length;
          if (avgSpike > ACCEPTABLE_SPIKE) {
            const penalty = (avgSpike - ACCEPTABLE_SPIKE) * SPIKE_PENALTY_FACTOR;
            spikeAdjustment = Math.round(penalty);
            target = target - penalty;
          }
        }
      }
    }

    results.push({
      category,
      targetFuelRate: Math.max(capFuel(target, currentAvgFuel), MIN_FUEL_RATE),
      currentAvgFuel,
      method,
      confidence,
      spikeAdjustment,
    });
  }

  return results;
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

/** Build BG response model from cached aligned data. */
export function buildBGModelFromCached(cached: EnrichedActivity[]): BGResponseModel {
  const allObservations: BGObservation[] = [];
  const activityDurations = new Map<string, { category: WorkoutCategory; durationMin: number }>();
  let analyzed = 0;

  for (const act of cached) {
    const { hr, glucose, activityId, fuelRate, category } = act;
    if (hr.length < MIN_ALIGNED_POINTS || !glucose?.length) continue;

    const startBG = glucose[0].value;
    const entrySlope = act.runBGContext?.pre?.entrySlope30m
      ?? computeEntrySlope(glucose);
    const obs = extractObservations(hr, glucose, activityId, fuelRate, startBG, category, entrySlope);
    if (obs.length > 0) {
      allObservations.push(...obs);
      activityDurations.set(activityId, {
        category,
        durationMin: hr[hr.length - 1].time - hr[0].time,
      });
      analyzed++;
    }
  }

  const spikeData = extractPostRunSpikes(cached);
  return aggregateModel(allObservations, analyzed, activityDurations, spikeData);
}

/** Aggregate observations into a full BGResponseModel. */
function aggregateModel(
  observations: BGObservation[],
  activitiesAnalyzed: number,
  activityDurations?: Map<string, { category: WorkoutCategory; durationMin: number }>,
  spikeData?: PostRunSpikeData[],
): BGResponseModel {
  const categories: Record<WorkoutCategory, CategoryBGResponse | null> = {
    easy: null,
    long: null,
    interval: null,
  };

  const categoryNames: WorkoutCategory[] = ["easy", "long", "interval"];

  for (const cat of categoryNames) {
    const catObs = observations.filter((o) => o.category === cat);
    if (catObs.length === 0) continue;

    const rates = catObs.map((o) => o.bgRate);
    const fuels = catObs.map((o) => o.fuelRate).filter((f): f is number => f != null);
    const activityIds = new Set(catObs.map((o) => o.activityId));

    // Max activity duration from HR streams; fall back to max relativeMinute from observations
    let maxDurationMin = 0;
    if (activityDurations) {
      for (const id of activityIds) {
        const dur = activityDurations.get(id);
        if (dur && dur.durationMin > maxDurationMin) maxDurationMin = dur.durationMin;
      }
    }
    if (maxDurationMin === 0) {
      maxDurationMin = Math.max(...catObs.map((o) => o.relativeMinute));
    }

    categories[cat] = {
      category: cat,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      medianRate: median(rates),
      sampleCount: catObs.length,
      confidence: getConfidence(catObs.length),
      avgFuelRate: fuels.length > 0 ? fuels.reduce((a, b) => a + b, 0) / fuels.length : null,
      activityCount: activityIds.size,
      maxDurationMin,
    };
  }

  return {
    categories,
    observations,
    activitiesAnalyzed,
    bgByStartLevel: analyzeBGByStartLevel(observations),
    bgByEntrySlope: analyzeBGByEntrySlope(observations),
    bgByTime: analyzeBGByTime(observations),
    targetFuelRates: calculateTargetFuelRates(observations, spikeData),
  };
}

// --- Fuel suggestions ---

const DROP_THRESHOLD = -0.1; // mmol/L per min — suggest fuel increase beyond this
const FUEL_INCREASE_PER_HALF = 6; // +6 g/h per 0.05 mmol/L/min excess drop

/** Suggest fuel adjustments for categories with excessive BG drops. */
export function suggestFuelAdjustments(model: BGResponseModel): FuelSuggestion[] {
  const suggestions: FuelSuggestion[] = [];

  for (const [, response] of Object.entries(model.categories)) {
    if (!response) continue;
    if (response.avgRate >= DROP_THRESHOLD) continue;

    const excessDrop = Math.abs(response.avgRate) - Math.abs(DROP_THRESHOLD);
    const suggestedIncrease = Math.ceil(excessDrop / 0.05) * FUEL_INCREASE_PER_HALF;

    suggestions.push({
      category: response.category,
      currentAvgFuel: response.avgFuelRate,
      suggestedIncrease,
      avgDropRate: response.avgRate,
    });
  }

  return suggestions;
}

/**
 * Summarize a BGResponseModel into a compact text block for AI prompts.
 */
export function summarizeBGModel(bgModel: BGResponseModel | null): string {
  if (!bgModel) return "No BG model data available yet.";

  const lines: string[] = [`Activities analyzed: ${bgModel.activitiesAnalyzed}`];

  for (const cat of ["easy", "long", "interval"] as const) {
    const c = bgModel.categories[cat];
    if (!c) continue;
    lines.push(
      `- ${cat}: avg BG change ${c.avgRate > 0 ? "+" : ""}${c.avgRate.toFixed(2)} mmol/L per min` +
        ` (${c.confidence} confidence, ${c.activityCount} activities)` +
        (c.avgFuelRate != null ? `, avg fuel ${c.avgFuelRate.toFixed(0)}g/h` : ""),
    );
  }

  for (const t of bgModel.targetFuelRates) {
    lines.push(
      `- Suggested fuel for ${t.category}: ${t.targetFuelRate.toFixed(0)}g/h` +
        (t.currentAvgFuel != null ? ` (current avg: ${t.currentAvgFuel.toFixed(0)}g/h)` : "") +
        ` [${t.confidence} confidence, ${t.method}]`,
    );
  }

  if (bgModel.bgByStartLevel.length > 0) {
    lines.push("BG response by starting level:");
    for (const b of bgModel.bgByStartLevel) {
      lines.push(
        `- Start ${b.band} mmol/L: avg ${b.avgRate > 0 ? "+" : ""}${b.avgRate.toFixed(2)} mmol/L per min (${b.activityCount} activities)`,
      );
    }
  }

  if (bgModel.bgByEntrySlope.length > 0) {
    lines.push("BG response by entry slope (pre-run trend):");
    for (const s of bgModel.bgByEntrySlope) {
      lines.push(
        `- Entry ${s.slope}: avg ${s.avgRate > 0 ? "+" : ""}${s.avgRate.toFixed(2)} mmol/L per min (${s.activityCount} activities)`,
      );
    }
  }

  if (bgModel.bgByTime.length > 0) {
    lines.push("BG response by time into run:");
    for (const t of bgModel.bgByTime) {
      lines.push(
        `- ${t.bucket}min: avg ${t.avgRate > 0 ? "+" : ""}${t.avgRate.toFixed(2)} mmol/L per min (${t.sampleCount} samples)`,
      );
    }
  }

  return lines.join("\n");
}
