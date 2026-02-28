import type { GlookoData } from "./glooko";

// --- Types ---

export interface InsulinContext {
  lastBolusTime: string; // ISO 8601
  lastBolusUnits: number;
  lastMealTime: string; // ISO 8601, from bolus carbsInput
  lastMealCarbs: number; // grams
  iobAtStart: number; // units, Fiasp exponential decay
  timeSinceLastMeal: number; // minutes before run start
  timeSinceLastBolus: number; // minutes before run start
  expectedBGImpact: number; // mmol/L, IOB × ISF (rough estimate)
}

// --- Constants ---

/**
 * Fiasp insulin action curve parameters.
 * Model: activity(t) = t * exp(-t/tau), peak at tau minutes.
 * IOB formula: (1 + t/tau) * exp(-t/tau)
 * Source: dm61's exponential model from LoopKit/Loop#388.
 */
const FIASP_TAU = 55; // peak activity at 55 minutes

/** How far back to look for boluses (ms). At 5h, Fiasp IOB is ~3%. */
const LOOKBACK_MS = 5 * 60 * 60 * 1000;

/**
 * Insulin sensitivity factor (mmol/L per unit).
 * From CamAPS FX pump settings — flat 3.1 all day.
 * Rough estimate: how much 1u of insulin lowers BG.
 */
const ISF = 3.1;

// --- IOB computation ---

/**
 * Compute remaining IOB from a single bolus using Fiasp exponential decay.
 * Model: IOB(t) = dose * (1 + t/tau) * exp(-t/tau)
 * where tau = 55 min (Fiasp peak activity time).
 */
function bolusIOB(bolusUnits: number, minutesAgo: number): number {
  if (minutesAgo < 0) return bolusUnits; // future bolus — full amount
  const ratio = minutesAgo / FIASP_TAU;
  return bolusUnits * (1 + ratio) * Math.exp(-ratio);
}

// --- Builder ---

/**
 * Build InsulinContext for a run from Glooko bolus data.
 * Returns null if no relevant boluses found in the lookback window.
 *
 * CamAPS FX (hybrid closed-loop) delivers insulin via micro-boluses, not
 * scheduled basals. Carbs are embedded in bolus entries as carbsInput.
 * IOB uses Fiasp pharmacokinetic curve (tau=55min), not linear decay.
 *
 * @param data - Glooko boluses for the relevant window
 * @param runStartMs - run start timestamp in ms
 */
export function buildInsulinContext(
  data: GlookoData,
  runStartMs: number,
): InsulinContext | null {
  const lookbackStart = runStartMs - LOOKBACK_MS;

  // --- Find boluses in the lookback window before run start ---
  const relevantBoluses = data.boluses
    .filter((b) => {
      const ts = new Date(b.pumpTimestamp).getTime();
      return ts >= lookbackStart && ts <= runStartMs;
    })
    .sort(
      (a, b) =>
        new Date(b.pumpTimestamp).getTime() -
        new Date(a.pumpTimestamp).getTime(),
    ); // newest first

  // --- Find meal events from bolus carbsInput (CamAPS FX embeds carbs in bolus entries) ---
  const mealEvents: { timestamp: string; carbs: number }[] = [];

  for (const b of relevantBoluses) {
    if (b.carbsInput != null && b.carbsInput > 0) {
      mealEvents.push({
        timestamp: b.pumpTimestamp,
        carbs: b.carbsInput,
      });
    }
  }

  // Sort meals newest first
  mealEvents.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Need at least one bolus in the window
  if (relevantBoluses.length === 0) {
    return null;
  }

  // --- Resolve last bolus and last meal ---
  const lastBolusTime = relevantBoluses[0].pumpTimestamp;
  const lastBolusUnits = relevantBoluses[0].insulinDelivered;
  const lastBolusTs = new Date(lastBolusTime).getTime();

  const lastMealTime = mealEvents.length > 0
    ? mealEvents[0].timestamp
    : relevantBoluses[0].pumpTimestamp;
  const lastMealCarbs = mealEvents.length > 0
    ? mealEvents[0].carbs
    : 0;
  const lastMealTs = new Date(lastMealTime).getTime();

  // --- IOB at run start ---
  let iob = 0;
  for (const b of relevantBoluses) {
    const minutesAgo = (runStartMs - new Date(b.pumpTimestamp).getTime()) / 60000;
    iob += bolusIOB(b.insulinDelivered, minutesAgo);
  }

  const iobRounded = Math.round(iob * 100) / 100;

  return {
    lastBolusTime,
    lastBolusUnits,
    lastMealTime,
    lastMealCarbs,
    iobAtStart: iobRounded,
    timeSinceLastMeal: Math.round((runStartMs - lastMealTs) / 60000),
    timeSinceLastBolus: Math.round((runStartMs - lastBolusTs) / 60000),
    expectedBGImpact: Math.round(iobRounded * ISF * 10) / 10,
  };
}
