import type { HRZoneName, PaceTable } from "./types";
import { FALLBACK_PACE_TABLE, classifyHR, ZONE_TO_NAME, DEFAULT_LTHR } from "./constants";

// --- PACE LOOKUP ---

/** Resolve pace (min/km) for an LTHR intensity %, using calibrated table when available. */
/** Safe accessor for FALLBACK_PACE_TABLE entries (all four zones are always populated). */
function fallbackPace(zone: HRZoneName): number {
  return FALLBACK_PACE_TABLE[zone]?.avgPace ?? 7.25;
}

export function paceForIntensity(avgPercent: number, table?: PaceTable): number {
  if (table) {
    if (avgPercent >= 95) return table.hard?.avgPace ?? fallbackPace("hard");
    if (avgPercent >= 88) return table.tempo?.avgPace ?? fallbackPace("tempo");
    if (avgPercent >= 80) return table.steady?.avgPace ?? fallbackPace("steady");
    return table.easy?.avgPace ?? fallbackPace("easy");
  }
  if (avgPercent >= 95) return fallbackPace("hard");
  if (avgPercent >= 88) return fallbackPace("tempo");
  if (avgPercent >= 80) return fallbackPace("steady");
  return fallbackPace("easy");
}

// --- ZONE PARSING ---

/** Convert LTHR percentage to zone name using dynamic zone boundaries. */
function classifyIntensity(lthrPct: number, lthr: number, hrZones: number[]): HRZoneName {
  const hr = (lthrPct / 100) * lthr;
  return ZONE_TO_NAME[classifyHR(hr, hrZones)];
}

/**
 * Parse a workout description and return all distinct HR zones used,
 * ordered from lowest to highest intensity.
 */
export function parseWorkoutZones(description: string, lthr = DEFAULT_LTHR, hrZones: number[] = []): HRZoneName[] {
  if (hrZones.length !== 5) return [];
  const stepMatches = Array.from(
    description.matchAll(/-\s*(?:[\w\s]*?\s+)?\d+(?:\.\d+)?(?:s|m|km)\s+(\d+)-(\d+)%/g),
  );
  if (stepMatches.length === 0) return [];

  const zones = new Set<HRZoneName>();
  for (const m of stepMatches) {
    const minPct = parseInt(m[1], 10);
    const maxPct = parseInt(m[2], 10);
    zones.add(classifyIntensity((minPct + maxPct) / 2, lthr, hrZones));
  }

  const order: HRZoneName[] = ["easy", "steady", "tempo", "hard"];
  return order.filter((z) => zones.has(z));
}


// --- NOTES EXTRACTION ---

