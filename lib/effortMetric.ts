import { isByFeel } from "./byFeel";

export type EffortMetric = "pace" | "hr" | "feel";

const ALLOWED = new Set<EffortMetric>(["pace", "hr", "feel"]);

export function isEffortMetric(value: unknown): value is EffortMetric {
  return typeof value === "string" && ALLOWED.has(value as EffortMetric);
}

export function normalizeEffortMetric(value: unknown): EffortMetric {
  return isEffortMetric(value) ? value : "pace";
}

export function canUseHeartRateMetric(
  lthr?: number,
  hrZones?: number[],
): boolean {
  return (
    typeof lthr === "number" &&
    Number.isFinite(lthr) &&
    lthr > 0 &&
    hrZones?.length === 5 &&
    hrZones.every((zone) => Number.isFinite(zone))
  );
}

/** Detect prescription metric from workout name + description markers. */
export function detectEffortMetric(
  name: string,
  description: string,
): EffortMetric {
  if (isByFeel(name)) return "feel";
  if (/%\s*LTHR/.test(description)) return "hr";
  if (/\/km Pace|%\s*pace/.test(description)) return "pace";
  return "feel";
}
