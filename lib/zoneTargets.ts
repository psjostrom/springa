import type { ZoneName } from "./types";

/** Pace percentages when no pace table is available. Easy uses 30% floor (allows walking). */
export const HM_ZONE_DEFAULTS: Record<
  ZoneName | "walk",
  { min: number | null; max: number | null }
> = {
  walk: { min: null, max: null },
  z1: { min: null, max: null },
  z2: { min: 30, max: 88 },
  z3: { min: 99, max: 102 },
  z4: { min: 106, max: 111 },
  z5: { min: null, max: null },
};

/** Labels that stay targetless in every effort metric (walk, hills, strides, free). */
export const ALWAYS_TARGETLESS_LABELS = new Set([
  "Walk",
  "Uphill",
  "Downhill",
  "Stride",
  "Free",
]);

export function isTargetlessZone(zone: ZoneName | "walk"): boolean {
  const pct = HM_ZONE_DEFAULTS[zone];
  return pct.min == null || pct.max == null;
}
