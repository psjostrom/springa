import { fetchTreatmentsFromNS } from "./nightscout";

// Insulin decay time constants (minutes).
// tau ≈ DIA / 5 — derived from exponential decay model.
const INSULIN_TAU: Record<string, number> = {
  FIASP: 55,
  LYUMJEV: 50,
  NOVORAPID: 75,
};

const DEFAULT_TAU = INSULIN_TAU.FIASP;
const TAU_MULTIPLIER = 5;

/**
 * IOB for a single dose using exponential decay: dose × (1 + t) × e^(-t)
 * where t = minutesSince / tau.
 *
 * Ported from Strimma's IOBComputer.kt.
 */
function iobForDose(dose: number, minutesSince: number, tau: number): number {
  const t = minutesSince / tau;
  return dose * (1 + t) * Math.exp(-t);
}

/**
 * Compute total IOB from a list of treatments.
 * Only considers treatments with insulin > 0 within the lookback window.
 */
export function computeIOB(
  treatments: { ts: number; insulin: number | null }[],
  now: number,
  tauMinutes: number = DEFAULT_TAU,
): number {
  const lookbackMs = TAU_MULTIPLIER * tauMinutes * 60 * 1000;
  const cutoff = now - lookbackMs;

  const total = treatments.reduce((sum, t) => {
    if (t.insulin == null || t.insulin <= 0) return sum;
    if (t.ts < cutoff || t.ts > now) return sum;
    const minutesSince = (now - t.ts) / (60 * 1000);
    return sum + iobForDose(t.insulin, minutesSince, tauMinutes);
  }, 0);

  return Math.round(total * 10) / 10;
}

/**
 * Fetch treatments from a Nightscout-compatible server and compute current IOB.
 */
export async function fetchIOB(
  nsUrl: string,
  nsSecret: string,
  tauMinutes: number = DEFAULT_TAU,
): Promise<number> {
  const now = Date.now();
  const lookbackMs = TAU_MULTIPLIER * tauMinutes * 60 * 1000;

  const raw = await fetchTreatmentsFromNS(nsUrl, nsSecret, {
    since: now - lookbackMs,
    count: 500,
  });

  const treatments = raw
    .filter((t) => typeof t.insulin === "number" && t.insulin > 0)
    .map((t) => ({
      ts: typeof t.created_at === "string" ? new Date(t.created_at).getTime() : 0,
      insulin: t.insulin as number,
    }));

  return computeIOB(treatments, now, tauMinutes);
}

export { DEFAULT_TAU, INSULIN_TAU };
