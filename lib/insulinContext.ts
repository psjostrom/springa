import type { MyLifeData } from "./mylife";

// --- Types ---

/**
 * Insulin context for pre-run safety assessment.
 *
 * WHY THIS MATTERS:
 * This is T1D-critical code. Wrong IOB → wrong carb recommendation → hypo on a run.
 * The key insight: CamAPS FX delivers basal insulin in micro-doses every ~10 min,
 * creating a constant ~1u background IOB that's always present. If we report that
 * as "IOB", the pre-run panel permanently warns about insulin that isn't actually
 * a risk — it's the baseline the BG model already learned from.
 *
 * IOB FIELDS — THREE LEVELS:
 *
 * 1. totalIOBAtStart — ALL insulin still active (bolus + basal). Used by analytical
 *    consumers (run analysis prompt, BG pattern model) that need the full picture.
 *
 * 2. iobAtStart — Bolus-only IOB. The discrete, deliberate doses from meals.
 *
 * 3. actionableIOB — The value shown to the runner. Bolus IOB + EXCESS basal IOB.
 *    "Excess" = actual basal IOB minus steady-state basal IOB (what a constant
 *    delivery at the 5h average rate would produce). This is zero on a normal day
 *    but captures spike corrections — when CamAPS cranked basal to 2-3 U/h to
 *    fight a high, that concentrated recent delivery has more remaining IOB than
 *    the same total spread evenly, and THAT difference will push BG down.
 *
 * Validated against real MyLife data (2026-03-10):
 *   Normal day, 5u bolus at 08:21, avg basal ~0.7-0.9 U/h:
 *   - At 10:30: totalIOB=2.99  actionableIOB=1.62  (excess basal ≈ 0.02)
 *   - At 12:11: totalIOB=1.49  actionableIOB=0.40  (excess basal ≈ 0.00)
 *   Old code showed 2.99u at 12:11 (stale + inflated). New code: 0.40u (correct).
 */
