import type {
  HRZoneName,
  PaceTable,
  ZonePaceEntry,
  CalendarEvent,
  WorkoutEvent,
} from "./types";
import { FALLBACK_PACE_TABLE, PACE_ESTIMATES, classifyZone } from "./constants";

// --- ZONE LABELS ---

const ZONE_LABELS: Record<HRZoneName, string> = {
  easy: "Easy",
  steady: "Race Pace",
  tempo: "Interval",
  hard: "Hard",
};

export function getZoneLabel(zone: HRZoneName): string {
  return ZONE_LABELS[zone];
}

// --- PACE ---

/** Format decimal pace (e.g. 6.15) as "6:09" */
export function formatPace(paceMinPerKm: number): string {
  const totalSeconds = Math.round(paceMinPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Returns data-driven entry or falls back to hardcoded values */
export function getPaceForZone(
  table: PaceTable,
  zone: HRZoneName,
): ZonePaceEntry {
  return table[zone] ?? FALLBACK_PACE_TABLE[zone]!;
}

/**
 * Build easy pace from historical easy and long runs (excluding strides).
 * Returns a data-driven easy pace entry with avg HR, or null if no data.
 */
export function buildEasyPaceFromHistory(
  events: CalendarEvent[],
): ZonePaceEntry | null {
  const easyRuns = events.filter((e) => {
    if (e.type !== "completed") return false;
    if (!e.distance || !e.duration || !e.avgHr) return false;
    const name = e.name.toLowerCase();
    const isEasyOrLong =
      name.includes("easy") || name.includes("long") || name.includes("bonus");
    const hasStrides = name.includes("strides");
    return isEasyOrLong && !hasStrides;
  });

  if (easyRuns.length === 0) return null;

  let totalPace = 0;
  let totalHr = 0;
  let validCount = 0;

  for (const e of easyRuns) {
    const distKm = e.distance! / 1000;
    if (distKm < 0.5) continue;
    const durMin = e.duration! / 60;
    const pace = durMin / distKm;
    if (pace < 2.0 || pace > 12.0) continue;
    totalPace += pace;
    totalHr += e.avgHr!;
    validCount++;
  }

  if (validCount === 0) return null;

  return {
    zone: "easy",
    avgPace: totalPace / validCount,
    sampleCount: validCount,
    avgHr: Math.round(totalHr / validCount),
  };
}

// --- HR ZONE CLASSIFICATION ---

/** Classify avgHr into a zone name based on LTHR ratio (Garmin LTHR zones) */
export function classifyHRZone(avgHr: number, lthr: number): HRZoneName {
  return classifyZone((avgHr / lthr) * 100);
}

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

// --- PRE-RUN CARD PARSING ---

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

// --- WORKOUT DESCRIPTION PARSING ---

export interface WorkoutSegment {
  duration: number; // in minutes
  intensity: number; // average LTHR percentage (0-100)
  estimated: boolean; // true if duration was converted from km using pace estimates
  km: number | null; // original km value if distance-based, null if time-based
}

/** Convert a value+unit into minutes, using pace estimates for km distances. */
function toMinutes(value: number, unit: string, avgPercent: number): { minutes: number; estimated: boolean; km: number | null } {
  if (unit === "km") {
    let pace: number;
    if (avgPercent >= 95) pace = PACE_ESTIMATES.hard;
    else if (avgPercent >= 88) pace = PACE_ESTIMATES.tempo;
    else if (avgPercent >= 80) pace = PACE_ESTIMATES.steady;
    else pace = PACE_ESTIMATES.easy;
    return { minutes: value * pace, estimated: true, km: value };
  }
  if (unit === "s") return { minutes: value / 60, estimated: false, km: null };
  return { minutes: value, estimated: false, km: null }; // "m" = already minutes
}

/** Parse step lines within a section, returning total duration and individual segments. */
function parseSectionSegments(section: string): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [];
  const stepMatches = Array.from(
    section.matchAll(/-\s*(?:(?:PUMP.*?|FUEL PER 10:\s*\d+g(?:\s+TOTAL:\s*\d+g)?)\s+)?(?:\w[\w ]*\s+)?(\d+(?:\.\d+)?)(s|m|km)\s+(\d+)-(\d+)%/g),
  );
  for (const m of stepMatches) {
    const value = parseFloat(m[1]);
    const unit = m[2];
    const avgPercent = (parseInt(m[3], 10) + parseInt(m[4], 10)) / 2;
    const conv = toMinutes(value, unit, avgPercent);
    segments.push({ duration: conv.minutes, intensity: avgPercent, estimated: conv.estimated, km: conv.km });
  }
  return segments;
}

/**
 * Parse a workout description into an ordered list of segments with duration and intensity.
 * Handles Warmup, Main set (with repeats), Strides (with repeats), and Cooldown.
 */
export function parseWorkoutSegments(description: string): WorkoutSegment[] {
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
      const conv = toMinutes(value, unit, avgPercent);
      segments.push({ duration: conv.minutes, intensity: avgPercent, estimated: conv.estimated, km: conv.km });
    }
  }

  // Main set (with optional repeats)
  const mainSetSection = description.match(/\nMain set[\s\S]*?(?=\nStrides|\nCooldown|$)/);
  if (mainSetSection) {
    const repsMatch = mainSetSection[0].match(/Main set\s+(\d+)x/);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(mainSetSection[0]);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  // Strides (with optional repeats)
  const stridesSection = description.match(/\nStrides\s+\d+x[\s\S]*?(?=\nCooldown|$)/);
  if (stridesSection) {
    const repsMatch = stridesSection[0].match(/Strides\s+(\d+)x/);
    const reps = repsMatch ? parseInt(repsMatch[1], 10) : 1;
    const stepSegs = parseSectionSegments(stridesSection[0]);
    for (let r = 0; r < reps; r++) {
      segments.push(...stepSegs);
    }
  }

  // Cooldown
  const cooldownMatch = description.match(/\nCooldown[\s\S]*$/);
  if (cooldownMatch) {
    const cdSegs = parseSectionSegments(cooldownMatch[0]);
    segments.push(...cdSegs);
  }

  return segments;
}

