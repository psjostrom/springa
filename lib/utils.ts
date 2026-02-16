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
    description.matchAll(/-\s*(?:[\w\s]*?\s+)?\d+(m|km)\s+(\d+)-(\d+)%/g),
  );
  if (stepMatches.length === 0) return [];

  const zones = new Set<HRZoneName>();
  for (const m of stepMatches) {
    const maxPct = parseInt(m[3], 10);
    zones.add(classifyZone(maxPct));
  }

  const order: HRZoneName[] = ["easy", "steady", "tempo", "hard"];
  return order.filter((z) => zones.has(z));
}

// --- WORKOUT DESCRIPTION PARSING ---

export interface WorkoutSegment {
  duration: number; // in minutes
  intensity: number; // average LTHR percentage (0-100)
}

/** Convert a value+unit into minutes, using pace estimates for km distances. */
function toMinutes(value: number, unit: string, avgPercent: number): number {
  if (unit === "km") {
    let pace: number;
    if (avgPercent >= 95) pace = PACE_ESTIMATES.hard;
    else if (avgPercent >= 88) pace = PACE_ESTIMATES.tempo;
    else if (avgPercent >= 80) pace = PACE_ESTIMATES.steady;
    else pace = PACE_ESTIMATES.easy;
    return value * pace;
  }
  if (unit === "s") return value / 60;
  return value; // "m" = already minutes
}

/** Parse step lines within a section, returning total duration and individual segments. */
function parseSectionSegments(section: string): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [];
  const stepMatches = Array.from(
    section.matchAll(/-\s*(?:Uphill\s+|Downhill\s+)?(\d+)(s|m|km)\s+(\d+)-(\d+)%/g),
  );
  for (const m of stepMatches) {
    const value = parseInt(m[1], 10);
    const unit = m[2];
    const avgPercent = (parseInt(m[3], 10) + parseInt(m[4], 10)) / 2;
    segments.push({ duration: toMinutes(value, unit, avgPercent), intensity: avgPercent });
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
  const warmupMatch = description.match(/\nWarmup[\s\S]*?(?=\nMain set|\nStrides|\nCooldown|$)/);
  if (warmupMatch) {
    const wuStep = warmupMatch[0].match(/-\s*(?:PUMP.*?\s+)?(\d+)(s|m|km)\s+(\d+)-(\d+)%/);
    if (wuStep) {
      const value = parseInt(wuStep[1], 10);
      const unit = wuStep[2];
      const avgPercent = (parseInt(wuStep[3], 10) + parseInt(wuStep[4], 10)) / 2;
      segments.push({ duration: toMinutes(value, unit, avgPercent), intensity: avgPercent });
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

export function estimateWorkoutDuration(description: string): number | null {
  const segments = parseWorkoutSegments(description);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  return total > 0 ? Math.round(total) : null;
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
  fuelRateGPer10Min: number,
): number => {
  return Math.round((durationMinutes / 10) * fuelRateGPer10Min);
};

export const createWorkoutText = (
  title: string,
  warmup: string,
  mainSteps: string[],
  cooldown: string,
  repeats: number = 1,
  notes?: string,
): string => {
  const lines = [title, ""];

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

/** Extract fuel rate from description (e.g., "FUEL PER 10: 10g" -> 10) */
export const extractFuelRate = (description: string): number | null => {
  const newMatch = description.match(/FUEL PER 10:\s*(\d+)g/i);
  if (newMatch) return parseInt(newMatch[1], 10);

  const oldMatch = description.match(/FUEL:\s*(\d+)g\/10m/i);
  return oldMatch ? parseInt(oldMatch[1], 10) : null;
};

/** Extract total carbs from description (e.g., "TOTAL: 63g" -> 63) */
export const extractTotalCarbs = (description: string): number | null => {
  const match = description.match(/TOTAL:\s*(\d+)g/i);
  return match ? parseInt(match[1], 10) : null;
};

/** Estimate pace from average HR (min/km) */
export const estimatePaceFromHR = (avgHr: number, lthr: number = 169): number => {
  const hrPercent = avgHr / lthr;
  if (hrPercent < 0.8) return 6.75;
  if (hrPercent < 0.84) return 6.15;
  if (hrPercent < 0.94) return 5.15;
  return 4.75;
};

/** Calculate total carbs for a calendar event */
export const calculateTotalCarbs = (event: CalendarEvent): number | null => {
  const totalFromDesc = extractTotalCarbs(event.description);
  if (totalFromDesc) return totalFromDesc;

  const fuelRate = extractFuelRate(event.description);
  if (!fuelRate) return null;

  let durationMinutes: number;

  if (event.duration) {
    durationMinutes = event.duration / 60;
  } else if (event.distance && event.avgHr) {
    const distanceKm = event.distance / 1000;
    const paceMinPerKm = estimatePaceFromHR(event.avgHr);
    durationMinutes = distanceKm * paceMinPerKm;
  } else if (event.distance) {
    const distanceKm = event.distance / 1000;
    durationMinutes = distanceKm * 6;
  } else {
    return null;
  }

  return Math.round((durationMinutes / 10) * fuelRate);
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

  const parsedMinutes = estimateWorkoutDuration(event.description);
  if (parsedMinutes) return parsedMinutes / pace;

  if (event.duration) return event.duration / 60 / pace;

  return 0;
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
