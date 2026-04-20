import type { ZoneName, PaceTable } from "./types";
import { FALLBACK_PACE_TABLE, classifyHR, DEFAULT_LTHR } from "./constants";
import { formatPace, pctToMinPerKm } from "./format";

// --- PACE LOOKUP ---

/** Safe accessor for FALLBACK_PACE_TABLE entries (z2-z5 populated, z1 is null).
 *  Returns the zone's avgPace or a conservative 7.25 min/km default if the zone has no entry. */
function fallbackPace(zone: ZoneName): number {
  return FALLBACK_PACE_TABLE[zone]?.avgPace ?? 7.25;
}

export function paceForIntensity(avgPercent: number, table?: PaceTable): number {
  if (table) {
    if (avgPercent >= 95) return table.z5?.avgPace ?? fallbackPace("z5");
    if (avgPercent >= 88) return table.z4?.avgPace ?? fallbackPace("z4");
    if (avgPercent >= 80) return table.z3?.avgPace ?? fallbackPace("z3");
    return table.z2?.avgPace ?? fallbackPace("z2");
  }
  if (avgPercent >= 95) return fallbackPace("z5");
  if (avgPercent >= 88) return fallbackPace("z4");
  if (avgPercent >= 80) return fallbackPace("z3");
  return fallbackPace("z2");
}

// --- ZONE PARSING ---

/** Convert LTHR percentage to zone name using dynamic zone boundaries. */
function classifyIntensity(lthrPct: number, lthr: number, hrZones: number[]): ZoneName {
  const hr = (lthrPct / 100) * lthr;
  return classifyHR(hr, hrZones);
}

/** Classify zone from Intervals.icu pace percentage (higher % = faster). */
export function classifyPacePct(avgPct: number): ZoneName {
  if (avgPct >= 112) return "z5";
  if (avgPct >= 103) return "z4";
  if (avgPct >= 96) return "z3";
  return "z2";
}

/** Parse "M:SS" pace string to decimal min/km. */
function parsePaceStr(s: string): number {
  const [min, sec] = s.split(":").map(Number);
  return min + sec / 60;
}

/**
 * Parse a workout description and return all distinct HR zones used,
 * ordered from lowest to highest intensity.
 */