export interface InsulinContext {
  lastBolusTime: string; // ISO 8601
  lastBolusUnits: number;
  lastMealTime: string; // ISO 8601
  lastMealCarbs: number; // grams
  iobAtStart: number; // units — bolus IOB only (Fiasp exponential decay)
  basalIOBAtStart: number; // units — IOB from basal delivery (CamAPS micro-doses)
  totalIOBAtStart: number; // units — bolus + basal combined (for analytics, NOT display)
  actionableIOB: number; // units — bolus IOB + excess basal IOB (for pre-run display)
  timeSinceLastMeal: number; // minutes before run start
  timeSinceLastBolus: number; // minutes before run start
  expectedBGImpact: number; // mmol/L — totalIOB × ISF (for analytics, uses full IOB)
  lastBasalRate: number; // U/h, most recent basal rate before run start
  easeOffStartMin: number | null; // minutes before run start that Ease-off was activated, null if none
  easeOffDurationH: number | null; // Ease-off duration in hours, null if none
  boostStartMin: number | null; // minutes before run start that Boost was activated, null if none
  boostDurationH: number | null; // Boost duration in hours, null if none
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
 *
 * @param sortedEntries - Basal entries sorted oldest-first by timestamp
 */
function basalIOB(
  sortedEntries: { timestamp: string; rate: number }[],
  runStartMs: number,
): number {
  if (sortedEntries.length === 0) return 0;

  let iob = 0;
  const lookbackStart = runStartMs - LOOKBACK_MS;

  for (let i = 0; i < sortedEntries.length; i++) {
    const segStart = Math.max(
      new Date(sortedEntries[i].timestamp).getTime(),
      lookbackStart,
    );
    const segEnd =
      i + 1 < sortedEntries.length
        ? new Date(sortedEntries[i + 1].timestamp).getTime()
        : runStartMs;

    // Only process segments before run start
    const effectiveEnd = Math.min(segEnd, runStartMs);
    if (segStart >= effectiveEnd) continue;

    const rateUPerMin = sortedEntries[i].rate / 60; // U/h → U/min
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

/**
 * Compute the weighted-average basal rate (U/h) over the lookback window.
 * Each segment's rate is weighted by its duration.
 *
 * Used to establish the "steady-state" baseline for excess basal IOB.
 * CamAPS adjusts basal every ~10 min; the average across 5h smooths this out.
 *
 * @param sortedEntries - Basal entries sorted oldest-first by timestamp
 */
function averageBasalRate(
  sortedEntries: { timestamp: string; rate: number }[],
  runStartMs: number,
): number {
  if (sortedEntries.length === 0) return 0;

  const lookbackStart = runStartMs - LOOKBACK_MS;
  let totalRate = 0;
  let totalDuration = 0;

  for (let i = 0; i < sortedEntries.length; i++) {
    const segStart = Math.max(new Date(sortedEntries[i].timestamp).getTime(), lookbackStart);
    const segEnd =
      i + 1 < sortedEntries.length
        ? new Date(sortedEntries[i + 1].timestamp).getTime()
        : runStartMs;
    const effectiveEnd = Math.min(segEnd, runStartMs);
    if (segStart >= effectiveEnd) continue;

    const durationMs = effectiveEnd - segStart;
    totalRate += sortedEntries[i].rate * durationMs;
    totalDuration += durationMs;
  }

  return totalDuration > 0 ? totalRate / totalDuration : 0;
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
    .map((e) => ({ timestamp: e.timestamp, rate: e.value }))
    .sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    ); // oldest first — basalIOB and averageBasalRate expect sorted input

  // --- Boost / Ease-off events ---
  // These use a wider window (up to 8h back) since ease-off is typically
  // activated 2h before a run and can last 2-4h.
  const pumpModeWindow = 8 * 60 * 60 * 1000;
  const pumpModeLookback = runStartMs - pumpModeWindow;

  const easeOffEvents = data.events
    .filter((e) => {
      if (e.type !== "Ease-off") return false;
      const ts = new Date(e.timestamp).getTime();
      if (ts < pumpModeLookback || ts > runStartMs) return false;
      // Only include if still active at run start (start + duration >= runStart)
      const endMs = ts + e.value * 60 * 60 * 1000;
      return endMs >= runStartMs;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ); // newest first

  const boostEvents = data.events
    .filter((e) => {
      if (e.type !== "Boost") return false;
      const ts = new Date(e.timestamp).getTime();
      if (ts < pumpModeLookback || ts > runStartMs) return false;
      const endMs = ts + e.value * 60 * 60 * 1000;
      return endMs >= runStartMs;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    ); // newest first

  // Need at least one bolus in the window
  if (boluses.length === 0) {
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

  // --- Actionable IOB ---
  // WHY: CamAPS delivers ~0.7-0.9 U/h basal continuously, producing ~1u of
  // always-present basal IOB. Reporting this as "IOB" would permanently trigger
  // the pre-run warning (≥0.5u threshold) even when no meal bolus is active.
  //
  // BUT: if CamAPS was correcting a BG spike by cranking basal to 2-3 U/h in
  // the last 2-3 hours, that concentrated recent delivery IS extra risk — the
  // IOB from recent high-rate delivery decays slower than evenly-spread delivery.
  //
  // HOW: compute what basal IOB would be if delivery had been constant at the
  // 5h average rate (steady-state). The difference is excess basal IOB.
  // Normal day: excess ≈ 0. Spike correction day: excess > 0.
  //
  // actionableIOB = bolus IOB + max(0, actual basal IOB - steady-state basal IOB)
  const avgRate = averageBasalRate(basalEntries, runStartMs);
  const steadyStateBasalIob =
    avgRate > 0
      ? basalIOB(
          [{ timestamp: new Date(lookbackStart).toISOString(), rate: avgRate }],
          runStartMs,
        )
      : 0;
  const excessBasalIob = Math.max(0, basalIob - steadyStateBasalIob);
  const actionableIob = bolusIob + excessBasalIob;

  const bolusIobRounded = Math.round(bolusIob * 100) / 100;
  const basalIobRounded = Math.round(basalIob * 100) / 100;
  const totalIob = Math.round((bolusIob + basalIob) * 100) / 100;
  const actionableIobRounded = Math.round(actionableIob * 100) / 100;

  // --- Last basal rate (basalEntries already sorted oldest-first) ---
  const lastBasalRate =
    basalEntries.length > 0 ? basalEntries[basalEntries.length - 1].rate : 0;

  // --- Ease-off / Boost ---
  const lastEaseOff = easeOffEvents.length > 0 ? easeOffEvents[0] : null;
  const lastBoost = boostEvents.length > 0 ? boostEvents[0] : null;

  const ctx: InsulinContext = {
    lastBolusTime,
    lastBolusUnits,
    lastMealTime,
    lastMealCarbs,
    iobAtStart: bolusIobRounded,
    basalIOBAtStart: basalIobRounded,
    totalIOBAtStart: totalIob,
    actionableIOB: actionableIobRounded,
    timeSinceLastMeal: Math.round((runStartMs - lastMealTs) / 60000),
    timeSinceLastBolus: Math.round((runStartMs - lastBolusTs) / 60000),
    expectedBGImpact: Math.round(totalIob * ISF * 10) / 10,
    lastBasalRate,
    easeOffStartMin: lastEaseOff
      ? Math.round((runStartMs - new Date(lastEaseOff.timestamp).getTime()) / 60000)
      : null,
    easeOffDurationH: lastEaseOff ? lastEaseOff.value : null,
    boostStartMin: lastBoost
      ? Math.round((runStartMs - new Date(lastBoost.timestamp).getTime()) / 60000)
      : null,
    boostDurationH: lastBoost ? lastBoost.value : null,
  };

  return ctx;
}
