import type { WorkoutCategory } from "./types";
import type {
  BGResponseModel,
  BGObservation,
  TimeBucket,
} from "./bgModel";
import {
  classifyTimeBucket,
  classifyBGBand,
  classifyEntrySlope,
  analyzeBGByTime,
} from "./bgModel";
import { linearRegression } from "./math";
import { BG_HYPO } from "./constants";

// --- Types ---

export interface SimSegment {
  durationMin: number;
  category: WorkoutCategory;
}

export interface SimulationInput {
  startBG: number; // mmol/L
  entrySlope: number | null; // mmol/L per min (pre-run CGM trend)
  segments: SimSegment[]; // workout segments in order
  fuelRateGH: number | null; // constant fuel rate in g/h (null = unknown)
  bgModel: BGResponseModel;
}

export interface SimPoint {
  minute: number;
  bg: number;
  bgLow: number; // lower confidence band (1 SD)
  bgHigh: number; // upper confidence band (1 SD)
  segmentIndex: number;
}

export interface SimulationResult {
  curve: SimPoint[];
  hypoMinute: number | null; // first minute predicted BG < 3.9
  minBG: number;
  totalDurationMin: number;
  confidence: "low" | "medium" | "high";
  reliable: boolean; // false = don't show prediction to user
  warnings: string[];
  maxObservedMinute: number | null; // longest run duration in data for used categories (null = no data)
}

// --- Constants ---

const STEP_MIN = 1;
const BG_FLOOR = 2.0; // physiological floor
const ENTRY_SLOPE_DECAY_MIN = 15; // entry slope effect fades over first 15 min
const MIN_BUCKET_SAMPLES = 3; // minimum observations to trust a time bucket
const EXTRAPOLATION_FACTOR = 60; // g/h per 1.0 mmol/L/min
const MIN_ACTIVITIES_FOR_RELIABLE = 8; // minimum activities per category before showing predictions

// --- Helpers ---

/** Compute std dev of bgRates for a set of observations. */
function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Get the segment index and category for a given minute. */
function segmentAt(
  minute: number,
  segments: SimSegment[],
): { index: number; category: WorkoutCategory } | null {
  let elapsed = 0;
  for (let i = 0; i < segments.length; i++) {
    if (minute < elapsed + segments[i].durationMin) {
      return { index: i, category: segments[i].category };
    }
    elapsed += segments[i].durationMin;
  }
  return null;
}

// --- Rate computation ---

interface RateResult {
  rate: number; // mmol/L per min
  stdDev: number; // observation std dev
}

/**
 * Get the base BG rate from time-bucketed data, filtered by category.
 * Falls back to all-category data, then to category average rate.
 */
function getTimeRate(
  minute: number,
  category: WorkoutCategory,
  bgModel: BGResponseModel,
): { rate: number; sampleCount: number; stdDev: number } {
  const bucket = classifyTimeBucket(minute);

  // Try category-specific time-bucketed rate
  const catTimeBuckets = analyzeBGByTime(bgModel.observations, category);
  const catBucket = catTimeBuckets.find((b) => b.bucket === bucket);

  if (catBucket && catBucket.sampleCount >= MIN_BUCKET_SAMPLES) {
    const sd = computeBucketStdDev(bgModel.observations, bucket, category);
    return { rate: catBucket.avgRate, sampleCount: catBucket.sampleCount, stdDev: sd };
  }

  // Fall back to all-category time-bucketed rate
  const allBucket = bgModel.bgByTime.find((b) => b.bucket === bucket);
  if (allBucket && allBucket.sampleCount >= MIN_BUCKET_SAMPLES) {
    const sd = computeBucketStdDev(bgModel.observations, bucket);
    return { rate: allBucket.avgRate, sampleCount: allBucket.sampleCount, stdDev: sd };
  }

  // Fall back to category average
  const catData = bgModel.categories[category];
  if (catData) {
    const catObs = bgModel.observations.filter((o) => o.category === category);
    const sd = stdDev(catObs.map((o) => o.bgRate));
    return { rate: catData.avgRate, sampleCount: catData.sampleCount, stdDev: sd };
  }

  // No data at all
  return { rate: 0, sampleCount: 0, stdDev: 0 };
}

/** Compute std dev of bgRates within a time bucket, optionally filtered by category. */
function computeBucketStdDev(
  observations: BGObservation[],
  bucket: TimeBucket,
  category?: WorkoutCategory,
): number {
  let filtered = observations.filter(
    (o) => classifyTimeBucket(o.relativeMinute) === bucket,
  );
  if (category) {
    filtered = filtered.filter((o) => o.category === category);
  }
  return stdDev(filtered.map((o) => o.bgRate));
}

