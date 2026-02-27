import type { HRZoneName, PaceTable } from "./types";
import { HR_ZONE_BANDS, DEFAULT_MAX_HR, FALLBACK_PACE_TABLE } from "./constants";
import { formatPace, getZoneLabel } from "./format";

const ZONE_ORDER: HRZoneName[] = ["easy", "steady", "tempo", "hard"];

function bpm(lthr: number, frac: number, maxHr?: number): number {
  const raw = Math.round(lthr * frac);
  return maxHr ? Math.min(raw, maxHr) : raw;
}

/**
 * Map Intervals.icu hr_zones [Z1top, Z2top, Z3top, Z4top, Z5top] to zone BPM ranges.
 * hr_zones[0]=112 means Z2 starts at 112, hr_zones[1]=132 means Z2 ends / Z3 starts at 132, etc.
 */
function zonesFromHrArray(hrZones: number[]): Record<HRZoneName, { lo: number; hi: number }> {
  return {
    easy:   { lo: hrZones[0], hi: hrZones[1] },
    steady: { lo: hrZones[1], hi: hrZones[2] },
    tempo:  { lo: hrZones[2], hi: hrZones[3] },
    hard:   { lo: hrZones[3], hi: hrZones[4] },
  };
}

/**
 * Generates the pace zone block for AI prompts.
 * When hrZones is provided (from Intervals.icu), uses those exact BPM boundaries.
 * Otherwise computes from LTHR × HR_ZONE_BANDS fractions.
 */
export function buildZoneBlock(lthr: number, maxHr?: number, paceTable?: PaceTable, hrZones?: number[]): string {
  const table = paceTable ?? FALLBACK_PACE_TABLE;
  const garminZoneNum: Record<HRZoneName, string> = { easy: "Z2", steady: "Z3", tempo: "Z4", hard: "Z5" };
  const zoneBpm = hrZones?.length === 5
    ? zonesFromHrArray(hrZones)
    : null;

  return ZONE_ORDER.map((zone) => {
    const lo = zoneBpm ? zoneBpm[zone].lo : bpm(lthr, HR_ZONE_BANDS[zone].min);
    const hi = zoneBpm ? zoneBpm[zone].hi : bpm(lthr, HR_ZONE_BANDS[zone].max, maxHr);
    const label = getZoneLabel(zone);
    const zNum = garminZoneNum[zone];
    const entry = table[zone] ?? FALLBACK_PACE_TABLE[zone] ?? { zone, avgPace: 7.25, sampleCount: 0 };
    const paceStr = zone === "hard"
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
