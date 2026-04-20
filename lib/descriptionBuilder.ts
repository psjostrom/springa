import { formatPace, pctToMinPerKm } from "./format";

/** Format a single workout step line with LTHR zone and BPM range. */
export function formatStep(
  duration: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  note?: string,
): string {
  const minBpm = Math.floor(lthr * minPct);
  const maxBpm = Math.ceil(lthr * maxPct);
  const core = `${duration} ${Math.round(minPct * 100)}-${Math.round(maxPct * 100)}% LTHR (${minBpm}-${maxBpm} bpm)`;
  return note ? `${note} ${core}` : core;
}

/** Format a pace-based workout step for Intervals.icu.
 *  minPct/maxPct are Intervals.icu pace percentages (higher = faster).
 *  Pass null for both to create a step with no pace target (walk, effort-based).
 *  When thresholdPaceMinPerKm is provided, emits absolute pace syntax
 *  (e.g. "5:33-5:44/km Pace") instead of percentage syntax. */
export function formatPaceStep(
  duration: string,
  minPct: number | null,
  maxPct: number | null,
  note?: string,
  thresholdPace?: number,
): string {
  const prefix = note ? `${note} ` : "";
  if (minPct == null || maxPct == null) return `${prefix}${duration}`;
  if (thresholdPace) {
    const fastPace = pctToMinPerKm(maxPct, thresholdPace);
    const slowPace = pctToMinPerKm(minPct, thresholdPace);
    return `${prefix}${duration} ${formatPace(fastPace)}-${formatPace(slowPace)}/km Pace`;
  }
  return `${prefix}${duration} ${minPct}-${maxPct}% pace`;
}

/** Build a workout description from warmup, main steps, and cooldown. */
export function createWorkoutText(
  warmup: string,
  mainSteps: string[],
  cooldown: string,
  repeats = 1,
  notes?: string,
): string {
  const lines: string[] = [];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(
    "Warmup",
    `- ${warmup}`,
    "",
    repeats > 1 ? `Main set ${repeats}x` : "Main set",
    ...mainSteps.map((s) => `- ${s}`),
    "",
    "Cooldown",
    `- ${cooldown}`,
    "",
  );

  return lines.join("\n");
}

/** Build a single-step workout description (no warmup/cooldown structure). */
export function createSimpleWorkoutText(
  step: string,
  notes?: string,
): string {
  const lines: string[] = [];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(`- ${step}`, "");

  return lines.join("\n");
}
