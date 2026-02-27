import type { CalendarEvent, WorkoutCategory, WorkoutEvent } from "./types";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";
import type { RunBGContext } from "./runBGContext";
import { formatStep, createWorkoutText } from "./descriptionBuilder";
import { extractStructure } from "./descriptionParser";
import { HR_ZONE_BANDS } from "./constants";
import { getCurrentFuelRate } from "./fuelRate";

// --- Types ---

export interface AdaptationChange {
  type: "fuel" | "swap";
  detail: string;
}

export interface AdaptedEvent {
  original: CalendarEvent;
  name: string;
  date: string; // ISO date
  category: WorkoutCategory | "race" | "other";
  fuelRate: number | null;
  description: string; // structure only — AI notes injected later
  notes: string; // placeholder until AI fills in
  structure: string;
  changes: AdaptationChange[];
  externalId: string | null;
  swapped: boolean;
}

export interface AdaptationInput {
  upcomingEvents: CalendarEvent[];
  bgModel: BGResponseModel;
  insights: FitnessInsights;
  runBGContexts: Record<string, RunBGContext>;
  prefix: string;
}

/**
 * Reassemble a description from AI-generated notes and workout structure.
 * PUMP OFF line is prepended before the structure.
 */
export function assembleDescription(
  notes: string,
  structure: string,
  fuelRate: number | null,
  duration?: number,
): string {
  const parts: string[] = [];

  if (notes.trim()) {
    parts.push(notes.trim());
  }

  // Add fuel strategy line if we have rate + duration
  if (fuelRate != null && duration != null) {
    const durationMin = Math.round(duration / 60);
    const per10 = Math.round((fuelRate / 60) * 10);
    const total = Math.round((fuelRate * durationMin) / 60);
    parts.push(`PUMP OFF - FUEL PER 10: ${per10}g TOTAL: ${total}g`);
  } else if (fuelRate != null) {
    const per10 = Math.round((fuelRate / 60) * 10);
    parts.push(`PUMP OFF - FUEL PER 10: ${per10}g`);
  }

  if (structure.trim()) {
    parts.push(structure.trim());
  }

  return parts.join("\n\n");
}

// --- Fuel rate adjustment ---

/**
 * Adjust fuel rate using the canonical getCurrentFuelRate resolution.
 * Compares against event's current fuelRate. If different → change record.
 */
export function adaptFuelRate(
  current: number | null,
  category: WorkoutCategory | "race" | "other",
  bgModel: BGResponseModel,
): { rate: number | null; change: AdaptationChange | null } {
  if (category === "race" || category === "other") {
    return { rate: current, change: null };
  }

  const resolved = getCurrentFuelRate(category, bgModel);
  if (current != null && resolved !== current) {
    return {
      rate: resolved,
      change: {
        type: "fuel",
        detail: `Fuel: ${current} → ${resolved} g/h (BG model target)`,
      },
    };
  }
  if (current == null) {
    return {
      rate: resolved,
      change: {
        type: "fuel",
        detail: `Fuel: set to ${resolved} g/h (BG model target)`,
      },
    };
  }
  return { rate: resolved, change: null };
}

// --- Workout swap ---

/**
 * Determine if an interval workout should be swapped to easy for recovery.
 * Only applies to "interval" category.
 */
export function shouldSwapToEasy(
  category: WorkoutCategory | "race" | "other",
  insights: FitnessInsights,
): { swap: boolean; reason?: string } {
  if (category !== "interval") {
    return { swap: false };
  }

  if (insights.currentTsb < -20) {
    return {
      swap: true,
      reason: `Swapped to easy — TSB at ${insights.currentTsb}, body needs recovery`,
    };
  }

  if (insights.rampRate > 8) {
    return {
      swap: true,
      reason: `Swapped to easy — ramp rate ${insights.rampRate}/week, too aggressive`,
    };
  }

  return { swap: false };
}

/**
 * Build an easy-run structure as replacement for a swapped interval.
 * Uses the same formatStep + createWorkoutText pipeline as workoutGenerators.
 */
function buildEasyStructure(duration?: number, lthr?: number): string {
  const l = lthr ?? 169;
  const ez = HR_ZONE_BANDS.easy;
  const durationMin = duration ? Math.round(duration / 60) : 40;
  const mainMin = Math.max(durationMin - 15, 20);
  const wu = formatStep("10m", ez.min, ez.max, l, "Warmup");
  const main = formatStep(`${mainMin}m`, ez.min, ez.max, l, "Easy");
  const cd = formatStep("5m", ez.min, ez.max, l, "Cooldown");
  return createWorkoutText(wu, [main], cd, 1).trim();
}

// --- External ID reconstruction ---

/**
 * Reconstruct external_id from event name pattern.
 * "W12 Thu Short-Intervals eco16" → "eco16-thu-12"
 * "RACE DAY eco16" → "eco16-race-{totalWeeks}"
 */
export function reconstructExternalId(
  name: string,
  prefix: string,
): string | null {
  // Match "RACE DAY" pattern first (before weekday, since race names also contain W{n} {Day})
  if (/RACE\s+DAY/i.test(name)) {
    const raceWeekMatch = name.match(/W(\d+)/i);
    if (raceWeekMatch) {
      return `${prefix}-race-${raceWeekMatch[1]}`;
    }
    return `${prefix}-race`;
  }

  // Match "W{week} {day}" pattern
  const weekDayMatch = name.match(/W(\d+)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i);
  if (weekDayMatch) {
    const week = weekDayMatch[1];
    const day = weekDayMatch[2].toLowerCase();
    return `${prefix}-${day}-${week}`;
  }

  return null;
}

// --- Orchestrator ---

/**
 * Apply fuel adjustments and workout swaps to upcoming events.
 * Returns adapted events ready for AI note generation.
 */
export function applyAdaptations(input: AdaptationInput): AdaptedEvent[] {
  const { upcomingEvents, bgModel, insights, prefix } = input;

  return upcomingEvents.map((event) => {
    const changes: AdaptationChange[] = [];
    const structure = extractStructure(event.description);
    const category = event.category as WorkoutCategory | "race" | "other";

    // 1. Fuel adjustment
    const { rate: adjustedFuel, change: fuelChange } = adaptFuelRate(
      event.fuelRate ?? null,
      category,
      bgModel,
    );
    if (fuelChange) changes.push(fuelChange);

    // 2. Workout swap check
    const { swap, reason } = shouldSwapToEasy(category, insights);
    let finalStructure = structure;
    let swapped = false;
    if (swap && reason) {
      changes.push({ type: "swap", detail: reason });
      finalStructure = buildEasyStructure(event.duration);
      swapped = true;
    }

    // 3. Reconstruct external_id
    const externalId = reconstructExternalId(event.name, prefix);

    return {
      original: event,
      name: event.name,
      date: event.date.toISOString().split("T")[0],
      category,
      fuelRate: adjustedFuel,
      description: "", // filled after AI notes
      notes: "", // placeholder for AI
      structure: finalStructure,
      changes,
      externalId,
      swapped,
    };
  });
}

/**
 * Convert an AdaptedEvent (with AI notes applied) to a WorkoutEvent for Intervals.icu upload.
 */
export function toWorkoutEvent(adapted: AdaptedEvent): WorkoutEvent | null {
  if (!adapted.externalId) return null;

  return {
    start_date_local: new Date(adapted.date),
    name: adapted.name,
    description: adapted.description,
    external_id: adapted.externalId,
    type: "Run",
    ...(adapted.fuelRate != null && { fuelRate: adapted.fuelRate }),
  };
}