export function parseWorkoutZones(description: string, lthr = DEFAULT_LTHR, hrZones: number[] = [], thresholdPace?: number): ZoneName[] {
  const isPaceFormat = description.includes("% pace");
  const isAbsolutePace = description.includes("/km Pace");
  if (!isPaceFormat && !isAbsolutePace && hrZones.length !== 5) return [];

  const zones = new Set<ZoneName>();

  if (isAbsolutePace) {
    // Absolute pace format requires threshold to classify into zones
    if (!thresholdPace) return [];
    const absPaceMatches = Array.from(
      description.matchAll(/-\s*(?:[\w\s]*?\s+)?\d+(?:\.\d+)?(?:s|m|km)\s+(\d+:\d+)-(\d+:\d+)\/km\s*Pace/g),
    );
    for (const m of absPaceMatches) {
      const fastPace = parsePaceStr(m[1]);
      const slowPace = parsePaceStr(m[2]);
      const avgPace = (fastPace + slowPace) / 2;
      const avgPct = thresholdPace / avgPace * 100;
      zones.add(classifyPacePct(avgPct));
    }
  } else {
    const stepMatches = Array.from(
      description.matchAll(/-\s*(?:[\w\s]*?\s+)?\d+(?:\.\d+)?(?:s|m|km)\s+(\d+)-(\d+)%/g),
    );
    for (const m of stepMatches) {
      const minPct = parseInt(m[1], 10);
      const maxPct = parseInt(m[2], 10);
      const avgPct = (minPct + maxPct) / 2;
      zones.add(isPaceFormat ? classifyPacePct(avgPct) : classifyIntensity(avgPct, lthr, hrZones));
    }
  }

  const order: ZoneName[] = ["z2", "z3", "z4", "z5"];
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
  zone: ZoneName;         // classified zone name
  bpmRange: string;       // detail string: "112-132 bpm" (HR mode) or "6:30-7:15 /km" (pace mode)
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
export function parseWorkoutStructure(description: string, lthr = DEFAULT_LTHR, hrZones: number[] = [], racePacePerKm?: number): WorkoutSection[] {
  if (!description) return [];
  const isPaceFormat = description.includes("% pace");
  const isAbsolutePace = description.includes("/km Pace");
  if (!isPaceFormat && !isAbsolutePace && hrZones.length !== 5) return [];

  const sections: WorkoutSection[] = [];
  // HR-based: "- Warmup 10m 68-83% LTHR (115-140 bpm)"
  const hrStepPattern = /^-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?(\d+(?:\.\d+)?(?:s|m|km))\s+(\d+)-(\d+)%\s*LTHR\s*\(([^)]+)\)/;
  // Pace-based: "- Warmup 10m 85-94% pace intensity=warmup"
  const paceStepPattern = /^-\s*(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?(\d+(?:\.\d+)?(?:s|m|km))(?:\s+(\d+)-(\d+)%\s*pace)?/;
  // Absolute pace: "- Warmup 10m 6:15-7:52/km Pace intensity=warmup"
  const absPaceStepPattern = /^-\s*(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?(\d+(?:\.\d+)?(?:s|m|km))(?:\s+(\d+:\d+)-(\d+:\d+)\/km\s*Pace)?/;

  const stepPattern = isAbsolutePace ? absPaceStepPattern : isPaceFormat ? paceStepPattern : hrStepPattern;

  // Split into section blocks
  const sectionPattern = /(?:^|\n)(Warmup|Main set(?:\s+\d+x)?|Strides\s+\d+x|Cooldown)/gm;
  const headers: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(description)) !== null) {
    headers.push({ name: match[1], index: match.index });
  }

  const GENERIC_LABELS = ["Walk", "Easy", "Fast", "Race Pace", "Interval", "Warmup", "Cooldown"];

  function parseStep(m: RegExpExecArray): WorkoutStep {
    const label = m[1] && !GENERIC_LABELS.includes(m[1]) ? m[1] : undefined;
    const duration = m[2];

    if (isAbsolutePace) {
      // Absolute pace: groups 3,4 are pace strings like "5:33" and "5:44" (may be undefined for effort steps)
      if (m[3] && m[4]) {
        const fastPace = parsePaceStr(m[3]);
        const slowPace = parsePaceStr(m[4]);
        const avgPace = (fastPace + slowPace) / 2;
        const avgPct = racePacePerKm ? racePacePerKm / avgPace * 100 : 85;
        const zone = classifyPacePct(avgPct);
        return { label, duration, zone, bpmRange: `${formatPace(fastPace)}-${formatPace(slowPace)} /km` };
      }
      const zone: ZoneName = m[1] === "Walk" ? "z1" : "z5";
      return { label, duration, zone, bpmRange: "" };
    }

    if (isPaceFormat) {
      // Pace-based: groups 3,4 are pace percentages (may be undefined for effort steps)
      const minPct = m[3] ? parseInt(m[3], 10) : null;
      const maxPct = m[4] ? parseInt(m[4], 10) : null;
      if (minPct != null && maxPct != null) {
        const zone = classifyPacePct((minPct + maxPct) / 2);
        const detail = racePacePerKm
          ? `${formatPace(pctToMinPerKm(maxPct, racePacePerKm))}-${formatPace(pctToMinPerKm(minPct, racePacePerKm))} /km`
          : `${minPct}-${maxPct}% pace`;
        return { label, duration, zone, bpmRange: detail };
      }
      // Effort-based step (walk, strides) — no pace target
      const zone: ZoneName = m[1] === "Walk" ? "z1" : "z5";
      return { label, duration, zone, bpmRange: "" };
    }

    // HR-based: groups 3,4 are LTHR %, group 5 is bpm range
    const minPct = parseInt(m[3], 10);
    const maxPct = parseInt(m[4], 10);
    return {
      label,
      duration,
      zone: classifyIntensity((minPct + maxPct) / 2, lthr, hrZones),
      bpmRange: m[5],
    };
  }

  function parseLines(lines: string[]): WorkoutStep[] {
    const steps: WorkoutStep[] = [];
    for (const line of lines) {
      const m = stepPattern.exec(line);
      if (m) steps.push(parseStep(m));
    }
    return steps;
  }

  // Handle single-step workouts (no section headers, just step lines)
  if (headers.length === 0) {
    const steps = parseLines(description.split("\n"));
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

    const steps = parseLines(block.split("\n"));
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
  // Match HR-based ("X-Y% LTHR"), pace-based ("X-Y% pace"), and absolute pace ("M:SS-M:SS/km Pace") steps
  const stepPattern = /^-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:(Uphill|Downhill|Walk|Easy|Race Pace|Interval|Fast|Stride|Warmup|Cooldown)\s+)?\d+(?:\.\d+)?(?:s|m|km)\s+(?:\d+-\d+%|\d+:\d+-\d+:\d+\/km\s*Pace)/;

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
  intensity: number; // average percentage (LTHR % for HR format, pace % for pace formats)
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
function parseSectionSegments(section: string, table?: PaceTable, thresholdPace?: number): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [];
  const pctPattern = /(\d+(?:\.\d+)?)(s|m|km)\s+(\d+)-(\d+)%/;
  const absPacePattern = /(\d+(?:\.\d+)?)(s|m|km)\s+(\d+:\d+)-(\d+:\d+)\/km\s*Pace/;
  for (const rawLine of section.split("\n")) {
    if (!rawLine.startsWith("- ")) continue;
    const line = rawLine.slice(0, 150);
    const m = pctPattern.exec(line);
    if (m) {
      const value = parseFloat(m[1]);
      const unit = m[2];
      const avgPercent = (parseInt(m[3], 10) + parseInt(m[4], 10)) / 2;
      const conv = toMinutes(value, unit, avgPercent, table);
      segments.push({ duration: conv.minutes, intensity: avgPercent, estimated: conv.estimated, km: conv.km });
      continue;
    }
    const am = absPacePattern.exec(line);
    if (am) {
      const value = parseFloat(am[1]);
      const unit = am[2];
      const avgPace = (parsePaceStr(am[3]) + parsePaceStr(am[4])) / 2;
      const intensity = thresholdPace ? thresholdPace / avgPace * 100 : 85;
      if (unit === "km") {
        segments.push({ duration: value * avgPace, intensity, estimated: true, km: value });
      } else if (unit === "s") {
        segments.push({ duration: value / 60, intensity, estimated: false, km: null });
      } else {
        segments.push({ duration: value, intensity, estimated: false, km: null });
      }
    }
  }
  return segments;
}

