import {
  resolveWorkoutMetrics,
  type WorkoutEstimationContext,
} from "./workoutMath";

/** Canonical "prescribed grams" for a workout. Pure function: same description +
 *  fuelRate + context always returns the same number. The pre-run UI and the
 *  post-run feedback screen both call this with identical inputs derived from the
 *  planned event, so the gram total is identical before and after the run.
 *
 *  Description-only by design — never reads any duration field. Intervals.icu
 *  overwrites event.moving_time / duration / elapsed_time with the activity's
 *  actual run time after pairing, so any duration-based fallback would diverge
 *  between pre-run and post-run for the same workout. */
export function calculateCanonicalPlannedPrescription(
  description: string | undefined,
  fuelRateGPerHour: number | null | undefined,
  context: WorkoutEstimationContext = {},
): number | null {
  if (fuelRateGPerHour == null) return null;
  return resolveWorkoutMetrics(description, fuelRateGPerHour, context)
    .prescribedCarbsG;
}
