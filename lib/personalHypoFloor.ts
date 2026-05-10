/**
 * Personal hypo floor analysis.
 *
 * Bins past runs by start BG (0.5 mmol/L buckets) and finds two thresholds:
 * - dangerFloor: the highest bucket where ≥20% of runs went hypo (≥3 samples)
 * - alwaysSafeFloor: the lowest threshold where 0% of runs at-or-above went hypo (≥3 runs)
 *
 * Returns null when there isn't enough signal: <10 total runs OR <2 hypo events.
 */

export interface RunForFloorAnalysis {
  startBG: number;
  /** Any glucose < 4.0 during the run. */
  wentHypo: boolean;
}

export interface HypoFloorAnalysis {
  /**
   * Lowest start-BG threshold where 0% of runs at-or-above went hypo,
   * with ≥3 runs at-or-above. Null when no such threshold exists.
   */
  alwaysSafeFloor: number | null;
  /** Count of runs with startBG ≥ alwaysSafeFloor. */
  alwaysSafeFloorRunCount: number;
  /**
   * Highest bucket [B, B+0.5) where ≥20% of runs went hypo (≥3 samples).
   * Null when no bucket meets this threshold.
   */
  dangerFloor: number | null;
  /** Hypo rate (0..1) in the danger bucket. */
  dangerFloorHypoRate: number;
  /** Sample count in the danger bucket. */
  dangerFloorRunCount: number;
  /** Hypo count (integer) in the danger bucket. */
  dangerFloorHypoCount: number;
  /** Total runs analyzed. */
  totalRuns: number;
  /** Total runs that went hypo. */
  totalHypos: number;
}

const MIN_RUNS = 10;
const MIN_HYPOS = 2;
const MIN_BUCKET_SAMPLES = 3;
const DANGER_THRESHOLD = 0.2;

function bucketOf(bg: number): number {
  return Math.floor(bg * 2) / 2;
}

export function computeHypoFloor(runs: RunForFloorAnalysis[]): HypoFloorAnalysis | null {
  const totalRuns = runs.length;
  const totalHypos = runs.filter((r) => r.wentHypo).length;

  if (totalRuns < MIN_RUNS || totalHypos < MIN_HYPOS) {
    return null;
  }

  // Group into 0.5 mmol/L buckets keyed by lower edge.
  const bucketCounts = new Map<number, { count: number; hypoCount: number }>();
  for (const run of runs) {
    const key = bucketOf(run.startBG);
    let entry = bucketCounts.get(key);
    if (!entry) {
      entry = { count: 0, hypoCount: 0 };
      bucketCounts.set(key, entry);
    }
    entry.count++;
    if (run.wentHypo) entry.hypoCount++;
  }

  const sortedBuckets = [...bucketCounts.keys()].sort((a, b) => a - b);

  // dangerFloor: highest bucket with ≥3 samples AND hypoRate ≥ 20%
  let dangerFloor: number | null = null;
  let dangerFloorHypoRate = 0;
  let dangerFloorRunCount = 0;
  let dangerFloorHypoCount = 0;
  for (let i = sortedBuckets.length - 1; i >= 0; i--) {
    const key = sortedBuckets[i];
    const entry = bucketCounts.get(key);
    if (!entry || entry.count < MIN_BUCKET_SAMPLES) continue;
    const rate = entry.hypoCount / entry.count;
    if (rate >= DANGER_THRESHOLD) {
      dangerFloor = key;
      dangerFloorHypoRate = rate;
      dangerFloorRunCount = entry.count;
      dangerFloorHypoCount = entry.hypoCount;
      break;
    }
  }

  // alwaysSafeFloor: lowest threshold where 0 hypos at-or-above AND ≥3 runs at-or-above.
  // Walk bucket boundaries ascending; for each boundary, count runs with startBG >= boundary.
  let alwaysSafeFloor: number | null = null;
  let alwaysSafeFloorRunCount = 0;
  for (const boundary of sortedBuckets) {
    let countAbove = 0;
    let hypoAbove = 0;
    for (const run of runs) {
      if (run.startBG >= boundary) {
        countAbove++;
        if (run.wentHypo) hypoAbove++;
      }
    }
    if (countAbove >= MIN_BUCKET_SAMPLES && hypoAbove === 0) {
      alwaysSafeFloor = boundary;
      alwaysSafeFloorRunCount = countAbove;
      break;
    }
  }

  return {
    alwaysSafeFloor,
    alwaysSafeFloorRunCount,
    dangerFloor,
    dangerFloorHypoRate,
    dangerFloorRunCount,
    dangerFloorHypoCount,
    totalRuns,
    totalHypos,
  };
}