/**
 * Parse a workout description into an ordered list of segments with duration and intensity.
 * Handles Warmup, Main set (with repeats), Strides (with repeats), Cooldown, and single-step workouts.
 */
export function parseWorkoutSegments(description: string, paceTable?: PaceTable, thresholdPace?: number): WorkoutSegment[] {
  if (!description) return [];
  const segments: WorkoutSegment[] = [];

  const hasSectionHeaders = /(?:^|\n)(Warmup|Main set|Strides|Cooldown)/m.test(description);
  if (!hasSectionHeaders) {
    return parseSectionSegments(description, paceTable, thresholdPace);
  }

  const warmupMatch = /(?:^|\n)Warmup\n(?:- [^\n]*\n?)*/.exec(description);
  if (warmupMatch) {
    segments.push(...parseSectionSegments(warmupMatch[0], paceTable, thresholdPace));
  }

  const mainSetSection = /\nMain set[^\n]*\n(?:- [^\n]*\n?)*/.exec(description);
  if (mainSetSection) {
    const repsMatch = /Main set\s+(\d+)x/.exec(mainSetSection[0]);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(mainSetSection[0], paceTable, thresholdPace);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  const stridesSection = /\nStrides\s+\d+x\n(?:- [^\n]*\n?)*/.exec(description);
  if (stridesSection) {
    const repsMatch = /Strides\s+(\d+)x/.exec(stridesSection[0]);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(stridesSection[0], paceTable, thresholdPace);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  const cooldownMatch = /\nCooldown\n(?:- [^\n]*\n?)*/.exec(description);
  if (cooldownMatch) {
    segments.push(...parseSectionSegments(cooldownMatch[0], paceTable, thresholdPace));
  }

  return segments;
}
