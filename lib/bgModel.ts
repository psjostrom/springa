import type { WorkoutCategory, DataPoint, IntervalsStream } from "./types";
import type { CachedActivity } from "./bgCacheDb";
import { linearRegression } from "./math";
import {
  alignStreams,
  extractObservations,
  MIN_ALIGNED_POINTS,
} from "./bgObservations";

// Re-export for consumers that historically imported from bgModel
export { convertGlucoseToMmol, alignStreams, extractObservations } from "./bgObservations";

// --- Types ---

export interface BGObservation {
  category: WorkoutCategory;
  bgRate: number; // mmol/L per 10 min
  fuelRate: number | null; // g/h (from the activity's planned fuel), null if unknown
  activityId: string;
  timeMinute: number;
  startBG: number; // activity starting glucose (mmol/L)
  relativeMinute: number; // minutes since activity start
  entrySlope: number | null; // mmol/L per 10 min pre-workout trend, null if insufficient data
}

export interface CategoryBGResponse {
  category: WorkoutCategory;
  avgRate: number; // mmol/L per 10 min (negative = dropping)
  medianRate: number;
  sampleCount: number;
  confidence: "low" | "medium" | "high"; // <10 / 10-30 / 30+
  avgFuelRate: number | null; // null if no activities in this category had fuel data
  activityCount: number;
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
 *  Returns mmol/L per 10 min. Null if fewer than 2 points in that window. */
export function computeEntrySlope(glucose: DataPoint[]): number | null {
  const entryPoints = glucose.filter((p) => p.time < SKIP_START);
  if (entryPoints.length < 2) return null;

  const first = entryPoints[0];
  const last = entryPoints[entryPoints.length - 1];
  const timeDiffMinutes = last.time - first.time;
  if (timeDiffMinutes <= 0) return null;

  return ((last.value - first.value) / timeDiffMinutes) * 10;
}

export function classifyEntrySlope(slope: number): EntrySlope {
  if (slope < -1.0) return "crashing";
  if (slope < -0.3) return "dropping";
  if (slope <= 0.3) return "stable";
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
}

const EXTRAPOLATION_FACTOR = 6; // g/h per 1.0 mmol/L/10min excess drop
const ACCEPTABLE_DROP = -0.2; // mmol/L per 10min — a mild drop is normal during running
const MIN_DROP_TO_SUGGEST = -0.5; // only suggest fuel increases beyond this threshold
const MAX_FUEL_MULTIPLIER = 1.5; // cap target at 1.5× current fuel
const MAX_FUEL_ABSOLUTE = 90; // absolute ceiling in g/h

function capFuel(target: number, current: number): number {
  const upperBound = current > 0
    ? Math.min(current * MAX_FUEL_MULTIPLIER, MAX_FUEL_ABSOLUTE)
    : MAX_FUEL_ABSOLUTE;
  return Math.max(0, Math.round(Math.min(target, upperBound)));
}

export function calculateTargetFuelRates(observations: BGObservation[]): TargetFuelResult[] {
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

    if (qualifiedGroups.length >= 2) {
      // Regression: fuel rate (x) vs avg BG rate (y) per group
      const points = qualifiedGroups.map(([fuel, obs]) => {
        const groupRates = obs.map((o) => o.bgRate);
        return { x: fuel, y: groupRates.reduce((a, b) => a + b, 0) / groupRates.length };
      });

      const reg = linearRegression(points);
      // Solve for y = ACCEPTABLE_DROP → x = (ACCEPTABLE_DROP - intercept) / slope
      const target = reg.slope > 0
        ? (ACCEPTABLE_DROP - reg.intercept) / reg.slope
        : currentAvgFuel;
      const confidence = getConfidence(catObs.length);

      results.push({
        category,
        targetFuelRate: capFuel(target, currentAvgFuel),
        currentAvgFuel,
        method: "regression",
        confidence,
      });
    } else {
      // Extrapolation: only compensate for the excess drop beyond acceptable
      const excessDrop = Math.abs(avgRate) - Math.abs(ACCEPTABLE_DROP);
      const target = currentAvgFuel + excessDrop * EXTRAPOLATION_FACTOR;
      const confidence = getConfidence(catObs.length);

      results.push({
        category,
        targetFuelRate: capFuel(target, currentAvgFuel),
        currentAvgFuel,
        method: "extrapolation",
        confidence,
      });
    }
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

/** Build BG response model from activity streams, grouped by workout category. */
export function buildBGModel(
  activitiesData: {
    streams: IntervalsStream[];
    activityId: string;
    fuelRate: number | null; // g/h, null if unknown
    category: WorkoutCategory;
  }[],
): BGResponseModel {
  const allObservations: BGObservation[] = [];
  let analyzed = 0;

  for (const { streams, activityId, fuelRate, category } of activitiesData) {
    const aligned = alignStreams(streams);
    if (!aligned) continue;

    const startBG = aligned.glucose[0].value;
    const entrySlope = computeEntrySlope(aligned.glucose);

    const obs = extractObservations(
      aligned.hr,
      aligned.glucose,
      activityId,
      fuelRate,
      startBG,
      category,
      entrySlope,
    );

    if (obs.length > 0) {
      allObservations.push(...obs);
      analyzed++;
    }
  }

  return aggregateModel(allObservations, analyzed);
}

/** Build BG response model from cached aligned data (skips stream fetch + alignment). */
export function buildBGModelFromCached(cached: CachedActivity[]): BGResponseModel {
  const allObservations: BGObservation[] = [];
  let analyzed = 0;

  for (const act of cached) {
    const { hr, glucose, activityId, fuelRate, startBG, category } = act;
    if (hr.length < MIN_ALIGNED_POINTS) continue;

    const entrySlope = act.runBGContext?.pre?.entrySlope30m
      ?? computeEntrySlope(glucose);
    const obs = extractObservations(hr, glucose, activityId, fuelRate, startBG, category, entrySlope);
    if (obs.length > 0) {
      allObservations.push(...obs);
      analyzed++;
    }
  }

  return aggregateModel(allObservations, analyzed);
}

/** Aggregate observations into a full BGResponseModel. */
function aggregateModel(observations: BGObservation[], activitiesAnalyzed: number): BGResponseModel {
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

    categories[cat] = {
      category: cat,
      avgRate: rates.reduce((a, b) => a + b, 0) / rates.length,
      medianRate: median(rates),
      sampleCount: catObs.length,
      confidence: getConfidence(catObs.length),
      avgFuelRate: fuels.length > 0 ? fuels.reduce((a, b) => a + b, 0) / fuels.length : null,
      activityCount: activityIds.size,
    };
  }

  return {
    categories,
    observations,
    activitiesAnalyzed,
    bgByStartLevel: analyzeBGByStartLevel(observations),
    bgByEntrySlope: analyzeBGByEntrySlope(observations),
    bgByTime: analyzeBGByTime(observations),
    targetFuelRates: calculateTargetFuelRates(observations),
  };
}

// --- Fuel suggestions ---

const DROP_THRESHOLD = -1.0; // mmol/L per 10 min — suggest fuel increase beyond this
const FUEL_INCREASE_PER_HALF = 6; // +6 g/h per 0.5 mmol/L/10min excess drop

/** Suggest fuel adjustments for categories with excessive BG drops. */
export function suggestFuelAdjustments(model: BGResponseModel): FuelSuggestion[] {
  const suggestions: FuelSuggestion[] = [];

  for (const [, response] of Object.entries(model.categories)) {
    if (!response) continue;
    if (response.avgRate >= DROP_THRESHOLD) continue;

    const excessDrop = Math.abs(response.avgRate) - Math.abs(DROP_THRESHOLD);
    const suggestedIncrease = Math.ceil(excessDrop / 0.5) * FUEL_INCREASE_PER_HALF;

    suggestions.push({
      category: response.category,
      currentAvgFuel: response.avgFuelRate,
      suggestedIncrease,
      avgDropRate: response.avgRate,
    });
  }

  return suggestions;
}
