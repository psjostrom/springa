import type { HRZoneName, PaceTable } from "./types";
import { FALLBACK_PACE_TABLE, classifyZone } from "./constants";

// --- PACE LOOKUP ---

/** Resolve pace (min/km) for an LTHR intensity %, using calibrated table when available. */
export function paceForIntensity(avgPercent: number, table?: PaceTable): number {
  const fb = FALLBACK_PACE_TABLE;
  if (table) {
    if (avgPercent >= 95) return table.hard?.avgPace ?? fb.hard!.avgPace;
    if (avgPercent >= 88) return table.tempo?.avgPace ?? fb.tempo!.avgPace;
    if (avgPercent >= 80) return table.steady?.avgPace ?? fb.steady!.avgPace;
    return table.easy?.avgPace ?? fb.easy!.avgPace;
  }
  if (avgPercent >= 95) return fb.hard!.avgPace;
  if (avgPercent >= 88) return fb.tempo!.avgPace;
  if (avgPercent >= 80) return fb.steady!.avgPace;
  return fb.easy!.avgPace;
}

// --- ZONE PARSING ---

/**
 * Parse a workout description and return all distinct HR zones used,
 * ordered from lowest to highest intensity.
 */
export function parseWorkoutZones(description: string): HRZoneName[] {
  const stepMatches = Array.from(
    description.matchAll(/-\s*(?:[\w\s]*?\s+)?\d+(?:\.\d+)?(?:s|m|km)\s+(\d+)-(\d+)%/g),
  );
  if (stepMatches.length === 0) return [];

  const zones = new Set<HRZoneName>();
  for (const m of stepMatches) {
    const minPct = parseInt(m[1], 10);
    const maxPct = parseInt(m[2], 10);
    zones.add(classifyZone((minPct + maxPct) / 2));
  }

  const order: HRZoneName[] = ["easy", "steady", "tempo", "hard"];
  return order.filter((z) => zones.has(z));
}

// --- FUEL EXTRACTION ---

export interface FuelStatus {
  fuelRate: number | null;
  totalCarbs: number | null;
}

/** Extract fuel rate and total carbs from the strategy header line. */
export function extractFuelStatus(description: string): FuelStatus {
  return {
    fuelRate: extractFuelRate(description),
    totalCarbs: extractTotalCarbs(description),
  };
}

/** Extract fuel rate from description and convert to g/h (e.g., "FUEL PER 10: 10g" -> 60) */
export function extractFuelRate(description: string): number | null {
  const newMatch = description.match(/FUEL PER 10:\s*(\d+)g/i);
  if (newMatch) return parseInt(newMatch[1], 10) * 6;

  const oldMatch = description.match(/FUEL:\s*(\d+)g\/10m/i);
  return oldMatch ? parseInt(oldMatch[1], 10) * 6 : null;
}

/** Extract total carbs from description (e.g., "TOTAL: 63g" -> 63) */
export function extractTotalCarbs(description: string): number | null {
  const match = description.match(/TOTAL:\s*(\d+)g/i);
  return match ? parseInt(match[1], 10) : null;
}

// --- NOTES EXTRACTION ---

/** Extract notes/flavor text from between any header lines and the first section header. */
export function extractNotes(description: string): string | null {
  if (!description) return null;
  const firstSectionIdx = description.search(/(?:^|\n)Warmup/m);
  if (firstSectionIdx === -1) return null;
  const preamble = description.slice(0, firstSectionIdx);
  const lines = preamble.split("\n");
  // Filter out blank lines, FUEL strategy lines, and PUMP lines (backward compat)
  const noteLines = lines.filter((l) => {
    const trimmed = l.trim();
    if (trimmed.length === 0) return false;
    if (/^FUEL PER 10:/i.test(trimmed)) return false;
    if (/^PUMP/i.test(trimmed)) return false;
    if (/^\(Trail\)$/i.test(trimmed)) return false;
    return true;
  });
  return noteLines.length > 0 ? noteLines.join(" ") : null;
}

/** Extract the workout structure (everything from the first section header onward). */
export function extractStructure(description: string): string {
  if (!description) return "";
  const firstSectionIdx = description.search(/(?:^|\n)Warmup/m);
  if (firstSectionIdx === -1) return "";
  return description.slice(firstSectionIdx).trim();
}

// --- STRUCTURE PARSING ---

export interface WorkoutStep {
  label?: string;         // "Uphill", "Downhill", or undefined
  duration: string;       // raw: "10m", "2m", "8km", "20s"
  zone: HRZoneName;       // classified zone name
  bpmRange: string;       // "112-132 bpm"
}

export interface WorkoutSection {
  name: string;           // "Warmup", "Main set", "Strides", "Cooldown"
  repeats?: number;       // e.g. 6 for "Main set 6x"
  steps: WorkoutStep[];
}

/**
 * Parse a workout description into structured sections for display.
 * Returns the raw display strings (unlike parseWorkoutSegments which returns computed values).
 */