/** Extract notes/flavor text from between any header lines and the first section header or step line. */
export function extractNotes(description: string): string | null {
  if (!description) return null;
  // Look for first section header OR first step line (for single-step workouts)
  let firstSectionIdx = description.search(/(?:^|\n)Warmup/m);
  if (firstSectionIdx === -1) {
    // No section headers — look for first step line (starts with "- ")
    firstSectionIdx = description.search(/(?:^|\n)-\s+\d/m);
  }
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

/** Extract the workout structure (everything from the first section header or step line onward). */
export function extractStructure(description: string): string {
  if (!description) return "";
  // Look for first section header OR first step line (for single-step workouts)
  let firstSectionIdx = description.search(/(?:^|\n)Warmup/m);
  if (firstSectionIdx === -1) {
    // No section headers — look for first step line (starts with "- ")
    firstSectionIdx = description.search(/(?:^|\n)-\s+\d/m);
  }
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
export function parseWorkoutStructure(description: string, lthr = DEFAULT_LTHR, hrZones: number[] = []): WorkoutSection[] {
  if (!description || hrZones.length !== 5) return [];

  const sections: WorkoutSection[] = [];
  const stepPattern = /^-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?(\d+(?:\.\d+)?(?:s|m|km))\s+(\d+)-(\d+)%\s*LTHR\s*\(([^)]+)\)/;

  // Split into section blocks
  const sectionPattern = /(?:^|\n)(Warmup|Main set(?:\s+\d+x)?|Strides\s+\d+x|Cooldown)/gm;
  const headers: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(description)) !== null) {
    headers.push({ name: match[1], index: match.index });
  }

  // Handle single-step workouts (no section headers, just step lines)
  if (headers.length === 0) {
    const steps: WorkoutStep[] = [];
    for (const line of description.split("\n")) {
      const stepMatch = stepPattern.exec(line);
      if (stepMatch) {
        const minPct = parseInt(stepMatch[3], 10);
        const maxPct = parseInt(stepMatch[4], 10);
        steps.push({
          label: stepMatch[1] && !["Walk", "Easy", "Fast", "Race Pace", "Interval", "Warmup", "Cooldown"].includes(stepMatch[1]) ? stepMatch[1] : undefined,
          duration: stepMatch[2],
          zone: classifyIntensity((minPct + maxPct) / 2, lthr, hrZones),
          bpmRange: stepMatch[5],
        });
      }
    }
    if (steps.length > 0) {
      return [{ name: "Main set", steps }];
    }
    return [];
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : description.length;
    const block = description.slice(start, end);
    const headerText = headers[i].name;

    // Extract repeats
    const repeatsMatch = /(\d+)x$/.exec(headerText);
    const repeats = repeatsMatch ? parseInt(repeatsMatch[1], 10) : undefined;

    // Clean section name
    const name = headerText.replace(/\s+\d+x$/, "");

    // Parse steps
    const steps: WorkoutStep[] = [];
    const lines = block.split("\n");
    for (const line of lines) {
      const stepMatch = stepPattern.exec(line);
      if (stepMatch) {
        const minPct = parseInt(stepMatch[3], 10);
        const maxPct = parseInt(stepMatch[4], 10);
        steps.push({
          label: stepMatch[1] && !["Walk", "Easy", "Fast", "Race Pace", "Interval", "Warmup", "Cooldown"].includes(stepMatch[1]) ? stepMatch[1] : undefined,
          duration: stepMatch[2],
          zone: classifyIntensity((minPct + maxPct) / 2, lthr, hrZones),
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

// --- STEP TOTALS (for watch repeat tracking) ---

/**
 * Extract step name totals from repeat sections in a workout description.
 * Returns uppercase step names mapped to their total occurrence count,
 * only for steps inside sections with repeats > 1.
 * E.g. "Main set 6x" with "Uphill"/"Downhill" → { "UPHILL": 6, "DOWNHILL": 6 }
 */
export function extractStepTotals(description: string): Record<string, number> {
  if (!description) return {};

  const totals: Record<string, number> = {};
  const stepPattern = /^-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?\d+(?:\.\d+)?(?:s|m|km)\s+\d+-\d+%/;

  const sectionPattern = /(?:^|\n)(Warmup|Main set(?:\s+\d+x)?|Strides\s+\d+x|Cooldown)/gm;
  const headers: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(description)) !== null) {
    headers.push({ name: match[1], index: match.index });
  }

  for (let i = 0; i < headers.length; i++) {
    const repeatsMatch = /(\d+)x$/.exec(headers[i].name);
    if (!repeatsMatch) continue;
    const repeats = parseInt(repeatsMatch[1], 10);
    if (repeats <= 1) continue;

    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : description.length;
    const block = description.slice(start, end);

    for (const line of block.split("\n")) {
      const stepMatch = stepPattern.exec(line);
      if (stepMatch?.[1]) {
        const name = stepMatch[1].toUpperCase();
        totals[name] = (totals[name] ?? 0) + repeats;
      }
    }
  }

  return totals;
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
  // Extract step lines (start with "- "), then parse each for duration + intensity
  const stepPattern = /(\d+\.?\d*)(s|m|km)\s+(\d+)-(\d+)%/;
  for (const line of section.split("\n")) {
    if (!line.startsWith("- ")) continue;
    const m = stepPattern.exec(line);
    if (!m) continue;
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
 * Handles Warmup, Main set (with repeats), Strides (with repeats), Cooldown, and single-step workouts.
 */
export function parseWorkoutSegments(description: string, paceTable?: PaceTable): WorkoutSegment[] {
  if (!description) return [];
  const segments: WorkoutSegment[] = [];

  // Check if this is a single-step workout (no section headers)
  const hasSectionHeaders = /(?:^|\n)(Warmup|Main set|Strides|Cooldown)/m.test(description);
  if (!hasSectionHeaders) {
    // Single-step workout — parse all step lines directly
    return parseSectionSegments(description, paceTable);
  }

  // Warmup
  const warmupMatch = /(?:^|\n)Warmup\n(?:- [^\n]*\n?)*/.exec(description);
  if (warmupMatch) {
    segments.push(...parseSectionSegments(warmupMatch[0], paceTable));
  }

  // Main set (with optional repeats)
  const mainSetSection = /\nMain set[^\n]*\n(?:- [^\n]*\n?)*/.exec(description);
  if (mainSetSection) {
    const repsMatch = /Main set\s+(\d+)x/.exec(mainSetSection[0]);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(mainSetSection[0], paceTable);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  // Strides (with optional repeats)
  const stridesSection = /\nStrides\s+\d+x\n(?:- [^\n]*\n?)*/.exec(description);
  if (stridesSection) {
    const repsMatch = /Strides\s+(\d+)x/.exec(stridesSection[0]);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(stridesSection[0], paceTable);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  // Cooldown
  const cooldownMatch = /\nCooldown\n(?:- [^\n]*\n?)*/.exec(description);
  if (cooldownMatch) {
    const cdSegs = parseSectionSegments(cooldownMatch[0], paceTable);
    segments.push(...cdSegs);
  }

  return segments;
}