/**
 * Compute fuel sensitivity: how much bgRate changes per 1 g/h of fuel.
 * Uses regression slope when available, otherwise extrapolation factor.
 */
function getFuelSensitivity(
  category: WorkoutCategory,
  bgModel: BGResponseModel,
): number {
  const target = bgModel.targetFuelRates.find((t) => t.category === category);

  if (target?.method === "regression") {
    // Reconstruct the regression slope from qualified observation groups
    const catObs = bgModel.observations.filter(
      (o) => o.category === category && o.fuelRate != null,
    );
    const fuelGroups = new Map<number, BGObservation[]>();
    for (const obs of catObs) {
      const key = obs.fuelRate ?? 0;
      const list = fuelGroups.get(key) ?? [];
      list.push(obs);
      fuelGroups.set(key, list);
    }

    const qualifiedGroups = [...fuelGroups.entries()].filter(
      ([, obs]) => obs.length >= 3,
    );
    if (qualifiedGroups.length >= 2) {
      const points = qualifiedGroups.map(([fuel, obs]) => {
        const rates = obs.map((o) => o.bgRate);
        return { x: fuel, y: rates.reduce((a, b) => a + b, 0) / rates.length };
      });

      const reg = linearRegression(points);
      if (reg.slope !== 0) return reg.slope;
    }
  }

  // Extrapolation fallback: 1/EXTRAPOLATION_FACTOR mmol/min per g/h
  return 1 / EXTRAPOLATION_FACTOR;
}

/**
 * Compute the fuel correction: delta in mmol/L per min for the planned
 * fuel rate vs the model's average fuel rate for this category.
 */
function fuelCorrection(
  category: WorkoutCategory,
  plannedFuelGH: number | null,
  bgModel: BGResponseModel,
): number {
  if (plannedFuelGH === null) return 0;

  const sensitivity = getFuelSensitivity(category, bgModel);

  const catData = bgModel.categories[category];
  const avgFuel = catData?.avgFuelRate;
  if (avgFuel == null) return 0;

  // sensitivity > 0 means more fuel → higher bgRate (less negative = better)
  return sensitivity * (plannedFuelGH - avgFuel);
}

/**
 * Compute start-BG correction: delta between the rate for the current BG band
 * and the category's overall average rate.
 */
function startBGCorrection(
  currentBG: number,
  category: WorkoutCategory,
  bgModel: BGResponseModel,
): number {
  const catData = bgModel.categories[category];
  if (!catData) return 0;

  const band = classifyBGBand(currentBG);
  const bandData = bgModel.bgByStartLevel.find((b) => b.band === band);
  if (!bandData || bandData.sampleCount < MIN_BUCKET_SAMPLES) return 0;

  return bandData.avgRate - catData.avgRate;
}

/**
 * Compute entry slope correction: delta between the rate for the current
 * entry slope classification and the category's overall average rate.
 * Decays linearly over the first ENTRY_SLOPE_DECAY_MIN minutes.
 */
function entrySlopeCorrection(
  minute: number,
  entrySlope: number | null,
  category: WorkoutCategory,
  bgModel: BGResponseModel,
): number {
  if (entrySlope === null) return 0;
  if (minute >= ENTRY_SLOPE_DECAY_MIN) return 0;

  const catData = bgModel.categories[category];
  if (!catData) return 0;

  const slopeClass = classifyEntrySlope(entrySlope);
  const slopeData = bgModel.bgByEntrySlope.find((s) => s.slope === slopeClass);
  if (!slopeData || slopeData.sampleCount < MIN_BUCKET_SAMPLES) return 0;

  const delta = slopeData.avgRate - catData.avgRate;
  // Linear decay: full effect at minute 0, zero at ENTRY_SLOPE_DECAY_MIN
  const decayFactor = 1 - minute / ENTRY_SLOPE_DECAY_MIN;
  return delta * decayFactor;
}

/**
 * Compute the effective BG rate for a single simulation step.
 *
 * Additive residual model:
 *   rate = baseTimeRate + fuelDelta + startBGDelta + entrySlopeDelta
 *
 * Each delta is the difference between the dimension-specific rate and the
 * category's overall average, isolating each effect without double-counting.
 */
export function rateForStep(
  minute: number,
  currentBG: number,
  category: WorkoutCategory,
  fuelRateGH: number | null,
  entrySlope: number | null,
  bgModel: BGResponseModel,
): RateResult {
  const timeRate = getTimeRate(minute, category, bgModel);

  const fuel = fuelCorrection(category, fuelRateGH, bgModel);
  const startBG = startBGCorrection(currentBG, category, bgModel);
  const entry = entrySlopeCorrection(minute, entrySlope, category, bgModel);

  return {
    rate: timeRate.rate + fuel + startBG + entry,
    stdDev: timeRate.stdDev,
  };
}