// --- HELPER FUNCTIONS ---

export const getEstimatedDuration = (event: WorkoutEvent): number => {
  if (event.name.includes("Long")) {
    const match = event.name.match(/(\d+)km/);
    if (match) return parseInt(match[1], 10) * 6;
  }
  return 45;
};

export function estimateWorkoutDuration(description: string): { minutes: number; estimated: boolean } | null {
  const segments = parseWorkoutSegments(description);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  if (total <= 0) return null;
  const estimated = segments.some((s) => s.estimated);
  return { minutes: Math.round(total), estimated };
}

/** Estimate total distance (km) from a workout description. Returns exact km for distance-based workouts, estimated for time-based. */
export function estimateWorkoutDescriptionDistance(description: string): { km: number; estimated: boolean } | null {
  const segments = parseWorkoutSegments(description);
  if (segments.length === 0) return null;
  let totalKm = 0;
  let hasTimeBasedSegment = false;
  for (const seg of segments) {
    if (seg.km != null) {
      totalKm += seg.km;
    } else {
      hasTimeBasedSegment = true;
      // Convert time → km using pace estimates
      let pace: number;
      if (seg.intensity >= 95) pace = PACE_ESTIMATES.hard;
      else if (seg.intensity >= 88) pace = PACE_ESTIMATES.tempo;
      else if (seg.intensity >= 80) pace = PACE_ESTIMATES.steady;
      else pace = PACE_ESTIMATES.easy;
      totalKm += seg.duration / pace;
    }
  }
  if (totalKm <= 0) return null;
  return { km: Math.round(totalKm * 10) / 10, estimated: hasTimeBasedSegment };
}

export const formatStep = (
  duration: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  note?: string,
): string => {
  const minBpm = Math.floor(lthr * minPct);
  const maxBpm = Math.ceil(lthr * maxPct);
  const core = `${duration} ${Math.floor(minPct * 100)}-${Math.ceil(maxPct * 100)}% LTHR (${minBpm}-${maxBpm} bpm)`;
  return note ? `${note} ${core}` : core;
};

