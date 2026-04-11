import type { ZoneName, PaceTable } from "./types";
import { resolveZoneBand, DEFAULT_MAX_HR, FALLBACK_PACE_TABLE } from "./constants";
import { formatPace, getZoneLabel } from "./format";

const ZONE_ORDER: ZoneName[] = ["z2", "z3", "z4", "z5"];

/**
 * Generates the pace zone block for AI prompts.
 * Requires hrZones from Intervals.icu.
 */
export function buildZoneBlock(lthr: number, maxHr?: number, paceTable?: PaceTable, hrZones: number[] = []): string {
  const table = paceTable ?? FALLBACK_PACE_TABLE;
  const garminZoneNum: Record<ZoneName, string> = { z1: "Z1", z2: "Z2", z3: "Z3", z4: "Z4", z5: "Z5" };

  if (hrZones.length !== 5) {
    return "(HR zones not available — sync from Intervals.icu)";
  }

  return ZONE_ORDER.map((zone) => {
    const band = resolveZoneBand(zone, lthr, hrZones);
    const lo = Math.floor(lthr * band.min);
    const hi = Math.min(Math.ceil(lthr * band.max), maxHr ?? Infinity);
    const label = getZoneLabel(zone);
    const zNum = garminZoneNum[zone];
    const entry = table[zone] ?? FALLBACK_PACE_TABLE[zone] ?? { zone, avgPace: 7.25, sampleCount: 0 };
    const paceStr = zone === "z5"
      ? `<${formatPace(entry.avgPace)}/km`
      : `~${formatPace(entry.avgPace)}/km`;
    return `- ${label}: ${paceStr} (${zNum}, ${lo}-${hi} bpm)`;
  }).join("\n");
}

/**
 * One-line profile summary for AI prompts.
 */
export function buildProfileLine(lthr: number, maxHr?: number): string {
  const mhr = maxHr ?? DEFAULT_MAX_HR;
  return `LTHR ${lthr} bpm, Max HR ${mhr} bpm`;
}
