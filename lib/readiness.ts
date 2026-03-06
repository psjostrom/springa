/**
 * Readiness score computation
 *
 * Computes a 0-100 readiness score from wellness metrics when
 * a built-in readiness score is not available from wearables.
 */

// Compute mean and standard deviation
export function computeStats(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

// Convert z-score to 0-100 score (centered at 50, ±2 SD maps to 0-100)
export function zScoreToScore(value: number, mean: number, sd: number, invert = false): number {
  if (sd === 0) return 50;
  const z = (value - mean) / sd;
  const adjusted = invert ? -z : z; // Invert for metrics where lower is better
  // Map z-score to 0-100: z=0 → 50, z=2 → 100, z=-2 → 0
  const score = 50 + (adjusted * 25);
  return Math.max(0, Math.min(100, score));
}

// Map TSB to 0-100 score: -30 → 0, 0 → 60, +15 → 100
export function tsbToScore(tsb: number): number {
  // TSB sweet spot is around 0 to +10 for training
  // Very negative = fatigued, very positive = detrained
  if (tsb <= -30) return 0;
  if (tsb >= 15) return 100;
  // Linear interpolation: -30→0, +15→100
  return ((tsb + 30) / 45) * 100;
}

export interface ReadinessBaseline {
  mean: number;
  sd: number;
}

// Compute composite readiness score
export function computeReadiness(
  hrv: number | null,
  hrvBaseline: ReadinessBaseline,
  rhr: number | null,
  rhrBaseline: ReadinessBaseline,
  sleep: number | null, // 0-100 score or hours
  tsb: number | null
): number | null {
  const scores: { value: number; weight: number }[] = [];

  // HRV score (higher is better)
  if (hrv != null && hrvBaseline.mean > 0) {
    scores.push({ value: zScoreToScore(hrv, hrvBaseline.mean, hrvBaseline.sd), weight: 30 });
  }

  // RHR score (lower is better, so invert)
  if (rhr != null && rhrBaseline.mean > 0) {
    scores.push({ value: zScoreToScore(rhr, rhrBaseline.mean, rhrBaseline.sd, true), weight: 20 });
  }

  // Sleep score (already 0-100)
  if (sleep != null && sleep > 12) {
    // If it's a score (> 12), use directly
    scores.push({ value: sleep, weight: 25 });
  } else if (sleep != null) {
    // If it's hours, map 4-9 hrs to 0-100
    const sleepScore = Math.max(0, Math.min(100, ((sleep - 4) / 5) * 100));
    scores.push({ value: sleepScore, weight: 25 });
  }

  // TSB score
  if (tsb != null) {
    scores.push({ value: tsbToScore(tsb), weight: 25 });
  }

  if (scores.length === 0) return null;

  // Weighted average
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = scores.reduce((sum, s) => sum + s.value * s.weight, 0);
  return Math.round(weightedSum / totalWeight);
}