export const calculateWorkoutCarbs = (
  durationMinutes: number,
  fuelRateGPerHour: number,
): number => {
  return Math.round((durationMinutes / 60) * fuelRateGPerHour);
};

export const createWorkoutText = (
  warmup: string,
  mainSteps: string[],
  cooldown: string,
  repeats: number = 1,
  notes?: string,
): string => {
  const lines: string[] = [];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(
    "Warmup",
    `- ${warmup}`,
    "",
    repeats > 1 ? `Main set ${repeats}x` : "Main set",
    ...mainSteps.map((s) => `- ${s}`),
    "",
    "Cooldown",
    `- ${cooldown}`,
    "",
  );

  return lines.join("\n");
};

// --- CALENDAR HELPERS ---
// (Extracted from CalendarView.tsx)

/** Extract fuel rate from description and convert to g/h (e.g., "FUEL PER 10: 10g" -> 60) */
export const extractFuelRate = (description: string): number | null => {
  const newMatch = description.match(/FUEL PER 10:\s*(\d+)g/i);
  if (newMatch) return parseInt(newMatch[1], 10) * 6;

  const oldMatch = description.match(/FUEL:\s*(\d+)g\/10m/i);
  return oldMatch ? parseInt(oldMatch[1], 10) * 6 : null;
};

/** Extract total carbs from description (e.g., "TOTAL: 63g" -> 63) */
export const extractTotalCarbs = (description: string): number | null => {
  const match = description.match(/TOTAL:\s*(\d+)g/i);
  return match ? parseInt(match[1], 10) : null;
};

// --- GLUCOSE CONVERSION ---

/** Smart glucose conversion: converts mg/dL to mmol/L only when needed */
export function convertGlucoseToMmol(values: number[]): number[] {
  if (values.length === 0) return values;

  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
  const maxValue = Math.max(...values);

  const needsConversion = avgValue > 15 || maxValue > 20;

  if (needsConversion) {
    return values.map((v) => v / 18.018);
  }
  return values;
}

// --- DISTANCE ESTIMATION ---

export function estimateWorkoutDistance(event: CalendarEvent): number {
  if (event.distance) {
    return event.distance / 1000;
  }
  const kmMatch = event.name.match(/\((\d+)km\)/);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const pace =
    event.category === "interval"
      ? PACE_ESTIMATES.tempo
      : PACE_ESTIMATES.easy;

  const parsed = estimateWorkoutDuration(event.description);
  if (parsed) return parsed.minutes / pace;

  if (event.duration) return event.duration / 60 / pace;

  return 0;
}

/** Estimate distance (km) from a generated WorkoutEvent (no activity data). */
export function estimatePlanEventDistance(event: WorkoutEvent): number {
  const kmMatch = event.name.match(/\((\d+)km\)/);
  if (kmMatch) return parseInt(kmMatch[1], 10);

  const isInterval = /interval|hills|short|long intervals|distance intervals|race pace/i.test(event.name);
  const pace = isInterval ? PACE_ESTIMATES.tempo : PACE_ESTIMATES.easy;
  const parsed = estimateWorkoutDuration(event.description);
  if (parsed) return parsed.minutes / pace;
  return 0;
}

// --- ID PARSING ---

/** Extract numeric event ID from prefixed string (e.g. "event-1002" → 1002). Returns NaN for non-event IDs. */
export function parseEventId(id: string): number {
  return parseInt(id.replace("event-", ""), 10);
}

// --- DURATION FORMATTING ---

/** Format seconds as "Xh Ym" or "Ym". */
export function formatDuration(seconds: number): string {
  const totalMins = Math.floor(seconds / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

// --- WORKOUT CATEGORIZATION ---

export function getWorkoutCategory(
  name: string,
): "long" | "interval" | "easy" | "other" {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("long")) return "long";
  if (
    lowerName.includes("interval") ||
    lowerName.includes("hills") ||
    lowerName.includes("tempo") ||
    lowerName.includes("race pace")
  )
    return "interval";
  if (
    lowerName.includes("easy") ||
    lowerName.includes("bonus") ||
    lowerName.includes("strides")
  )
    return "easy";
  return "other";
}