export function parseWorkoutStructure(description: string): WorkoutSection[] {
  if (!description) return [];

  const sections: WorkoutSection[] = [];
  const stepPattern = /^-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?(\d+(?:\.\d+)?(?:s|m|km))\s+(\d+)-(\d+)%\s*LTHR\s*\(([^)]+)\)/;

  // Split into section blocks
  const sectionPattern = /(?:^|\n)(Warmup|Main set(?:\s+\d+x)?|Strides\s+\d+x|Cooldown)/gm;
  const headers: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(description)) !== null) {
    headers.push({ name: match[1], index: match.index });
  }

  if (headers.length === 0) return [];

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : description.length;
    const block = description.slice(start, end);
    const headerText = headers[i].name;

    // Extract repeats
    const repeatsMatch = headerText.match(/(\d+)x$/);
    const repeats = repeatsMatch ? parseInt(repeatsMatch[1], 10) : undefined;

    // Clean section name
    const name = headerText.replace(/\s+\d+x$/, "");

    // Parse steps
    const steps: WorkoutStep[] = [];
    const lines = block.split("\n");
    for (const line of lines) {
      const stepMatch = line.match(stepPattern);
      if (stepMatch) {
        const minPct = parseInt(stepMatch[3], 10);
        const maxPct = parseInt(stepMatch[4], 10);
        steps.push({
          label: stepMatch[1] && !["Walk", "Easy", "Fast", "Race Pace", "Interval", "Warmup", "Cooldown"].includes(stepMatch[1]) ? stepMatch[1] : undefined,
          duration: stepMatch[2],
          zone: classifyZone((minPct + maxPct) / 2),
          bpmRange: stepMatch[5],
        });
      }
    }

    if (steps.length > 0) {
      sections.push({ name, repeats, steps });
    }
  }

  return sections;
}

// --- SEGMENT PARSING ---

export interface WorkoutSegment {
  duration: number; // in minutes
  intensity: number; // average LTHR percentage (0-100)
  estimated: boolean; // true if duration was converted from km using pace estimates
  km: number | null; // original km value if distance-based, null if time-based
}

/** Convert a value+unit into minutes, using pace estimates for km distances. */
function toMinutes(value: number, unit: string, avgPercent: number, table?: PaceTable): { minutes: number; estimated: boolean; km: number | null } {
  if (unit === "km") {
    return { minutes: value * paceForIntensity(avgPercent, table), estimated: true, km: value };
  }
  if (unit === "s") return { minutes: value / 60, estimated: false, km: null };
  return { minutes: value, estimated: false, km: null }; // "m" = already minutes
}

/** Parse step lines within a section, returning total duration and individual segments. */
function parseSectionSegments(section: string, table?: PaceTable): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [];
  const stepMatches = Array.from(
    section.matchAll(/-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:\w[\w ]*\s+)?(\d+(?:\.\d+)?)(s|m|km)\s+(\d+)-(\d+)%/g),
  );
  for (const m of stepMatches) {
    const value = parseFloat(m[1]);
    const unit = m[2];
    const avgPercent = (parseInt(m[3], 10) + parseInt(m[4], 10)) / 2;
    const conv = toMinutes(value, unit, avgPercent, table);
    segments.push({ duration: conv.minutes, intensity: avgPercent, estimated: conv.estimated, km: conv.km });
  }
  return segments;
}

/**
 * Parse a workout description into an ordered list of segments with duration and intensity.
 * Handles Warmup, Main set (with repeats), Strides (with repeats), and Cooldown.
 */
export function parseWorkoutSegments(description: string, paceTable?: PaceTable): WorkoutSegment[] {
  if (!description) return [];
  const segments: WorkoutSegment[] = [];

  // Warmup
  const warmupMatch = description.match(/(?:^|\n)Warmup[\s\S]*?(?=\nMain set|\nStrides|\nCooldown|$)/);
  if (warmupMatch) {
    const wuStep = warmupMatch[0].match(/-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:\w[\w ]*\s+)?(\d+(?:\.\d+)?)(s|m|km)\s+(\d+)-(\d+)%/);
    if (wuStep) {
      const value = parseFloat(wuStep[1]);
      const unit = wuStep[2];
      const avgPercent = (parseInt(wuStep[3], 10) + parseInt(wuStep[4], 10)) / 2;
      const conv = toMinutes(value, unit, avgPercent, paceTable);
      segments.push({ duration: conv.minutes, intensity: avgPercent, estimated: conv.estimated, km: conv.km });
    }
  }

  // Main set (with optional repeats)
  const mainSetSection = description.match(/\nMain set[\s\S]*?(?=\nStrides|\nCooldown|$)/);
  if (mainSetSection) {
    const repsMatch = mainSetSection[0].match(/Main set\s+(\d+)x/);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(mainSetSection[0], paceTable);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  // Strides (with optional repeats)
  const stridesSection = description.match(/\nStrides\s+\d+x[\s\S]*?(?=\nCooldown|$)/);
  if (stridesSection) {
    const repsMatch = stridesSection[0].match(/Strides\s+(\d+)x/);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(stridesSection[0], paceTable);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  // Cooldown
  const cooldownMatch = description.match(/\nCooldown[\s\S]*$/);
  if (cooldownMatch) {
    const cdSegs = parseSectionSegments(cooldownMatch[0], paceTable);
    segments.push(...cdSegs);
  }

  return segments;
}
