import type { MyLifeData } from "./mylife";

// --- Types ---

export interface InsulinContext {
  lastBolusTime: string; // ISO 8601
  lastBolusUnits: number;
  lastMealTime: string; // ISO 8601
  lastMealCarbs: number; // grams
  iobAtStart: number; // units, Fiasp exponential decay (bolus only)
  basalIOBAtStart: number; // units, IOB from basal delivery
  totalIOBAtStart: number; // units, bolus + basal IOB combined
  timeSinceLastMeal: number; // minutes before run start
  timeSinceLastBolus: number; // minutes before run start
  expectedBGImpact: number; // mmol/L, totalIOB × ISF (rough estimate)
  lastBasalRate: number; // U/h, most recent basal rate before run start
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
 */
const ISF = 3.1;

// --- IOB computation ---

/**
 * Compute remaining IOB from a single bolus using Fiasp exponential decay.
 * Model: IOB(t) = dose * (1 + t/tau) * exp(-t/tau)
 */
function bolusIOB(bolusUnits: number, minutesAgo: number): number {
  if (minutesAgo < 0) return bolusUnits; // future bolus — full amount
  const ratio = minutesAgo / FIASP_TAU;
  return bolusUnits * (1 + ratio) * Math.exp(-ratio);
}

/**
 * Compute IOB from basal rate segments.
 * Each basal rate entry defines the rate from that timestamp until the next entry.
 * We discretize into 1-minute intervals and compute IOB for each micro-dose.
 */
function basalIOB(
  basalEntries: { timestamp: string; rate: number }[],
  runStartMs: number,
): number {
  if (basalEntries.length === 0) return 0;

  // Sort oldest first
  const sorted = [...basalEntries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  let iob = 0;
  const lookbackStart = runStartMs - LOOKBACK_MS;

  for (let i = 0; i < sorted.length; i++) {
    const segStart = Math.max(
      new Date(sorted[i].timestamp).getTime(),
      lookbackStart,
    );
    const segEnd =
      i + 1 < sorted.length
        ? new Date(sorted[i + 1].timestamp).getTime()
        : runStartMs;

    // Only process segments before run start
    const effectiveEnd = Math.min(segEnd, runStartMs);
    if (segStart >= effectiveEnd) continue;

    const rateUPerMin = sorted[i].rate / 60; // U/h → U/min
    const durationMin = (effectiveEnd - segStart) / 60000;

    // Approximate: compute IOB at the midpoint of each 5-min block
    const blockSize = 5; // minutes
    for (let t = 0; t < durationMin; t += blockSize) {
      const blockDuration = Math.min(blockSize, durationMin - t);
      const midpointMs = segStart + (t + blockDuration / 2) * 60000;
      const minutesAgo = (runStartMs - midpointMs) / 60000;
      const delivered = rateUPerMin * blockDuration;
      iob += bolusIOB(delivered, minutesAgo);
    }
  }

  return iob;
}

// --- Builder ---

/**
 * Build InsulinContext for a run from MyLife Cloud data.
 * Returns null if no relevant boluses found in the lookback window.
 *
 * MyLife Cloud provides separate events for boluses, carbs, and basal rates.
 * Basal rates represent CamAPS FX algorithm decisions (micro-adjustments every ~10min).
 * IOB includes both bolus and basal insulin using Fiasp pharmacokinetic curve.
 *
 * @param data - MyLife events for the relevant window
 * @param runStartMs - run start timestamp in ms
 */
export function buildInsulinContext(
  data: MyLifeData,
  runStartMs: number,
): InsulinContext | null {
  const lookbackStart = runStartMs - LOOKBACK_MS;

  // --- Separate events by type ---
  const boluses = data.events
    .filter((e) => {
      if (e.type !== "Bolus") return false;
      const ts = new Date(e.timestamp).getTime();
      return ts >= lookbackStart && ts <= runStartMs;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ); // newest first

  const carbEvents = data.events
    .filter((e) => {
      if (e.type !== "Carbohydrates" && e.type !== "Hypo Carbohydrates")
        return false;
      const ts = new Date(e.timestamp).getTime();
      return ts >= lookbackStart && ts <= runStartMs;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ); // newest first

  const basalEntries = data.events
    .filter((e) => {
      if (e.type !== "Basal rate") return false;
      const ts = new Date(e.timestamp).getTime();
      return ts >= lookbackStart && ts <= runStartMs;
    })
    .map((e) => ({ timestamp: e.timestamp, rate: e.value }));

  console.log(`[InsulinCtx] Window: ${new Date(lookbackStart).toISOString()} → ${new Date(runStartMs).toISOString()}`);
  console.log(`[InsulinCtx] In window: ${boluses.length} boluses, ${carbEvents.length} carb events, ${basalEntries.length} basal entries`);

  // Need at least one bolus in the window
  if (boluses.length === 0) {
    console.log("[InsulinCtx] No boluses in window → returning null");
    return null;
  }

  // --- Last bolus ---
  const lastBolusTime = boluses[0].timestamp;
  const lastBolusUnits = boluses[0].value;
  const lastBolusTs = new Date(lastBolusTime).getTime();

  // --- Last meal (from carb events) ---
  const lastMealTime =
    carbEvents.length > 0 ? carbEvents[0].timestamp : boluses[0].timestamp;
  const lastMealCarbs = carbEvents.length > 0 ? carbEvents[0].value : 0;
  const lastMealTs = new Date(lastMealTime).getTime();

  // --- Bolus IOB ---
  let bolusIob = 0;
  for (const b of boluses) {
    const minutesAgo =
      (runStartMs - new Date(b.timestamp).getTime()) / 60000;
    bolusIob += bolusIOB(b.value, minutesAgo);
  }

  // --- Basal IOB ---
  const basalIob = basalIOB(basalEntries, runStartMs);

  const bolusIobRounded = Math.round(bolusIob * 100) / 100;
  const basalIobRounded = Math.round(basalIob * 100) / 100;
  const totalIob = Math.round((bolusIob + basalIob) * 100) / 100;

  // --- Last basal rate ---
  const basalSorted = [...basalEntries].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const lastBasalRate = basalSorted.length > 0 ? basalSorted[0].rate : 0;

  const ctx: InsulinContext = {
    lastBolusTime,
    lastBolusUnits,
    lastMealTime,
    lastMealCarbs,
    iobAtStart: bolusIobRounded,
    basalIOBAtStart: basalIobRounded,
    totalIOBAtStart: totalIob,
    timeSinceLastMeal: Math.round((runStartMs - lastMealTs) / 60000),
    timeSinceLastBolus: Math.round((runStartMs - lastBolusTs) / 60000),
    expectedBGImpact: Math.round(totalIob * ISF * 10) / 10,
    lastBasalRate,
  };

  console.log("[InsulinCtx] Result:", JSON.stringify(ctx, null, 2));
  return ctx;
}