// --- Simulation ---

/** Determine confidence label from observation count. Cosmetic only — does not gate behavior. */
function overallConfidence(
  bgModel: BGResponseModel,
  categories: WorkoutCategory[],
): "low" | "medium" | "high" {
  const minCount = Math.min(
    ...categories.map((c) => bgModel.categories[c]?.sampleCount ?? 0),
  );
  if (minCount >= 30) return "high";
  if (minCount >= 10) return "medium";
  return "low";
}

/** Generate warnings about simulation reliability. */
function generateWarnings(
  input: SimulationInput,
): string[] {
  const warnings: string[] = [];
  const { bgModel, segments, fuelRateGH } = input;
  const totalMin = segments.reduce((s, seg) => s + seg.durationMin, 0);

  // Check if any category has no data
  const categories = [...new Set(segments.map((s) => s.category))];
  for (const cat of categories) {
    const catData = bgModel.categories[cat];
    if (!catData) {
      warnings.push(`No BG data for ${cat} runs — using overall averages`);
    } else if (catData.activityCount < MIN_ACTIVITIES_FOR_RELIABLE) {
      warnings.push(`Need ${MIN_ACTIVITIES_FOR_RELIABLE - catData.activityCount} more ${cat} runs for reliable predictions (have ${catData.activityCount})`);
    }
  }

  // Check if simulation extends beyond observed data
  const maxObservedMinute = bgModel.observations.length > 0
    ? Math.max(...bgModel.observations.map((o) => o.relativeMinute))
    : 0;
  if (totalMin > maxObservedMinute + 15) {
    warnings.push(
      `Simulation extends to ${totalMin}min — longest observed run ends at ~${maxObservedMinute}min`,
    );
  }

  // Check fuel rate
  if (fuelRateGH === null) {
    warnings.push("Unknown fuel rate — using base rate only, hypo prediction unreliable");
  } else {
    // Check fuel rate vs model range
    for (const cat of categories) {
      const fuels = bgModel.observations
        .filter((o) => o.category === cat && o.fuelRate != null)
        .map((o) => o.fuelRate)
        .filter((f): f is number => f != null);
      if (fuels.length === 0) continue;
      const minFuel = Math.min(...fuels);
      const maxFuel = Math.max(...fuels);
      if (fuelRateGH < minFuel - 12 || fuelRateGH > maxFuel + 12) {
        warnings.push(
          `Fuel ${fuelRateGH}g/h is outside observed range (${minFuel}–${maxFuel}g/h) for ${cat}`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Compute per-category model residual variance.
 *
 * For each observation, compute what rateForStep would predict vs the actual
 * bgRate. The variance of these residuals captures systematic model error
 * (wrong fuel correction, missing IOB, etc.) that observation-level stdDev misses.
 */
function modelResidualVariance(
  bgModel: BGResponseModel,
  category: WorkoutCategory,
  fuelRateGH: number | null,
): number {
  const catObs = bgModel.observations.filter((o) => o.category === category);
  if (catObs.length < 3) return 0;

  const residuals: number[] = [];
  for (const obs of catObs) {
    const predicted = rateForStep(
      obs.relativeMinute,
      obs.startBG,
      obs.category,
      fuelRateGH ?? obs.fuelRate ?? 0, // use obs fuel for residual calc when planned is null
      obs.entrySlope,
      bgModel,
    );
    residuals.push(predicted.rate - obs.bgRate);
  }

  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  return residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) / residuals.length;
}

/**
 * Simulate blood glucose over a workout.
 *
 * Steps through time in STEP_MIN increments. At each step:
 * 1. Determine the current segment and its category
 * 2. Compute the effective BG rate using the additive residual model
 * 3. Apply the rate to update BG
 * 4. Track confidence bands using observation std dev + model residual variance
 */
export function simulateBG(input: SimulationInput): SimulationResult {
  const { startBG, entrySlope, segments, fuelRateGH, bgModel } = input;

  const totalDurationMin = segments.reduce((s, seg) => s + seg.durationMin, 0);
  if (totalDurationMin <= 0 || segments.length === 0) {
    return {
      curve: [{ minute: 0, bg: startBG, bgLow: startBG, bgHigh: startBG, segmentIndex: 0 }],
      hypoMinute: null,
      minBG: startBG,
      totalDurationMin: 0,
      confidence: "low",
      reliable: false,
      warnings: ["No segments to simulate"],
      maxObservedMinute: null,
    };
  }

  const warnings = generateWarnings(input);
  const usedCategories = [...new Set(segments.map((s) => s.category))];

  // Longest actual run duration across used categories
  const maxObservedMinute = usedCategories.reduce<number | null>((max, cat) => {
    const catData = bgModel.categories[cat];
    if (!catData) return max;
    return Math.max(max ?? 0, catData.maxDurationMin);
  }, null);
  const fuelKnown = fuelRateGH !== null;
  const confidence: "low" | "medium" | "high" = fuelKnown
    ? overallConfidence(bgModel, usedCategories)
    : "low";

  // Pre-compute model residual variance per category
  const residualVar: Record<string, number> = {};
  for (const cat of usedCategories) {
    residualVar[cat] = modelResidualVariance(bgModel, cat, fuelRateGH);
  }

  const curve: SimPoint[] = [];
  let currentBG = startBG;
  let cumulativeVariance = 0;
  let hypoMinute: number | null = null;
  let minBG = startBG;

  // Initial point
  curve.push({
    minute: 0,
    bg: startBG,
    bgLow: startBG,
    bgHigh: startBG,
    segmentIndex: 0,
  });

  for (let t = STEP_MIN; t <= totalDurationMin; t += STEP_MIN) {
    const seg = segmentAt(t - STEP_MIN, segments); // use start of step for segment lookup
    if (!seg) break;

    const { rate, stdDev: sd } = rateForStep(
      t - STEP_MIN, // rate at start of step
      currentBG,
      seg.category,
      fuelRateGH,
      entrySlope,
      bgModel,
    );

    // BG change for this step: rate is per minute, step is STEP_MIN minutes
    const bgChange = rate * STEP_MIN;
    currentBG = Math.max(BG_FLOOR, currentBG + bgChange);

    // Accumulate variance for confidence bands
    // Two sources: observation noise (sd) + model systematic error (residualVar)
    const observationVar = (sd * STEP_MIN) ** 2;
    const modelVar = (residualVar[seg.category] ?? 0) * STEP_MIN ** 2;
    cumulativeVariance += observationVar + modelVar;
    const bandWidth = Math.sqrt(cumulativeVariance);

    const segAtT = segmentAt(t, segments);
    curve.push({
      minute: t,
      bg: Math.round(currentBG * 100) / 100,
      bgLow: Math.round(Math.max(BG_FLOOR, currentBG - bandWidth) * 100) / 100,
      bgHigh: Math.round((currentBG + bandWidth) * 100) / 100,
      segmentIndex: segAtT?.index ?? seg.index,
    });

    if (currentBG < minBG) minBG = currentBG;
    if (fuelKnown && hypoMinute === null && currentBG < BG_HYPO) {
      hypoMinute = t;
    }
  }

  // Gate reliability on minimum data per category
  const hasEnoughData = usedCategories.every((cat) => {
    const catData = bgModel.categories[cat];
    return catData != null && catData.activityCount >= MIN_ACTIVITIES_FOR_RELIABLE;
  });
  const reliable = fuelKnown && hasEnoughData;

  return {
    curve,
    hypoMinute: reliable ? hypoMinute : null,
    minBG: Math.round(minBG * 100) / 100,
    totalDurationMin,
    confidence,
    reliable,
    warnings,
    maxObservedMinute,
  };
}

// --- Validation (Phase 2: BG Twin) ---

export interface ValidationResult {
  meanError: number; // mmol/L average (simulated - actual), positive = overestimate
  rmse: number; // root mean square error
  maxError: number; // worst single-point absolute error
  pointsCompared: number;
}

/**
 * Compare a simulated BG curve against actual glucose stream data.
 * Matches by minute (nearest minute within 2-min tolerance).
 */
export function validateSimulation(
  simulated: SimPoint[],
  actual: { time: number; value: number }[],
): ValidationResult | null {
  if (simulated.length === 0 || actual.length === 0) return null;

  const actualByMin = new Map<number, number>();
  for (const p of actual) {
    actualByMin.set(Math.round(p.time), p.value);
  }

  const errors: number[] = [];

  for (const sp of simulated) {
    const actualVal =
      actualByMin.get(sp.minute) ??
      actualByMin.get(sp.minute - 1) ??
      actualByMin.get(sp.minute + 1) ??
      actualByMin.get(sp.minute - 2) ??
      actualByMin.get(sp.minute + 2);

    if (actualVal != null) {
      errors.push(sp.bg - actualVal);
    }
  }

  if (errors.length === 0) return null;

  const meanError =
    errors.reduce((a, b) => a + b, 0) / errors.length;
  const rmse = Math.sqrt(
    errors.reduce((sum, e) => sum + e * e, 0) / errors.length,
  );
  const maxError = Math.max(...errors.map(Math.abs));

  return {
    meanError: Math.round(meanError * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    maxError: Math.round(maxError * 100) / 100,
    pointsCompared: errors.length,
  };
}
