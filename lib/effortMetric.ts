import { isByFeel } from "./byFeel";

export type EffortMetric = "pace" | "hr" | "feel";

const ALLOWED = new Set<EffortMetric>(["pace", "hr", "feel"]);

export function normalizeEffortMetric(value: unknown): EffortMetric {
  return typeof value === "string" && ALLOWED.has(value as EffortMetric)
    ? (value as EffortMetric)
    : "pace";
}

export function canUseHeartRateMetric(
  lthr?: number,
  hrZones?: number[],
): boolean {
  return typeof lthr === "number" && lthr > 0 && hrZones?.length === 5;
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
