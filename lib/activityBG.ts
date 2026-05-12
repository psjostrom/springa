import type { CachedActivity } from "./activityStreamsDb";

/**
 * Single resolution path for an activity's start BG.
 *
 * Prefers the closest CGM reading to run start (computed by RunBGContext from
 * `bg_readings`), which is more accurate than the first sample of the
 * `glucose` stream — that sample can be a sensor warm-up placeholder or noise.
 * Falls back to the first stream sample for activities without runBGContext.
 *
 * Returns null when no usable value exists (no glucose, no runBGContext).
 * Callers that need a "valid CGM reading" gate should also reject `<= 0`.
 */
export function getActivityStartBG(activity: CachedActivity): number | null {
  const preStart = activity.runBGContext?.pre?.startBG;
  if (preStart != null) return preStart;
  const glucose = activity.glucose;
  if (!glucose || glucose.length === 0) return null;
  return glucose[0].value;
}

/** Same resolution policy as `getActivityStartBG`, for end BG. */
export function getActivityEndBG(activity: CachedActivity): number | null {
  const postEnd = activity.runBGContext?.post?.endBG;
  if (postEnd != null) return postEnd;
  const glucose = activity.glucose;
  if (!glucose || glucose.length === 0) return null;
  return glucose[glucose.length - 1].value;
}
