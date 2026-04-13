import type { CalendarEvent } from "./types";
import type { ZoneSegment } from "./paceCalibration";
import { computeZonePaceTrend } from "./paceCalibration";

type EventCategory = CalendarEvent["category"];

const EXTERNAL_ID_CATEGORY_MAP: Record<string, EventCategory> = {
  speed: "interval",
  club: "interval",
  easy: "easy",
  free: "easy",
  long: "long",
  race: "race",
  ondemand: "other",
};

export function categoryFromExternalId(
  externalId: string | undefined,
): EventCategory | null {
  if (!externalId) return null;
  const prefix = externalId.split("-")[0];
  return EXTERNAL_ID_CATEGORY_MAP[prefix] ?? null;
}

/** Stockholm monthly average temperatures (C). Index 0 = January. */
const STOCKHOLM_MONTHLY_TEMP = [-1, -1, 2, 7, 12, 17, 20, 19, 14, 8, 3, 0];

const HR_PER_DEGREE_ABOVE_THRESHOLD = 1.8;
const HEAT_THRESHOLD_C = 15;

/**
 * Correct HR for temperature effects on cardiac cost.
 * Above 15C, HR inflates ~1.8 bpm per degree. Returns the corrected HR
 * that removes the heat component, making cross-season comparisons fair.
 * @param month 0-indexed (0 = January, 11 = December)
 */
export function temperatureCorrectHr(avgHr: number, month: number): number {
  const temp = STOCKHOLM_MONTHLY_TEMP[month];
  const correction = Math.max(0, temp - HEAT_THRESHOLD_C) * HR_PER_DEGREE_ABOVE_THRESHOLD;
  return avgHr - correction;
}

export interface CardiacCostResult {
  changePercent: number;
  direction: "improving" | "regressing";
  recentAvg: number;
  previousAvg: number;
}

const CARDIAC_COST_IMPROVEMENT_PCT = -3;
const CARDIAC_COST_REGRESSION_PCT = 5;
const MIN_SEGMENTS_PER_WINDOW = 4;
const RECENT_WINDOW_DAYS = 28;
const PREVIOUS_WINDOW_DAYS = 56;

export function computeCardiacCostTrend(
  segments: ZoneSegment[],
): CardiacCostResult | null {
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const previousCutoff = now - PREVIOUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const z2Segments = segments.filter((s) => s.zone === "z2" && s.activityDate);

  const recent: number[] = [];
  const previous: number[] = [];

  for (const seg of z2Segments) {
    const dateMs = new Date(seg.activityDate).getTime();
    if (isNaN(dateMs)) continue;

    const month = new Date(seg.activityDate).getMonth();
    const correctedHr = temperatureCorrectHr(seg.avgHr, month);
    const cost = correctedHr * seg.avgPace;

    if (dateMs >= recentCutoff) {
      recent.push(cost);
    } else if (dateMs >= previousCutoff) {
      previous.push(cost);
    }
  }

  if (recent.length < MIN_SEGMENTS_PER_WINDOW || previous.length < MIN_SEGMENTS_PER_WINDOW) {
    return null;
  }

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

  if (changePercent <= CARDIAC_COST_IMPROVEMENT_PCT) {
    return { changePercent, direction: "improving", recentAvg, previousAvg };
  }
  if (changePercent >= CARDIAC_COST_REGRESSION_PCT) {
    return { changePercent, direction: "regressing", recentAvg, previousAvg };
  }

  return null;
}

// --- Pace Suggestion ---

export interface RaceResult {
  distance: number; // meters
  duration: number; // seconds
  name: string;
  distanceMatch: boolean;
}

export interface PaceSuggestion {
  direction: "improvement" | "regression";
  confidence: "high" | "medium";
  suggestedAbilitySecs: number;
  currentAbilitySecs: number;
  currentAbilityDist: number;
  z4ImprovementSecPerKm: number | null;
  cardiacCostChangePercent: number | null;
  raceResult: RaceResult | null;
}

export interface PaceSuggestionInput {
  segments: ZoneSegment[];
  events: CalendarEvent[];
  currentAbilitySecs: number;
  currentAbilityDist: number;
  paceSuggestionDismissedAt?: number | null;
}

const DISMISS_COOLDOWN_MS = 28 * 24 * 60 * 60 * 1000;
const Z4_IMPROVEMENT_THRESHOLD = 10 / 60; // min/km
const Z4_REGRESSION_THRESHOLD = 15 / 60; // min/km
const Z4_TO_THRESHOLD_RATIO = 0.92;
const ABILITY_CAP_PCT = 0.02;
const BREAK_GAP_DAYS = 14;
const MIN_POST_BREAK_RUNS = 4;
const RACE_DISTANCE_TOLERANCE = 0.10;
const RACE_RECENCY_MS = 28 * 24 * 60 * 60 * 1000;
const CARDIAC_COST_TO_THRESHOLD_SEC = 5 / 60; // 3% cost change ≈ 5 sec/km

