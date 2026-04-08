import type { CalendarEvent, WorkoutCategory, WorkoutEvent } from "./types";
import type { BGResponseModel } from "./bgModel";
import type { FitnessInsights } from "./fitness";
import type { RunBGContext } from "./runBGContext";
import { formatPaceStep, createWorkoutText } from "./descriptionBuilder";
import { extractStructure } from "./descriptionParser";
import { getCurrentFuelRate, getFuelConfidence } from "./fuelRate";

// --- Types ---

export interface AdaptationChange {
  type: "fuel" | "swap";
  detail: string;
  confidence?: "low" | "medium" | "high";
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
  bgModel: BGResponseModel | null;
  insights: FitnessInsights;
  runBGContexts: Record<string, RunBGContext>;
  lthr: number;
  hrZones: number[];
}

/**
 * Reassemble a description from AI-generated notes and workout structure.
 * PUMP OFF line is prepended before the structure.
 */
export function assembleDescription(
  notes: string,
  structure: string,
): string {
  const parts: string[] = [];

  if (notes.trim()) {
    parts.push(notes.trim());
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
  bgModel: BGResponseModel | null,
): { rate: number | null; change: AdaptationChange | null } {
  if (category === "race" || category === "other") {
    return { rate: current, change: null };
  }

  const resolved = getCurrentFuelRate(category, bgModel);
  const confidence = getFuelConfidence(category, bgModel) ?? undefined;

  if (current != null && resolved !== current && Math.abs(resolved - current) >= 3) {
    return {
      rate: resolved,
      change: {
        type: "fuel",
        detail: `Fuel: ${current} → ${resolved} g/h (BG model target)`,
        confidence,
      },
    };
  }
  if (current == null) {
    return {
      rate: resolved,
      change: {
        type: "fuel",
        detail: `Fuel: set to ${resolved} g/h (BG model target)`,
        confidence,
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
 * Uses the same formatPaceStep + createWorkoutText pipeline as workoutGenerators.
 */
function buildEasyStructure(duration: number | undefined): string {
  const durationMin = duration ? Math.round(duration / 60) : 40;
  const mainMin = Math.max(durationMin - 15, 20);
  const wu = `${formatPaceStep("10m", 80, 88, "Warmup")} intensity=warmup`;
  const main = `${formatPaceStep(`${mainMin}m`, 80, 88, "Easy")} intensity=active`;
  const cd = `${formatPaceStep("5m", 80, 88, "Cooldown")} intensity=cooldown`;
  return createWorkoutText(wu, [main], cd, 1).trim();
}

// --- External ID reconstruction ---

/**
 * Reconstruct external_id from event name pattern.
 * "W12 Short Intervals" → "speed-12"
 * "W05 Long (12km)" → "long-5"
 * "W01 Easy" → "easy-1"
 * "W03 Bonus Easy" → "bonus-3"
 * "W05 Club Run" → "club-5"
 * "RACE DAY" → "race"
 *
 * Also handles legacy day-based names for existing events:
 * "W12 Thu Short-Intervals" → "speed-12"
 */
export function reconstructExternalId(
  name: string,
): string | null {
  if (/RACE\s+DAY/i.test(name)) {
    const raceWeekMatch = /W(\d+)/i.exec(name);
    if (raceWeekMatch) return `race-${parseInt(raceWeekMatch[1], 10)}`;
    return `race`;
  }

  // Extract week number — handles both "W05 Long..." and legacy "W05 Sun Long..."
  const weekMatch = /W(\d+)/i.exec(name);
  if (!weekMatch) return null;
  const week = String(parseInt(weekMatch[1], 10));

  // Classify by workout type keywords
  if (/\bLong\b/i.test(name)) return `long-${week}`;
  if (/\bBonus\b/i.test(name)) return `bonus-${week}`;
  if (/Short.?Intervals|Hills|Long.?Intervals|Distance.?Intervals|Race.?Pace.?Intervals/i.test(name)) {
    return `speed-${week}`;
  }
  if (/\bClub\b/i.test(name)) return `club-${week}`;

  // Default: easy run (includes "Easy", "Easy + Strides", shakeout, etc.)
  return `easy-${week}`;
}

// --- Orchestrator ---

/**
 * Apply fuel adjustments and workout swaps to upcoming events.
 * Returns adapted events ready for AI note generation.
 */
export function applyAdaptations(input: AdaptationInput): AdaptedEvent[] {
  const { upcomingEvents, bgModel, insights } = input;

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
    const externalId = reconstructExternalId(event.name);

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
