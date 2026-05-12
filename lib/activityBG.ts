import type { CachedActivity } from "./activityStreamsDb";

// Plausible-CGM range. Outside this band the value is sensor noise (warm-up
// placeholder, calibration spike, mg/dL→mmol unit confusion) — better to
// treat as "no reading" than to render "start 277 → end 5.5" in the UI.
const MIN_PLAUSIBLE_BG = 2.0;
const MAX_PLAUSIBLE_BG = 30.0;

function plausible(value: number | undefined): number | null {
  if (value == null) return null;
  if (value < MIN_PLAUSIBLE_BG || value > MAX_PLAUSIBLE_BG) return null;
  return value;
}

/**
 * Single resolution path for an activity's start BG.
 *
 * Prefers the closest CGM reading to run start (computed by RunBGContext from
 * `bg_readings`), which is more accurate than the first sample of the
 * `glucose` stream — that sample can be a sensor warm-up placeholder or noise.
 * Falls back to the first stream sample for activities without runBGContext.
 *
 * Returns null when no usable value exists (no glucose, no runBGContext) or
 * when the value is outside the plausible CGM range.
 */
export function getActivityStartBG(activity: CachedActivity): number | null {
  const preStart = plausible(activity.runBGContext?.pre?.startBG);
  if (preStart != null) return preStart;
  const glucose = activity.glucose;
  if (!glucose || glucose.length === 0) return null;
  return plausible(glucose[0].value);
}

/** Same resolution policy as `getActivityStartBG`, for end BG. */
export function getActivityEndBG(activity: CachedActivity): number | null {
  const postEnd = plausible(activity.runBGContext?.post?.endBG);
  if (postEnd != null) return postEnd;
  const glucose = activity.glucose;
  if (!glucose || glucose.length === 0) return null;
  return plausible(glucose[glucose.length - 1].value);
}