function detectBreak(events: CalendarEvent[]): boolean {
  const now = Date.now();
  const windowCutoff = now - 90 * 24 * 60 * 60 * 1000;
  const completed = events
    .filter((e) => e.type === "completed" && e.date.getTime() >= windowCutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (completed.length < 2) return false;

  let largestGapEnd = -1;
  for (let i = 1; i < completed.length; i++) {
    const gapDays =
      (completed[i].date.getTime() - completed[i - 1].date.getTime()) /
      (24 * 60 * 60 * 1000);
    if (gapDays >= BREAK_GAP_DAYS) {
      largestGapEnd = i;
    }
  }

  if (largestGapEnd === -1) return false;

  const postBreakRuns = completed.length - largestGapEnd;
  return postBreakRuns < MIN_POST_BREAK_RUNS;
}

interface RecentRace {
  name: string;
  distance: number;  // meters, guaranteed non-null
  duration: number;  // seconds, guaranteed non-null
  distanceMatch: boolean;
}

function findRecentRace(
  events: CalendarEvent[],
  referenceDist: number,
): RecentRace | null {
  const now = Date.now();
  const races = events.filter(
    (e) =>
      e.category === "race" &&
      e.type === "completed" &&
      e.distance != null &&
      e.duration != null &&
      now - e.date.getTime() <= RACE_RECENCY_MS,
  );

  if (races.length === 0) return null;

  // Most recent race first
  races.sort((a, b) => b.date.getTime() - a.date.getTime());
  const race = races[0];
  if (race.distance == null || race.duration == null) return null; // narrowed by filter, but satisfies TS
  const dist = race.distance;
  const dur = race.duration;

  const distanceMatch =
    referenceDist > 0 &&
    Math.abs(dist - referenceDist) / referenceDist <= RACE_DISTANCE_TOLERANCE;

  return { name: race.name, distance: dist, duration: dur, distanceMatch };
}

export function generatePaceSuggestion(
  input: PaceSuggestionInput,
): PaceSuggestion | null {
  const {
    segments,
    events,
    currentAbilitySecs,
    currentAbilityDist,
    paceSuggestionDismissedAt,
  } = input;

  // Guard: need ability settings
  if (!currentAbilitySecs || !currentAbilityDist) return null;

  // Check dismiss cooldown
  if (paceSuggestionDismissedAt) {
    if (Date.now() - paceSuggestionDismissedAt < DISMISS_COOLDOWN_MS) {
      return null;
    }
  }

  // Check for training break
  if (detectBreak(events)) return null;

  // Check for matching race result (direct comparison, no cap)
  const raceInfo = findRecentRace(events, currentAbilityDist);
  if (raceInfo?.distanceMatch) {
    const direction =
      raceInfo.duration < currentAbilitySecs ? "improvement" : "regression";
    return {
      direction,
      confidence: "high",
      suggestedAbilitySecs: raceInfo.duration,
      currentAbilitySecs,
      currentAbilityDist,
      z4ImprovementSecPerKm: null,
      cardiacCostChangePercent: null,
      raceResult: {
        distance: raceInfo.distance,
        duration: raceInfo.duration,
        name: raceInfo.name,
        distanceMatch: true,
      },
    };
  }

  // Compute Z4 pace trend
  const z4Slope = computeZonePaceTrend(segments, "z4");
  let z4Signal: "improving" | "regressing" | null = null;
  let z4ImprovementSecPerKm: number | null = null;

  if (z4Slope != null) {
    const totalChangeMinPerKm = z4Slope * 90; // project over 90 days
    const totalChangeSecPerKm = totalChangeMinPerKm * 60;

    if (totalChangeMinPerKm <= -Z4_IMPROVEMENT_THRESHOLD) {
      z4Signal = "improving";
      z4ImprovementSecPerKm = totalChangeSecPerKm;
    } else if (totalChangeMinPerKm >= Z4_REGRESSION_THRESHOLD) {
      z4Signal = "regressing";
      z4ImprovementSecPerKm = totalChangeSecPerKm;
    }
  }

  // Compute cardiac cost trend
  const ccResult = computeCardiacCostTrend(segments);
  let ccSignal: "improving" | "regressing" | null = null;
  let cardiacCostChangePercent: number | null = null;

  if (ccResult) {
    ccSignal = ccResult.direction;
    cardiacCostChangePercent = ccResult.changePercent;
  }

  // Check for conflicting signals
  if (
    z4Signal &&
    ccSignal &&
    z4Signal !== ccSignal
  ) {
    return null;
  }

  // Determine direction and confidence
  const signal = z4Signal ?? ccSignal;
  if (!signal) return null;

  const confidence: "high" | "medium" =
    z4Signal && ccSignal ? "high" : "medium";
  const direction: "improvement" | "regression" =
    signal === "improving" ? "improvement" : "regression";

  // Compute suggested ability time
  let deltaSecs: number;

  if (z4ImprovementSecPerKm != null) {
    // Z4 ≈ 0.92x threshold → divide by 0.92 to get threshold change
    const thresholdChangeSecPerKm = z4ImprovementSecPerKm / Z4_TO_THRESHOLD_RATIO;
    const distKm = currentAbilityDist / 1000;
    deltaSecs = thresholdChangeSecPerKm * distKm;
  } else {
    // Only cardiac cost: 3% cost change ≈ 5 sec/km threshold improvement
    const costRatio = (cardiacCostChangePercent ?? 0) / 3;
    const thresholdChangeMinPerKm = costRatio * CARDIAC_COST_TO_THRESHOLD_SEC;
    const distKm = currentAbilityDist / 1000;
    deltaSecs = thresholdChangeMinPerKm * 60 * distKm;
  }

  // Apply 2% cap
  const maxDelta = currentAbilitySecs * ABILITY_CAP_PCT;
  if (Math.abs(deltaSecs) > maxDelta) {
    deltaSecs = deltaSecs > 0 ? maxDelta : -maxDelta;
  }

  const suggestedAbilitySecs = currentAbilitySecs + deltaSecs;

  // Attach race result if present (even without distance match)
  let raceResult: RaceResult | null = null;
  if (raceInfo) {
    raceResult = {
      distance: raceInfo.distance,
      duration: raceInfo.duration,
      name: raceInfo.name,
      distanceMatch: false,
    };
  }

  return {
    direction,
    confidence,
    suggestedAbilitySecs,
    currentAbilitySecs,
    currentAbilityDist,
    z4ImprovementSecPerKm,
    cardiacCostChangePercent,
    raceResult,
  };
}
