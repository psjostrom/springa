import { startOfDay } from "date-fns";
import type { CachedActivity } from "./activityStreamsDb";
import type { CalendarEvent, WorkoutCategory } from "./types";
import type { UserSettings } from "./settings";
import type { CategoryStats } from "@/app/components/DuringPatternCards";
import type { AfterStats } from "@/app/components/AfterPatternCards";
import type { LongestRun } from "./runProfile";
import type { PredictedOutcome, MatchableRunWithPost } from "./runOutcomePrediction";
import type { FuelRecommendation } from "./fuelRecommendation";
import type { MatchableRun, MatchTarget } from "./matchingRuns";
import { getLongestRun } from "./runProfile";
import { findMatchingRuns } from "./matchingRuns";
import { predictRunOutcome } from "./runOutcomePrediction";
import { recommendFuelRate } from "./fuelRecommendation";

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface TomorrowMatchSummary {
  activityId: string;
  date: string;
  startBG: number;
  endBG: number;
  fuelRate: number | null;
}

export interface TomorrowWorkoutSummary {
  name: string;
  date: string;
  timeOfDay: string;
  category: WorkoutCategory;
  durationMin: number;
  distanceKm: number;
  targetHRRange: string;
}

export type PredictorName = "startBG" | "entrySlope" | "fuelRate" | "timeOfDay";

export interface TomorrowData {
  workout: TomorrowWorkoutSummary;
  recommendation: FuelRecommendation | null;
  prediction: PredictedOutcome | null;
  matches: TomorrowMatchSummary[];
  matchPredictors: PredictorName[];
  matchRelaxed: boolean;
}

export interface IntelHistoryData {
  duringStats: Record<WorkoutCategory, CategoryStats | null>;
  afterStats: Record<WorkoutCategory, AfterStats | null>;
  distance: {
    longestRun: LongestRun | null;
    race: { name?: string; distanceKm?: number; date?: string } | null;
  };
}

export interface IntelScreenData extends IntelHistoryData {
  tomorrow: TomorrowData | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const CATEGORIES: WorkoutCategory[] = ["easy", "long", "interval"];
const HYPO = 4.0;
const BIG_REBOUND_THRESHOLD = 2.0;
const DEFAULT_FUEL_RATE = 60;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function endBGFromActivity(activity: CachedActivity): number | null {
  // Prefer the post-run endBG already computed by RunBGContext.
  const postEnd = activity.runBGContext?.post?.endBG;
  if (postEnd != null) return postEnd;
  const glucose = activity.glucose;
  if (!glucose || glucose.length === 0) return null;
  return glucose[glucose.length - 1].value;
}

function startBGFromActivity(activity: CachedActivity): number | null {
  const preStart = activity.runBGContext?.pre?.startBG;
  if (preStart != null) return preStart;
  const glucose = activity.glucose;
  if (!glucose || glucose.length === 0) return null;
  return glucose[0].value;
}

function durationHoursFromGlucose(glucose: { time: number; value: number }[]): number {
  if (glucose.length < 2) return 0;
  // glucose `time` is in MINUTES (verified at lib/bgAlignment.ts where hrPoint.time
  // is treated as minutes and multiplied by 60*1000 to reach milliseconds).
  const minutes = glucose[glucose.length - 1].time - glucose[0].time;
  return minutes / 60;
}

function emptyCategoryRecord<T>(): Record<WorkoutCategory, T | null> {
  return {
    easy: null,
    long: null,
    interval: null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// duringStats
// ────────────────────────────────────────────────────────────────────────────

function buildDuringStats(
  activities: CachedActivity[],
): Record<WorkoutCategory, CategoryStats | null> {
  const out = emptyCategoryRecord<CategoryStats>();
  for (const cat of CATEGORIES) {
    const inCat = activities.filter(
      (a) => a.category === cat && a.glucose && a.glucose.length > 0,
    );
    if (inCat.length === 0) continue;

    const endBGs: { bg: number; date: string; activityId: string }[] = [];
    let hypoCount = 0;
    let totalDropPerHr = 0;
    let dropSamples = 0;

    for (const a of inCat) {
      const end = endBGFromActivity(a);
      if (end == null) continue;
      endBGs.push({ bg: end, date: a.activityDate ?? "", activityId: a.activityId });
      if ((a.glucose ?? []).some((g) => g.value < HYPO)) hypoCount++;

      const start = startBGFromActivity(a);
      const hours = durationHoursFromGlucose(a.glucose ?? []);
      if (start != null && hours > 0) {
        totalDropPerHr += (start - end) / hours;
        dropSamples++;
      }
    }

    if (endBGs.length === 0) continue;

    out[cat] = {
      runCount: endBGs.length,
      medianEndBG: median(endBGs.map((e) => e.bg)),
      endBGs,
      hypoCount,
      avgDropPerHr: dropSamples > 0 ? totalDropPerHr / dropSamples : 0,
    };
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// afterStats
// ────────────────────────────────────────────────────────────────────────────

function buildAfterStats(
  activities: CachedActivity[],
): Record<WorkoutCategory, AfterStats | null> {
  const out = emptyCategoryRecord<AfterStats>();
  for (const cat of CATEGORIES) {
    const withPost = activities.filter(
      (a) => a.category === cat && a.runBGContext?.post,
    );
    if (withPost.length === 0) continue;

    const rebounds: number[] = [];
    let bigReboundCount = 0;
    let lateHypoCount = 0;
    for (const a of withPost) {
      const post = a.runBGContext?.post;
      if (!post) continue;
      // Legacy run_bg_context rows pre-date peak60mAboveEnd (Task 8). Treat as
      // missing-after-data so they don't pollute medians or undercount rebounds.
      if (post.peak60mAboveEnd == null) continue;
      rebounds.push(post.peak60mAboveEnd);
      if (post.peak60mAboveEnd > BIG_REBOUND_THRESHOLD) bigReboundCount++;
      if (post.postRunHypo) lateHypoCount++;
    }

    if (rebounds.length === 0) continue;

    out[cat] = {
      runCount: rebounds.length,
      medianRebound: median(rebounds),
      bigReboundCount,
      lateHypoCount,
    };
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// tomorrow
// ────────────────────────────────────────────────────────────────────────────

function getTargetHRRange(
  category: WorkoutCategory,
  hrZones: number[] | undefined,
): string {
  // hrZones = [Z1top, Z2top, Z3top, Z4top, Z5top]
  if (hrZones?.length !== 5) {
    if (category === "interval") return "Z4";
    return "Z2";
  }
  if (category === "interval") {
    return `${hrZones[2] + 1}-${hrZones[3]} bpm (Z4)`;
  }
  return `${hrZones[0] + 1}-${hrZones[1]} bpm (Z2)`;
}

function activityToMatchableRun(
  activity: CachedActivity,
): MatchableRun | null {
  // Prefer the server-computed pre.startBG. Fall back to first glucose sample
  // for legacy rows that pre-date server-side runBGContext computation.
  const startBG = activity.runBGContext?.pre?.startBG ?? activity.glucose?.[0]?.value ?? null;
  const endBG = endBGFromActivity(activity);
  if (startBG == null || endBG == null) return null;

  const wentHypo =
    (activity.runBGContext?.post?.postRunHypo ?? false) ||
    (activity.glucose ?? []).some((g) => g.value < HYPO);

  let hourOfDay = 12;
  if (activity.runStartMs) {
    hourOfDay = new Date(activity.runStartMs).getHours();
  }

  return {
    activityId: activity.activityId,
    date: activity.activityDate ?? "",
    category: activity.category,
    startBG,
    endBG,
    fuelRate: activity.fuelRate,
    entrySlope: activity.runBGContext?.pre?.entrySlope30m ?? null,
    hourOfDay,
    wentHypo,
  };
}

function activityWithPost(
  activity: CachedActivity,
  base: MatchableRun,
): MatchableRunWithPost | null {
  const post = activity.runBGContext?.post;
  if (!post) return null;
  // Legacy rows pre-date peak60mAboveEnd; exclude them from prediction inputs.
  if (post.peak60mAboveEnd == null) return null;
  return {
    ...base,
    peak60mAboveEnd: post.peak60mAboveEnd,
    postRunHypo: post.postRunHypo,
  };
}

function pickNextPlannedRun(events: CalendarEvent[], reference: Date): CalendarEvent | null {
  // Compare by start-of-day, not exact timestamp. A planned run at 10:00 today is
  // still "upcoming" at 14:00 today if it hasn't been completed — it just slipped
  // its scheduled time. Only when the day rolls over do we advance to the next run.
  const dayCutoff = startOfDay(reference).getTime();
  const future = events
    .filter(
      (e) =>
        (e.type === "planned" || e.type === "race") &&
        e.date.getTime() >= dayCutoff &&
        (e.category === "easy" || e.category === "long" || e.category === "interval" || e.category === "race"),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return future[0] ?? null;
}

function buildTomorrow(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
  reference: Date,
): TomorrowData | null {
  const next = pickNextPlannedRun(events, reference);
  if (!next) return null;
  // Race events default to "long" matching for prediction.
  const category: WorkoutCategory =
    next.category === "race" ? "long" : (next.category as WorkoutCategory);

  const fuelRate = next.fuelRate ?? DEFAULT_FUEL_RATE;
  const hourOfDay = next.date.getHours();

  const target: MatchTarget = {
    category,
    startBG: null,
    fuelRate,
    hourOfDay,
    entrySlope: null,
  };

  const history: MatchableRun[] = activities
    .map((a) => activityToMatchableRun(a))
    .filter((r): r is MatchableRun => r != null);

  const { matches, relaxed, usedPredictors } = findMatchingRuns(target, history);

  const matchActivities = new Map<string, CachedActivity>(
    activities.map((a) => [a.activityId, a]),
  );

  const matchesWithPost: MatchableRunWithPost[] = [];
  for (const m of matches) {
    const a = matchActivities.get(m.activityId);
    if (!a) continue;
    const enriched = activityWithPost(a, m);
    if (enriched) matchesWithPost.push(enriched);
  }

  const prediction = predictRunOutcome(matchesWithPost);
  const recommendation = recommendFuelRate(matchesWithPost);

  // Build summary list for the UI from base matches (more entries than the post-context subset used for predictions). UI surfaces both counts so the runner sees which subset drives each piece.
  const matchesSummary: TomorrowMatchSummary[] = matches.map((m) => ({
    activityId: m.activityId,
    date: m.date,
    startBG: m.startBG,
    endBG: m.endBG,
    fuelRate: m.fuelRate,
  }));

  const dateISO = toLocalISODate(next.date);
  const timeOfDay = formatHHMM(next.date);
  const durationMin = next.duration ? Math.round(next.duration / 60) : 60;
  const distanceKm = next.distance ? Math.round(next.distance / 1000) : 0;
  const targetHRRange = getTargetHRRange(category, settings.hrZones);

  return {
    workout: {
      name: next.name,
      date: dateISO,
      timeOfDay,
      category,
      durationMin,
      distanceKm,
      targetHRRange,
    },
    recommendation,
    prediction,
    matches: matchesSummary,
    matchPredictors: usedPredictors,
    matchRelaxed: relaxed,
  };
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// ────────────────────────────────────────────────────────────────────────────
// distance
// ────────────────────────────────────────────────────────────────────────────

function buildDistance(
  events: CalendarEvent[],
  settings: UserSettings,
): IntelHistoryData["distance"] {
  const longestRun = getLongestRun(events);
  const race =
    settings.raceName || settings.raceDist || settings.raceDate
      ? {
          name: settings.raceName,
          distanceKm: settings.raceDist,
          date: settings.raceDate,
        }
      : null;
  return { longestRun, race };
}

// ────────────────────────────────────────────────────────────────────────────
// Entry points
// ────────────────────────────────────────────────────────────────────────────

/**
 * Heavy history-only computation. Iterates all activities and events.
 * Cache-friendly: only depends on activities, events, and settings — does NOT
 * change when live CGM ticks every 5 min.
 */
export function buildHistoryData(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
): IntelHistoryData {
  return {
    duringStats: buildDuringStats(activities),
    afterStats: buildAfterStats(activities),
    distance: buildDistance(events, settings),
  };
}

/**
 * Tomorrow-only computation. Pure function of activities, events, and settings —
 * does not depend on live BG. The Tomorrow card is a planning view, not a
 * pre-run readiness view.
 */
export function buildTomorrowData(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
  reference: Date = new Date(),
): TomorrowData | null {
  return buildTomorrow(activities, events, settings, reference);
}

export function buildIntelScreenData(
  activities: CachedActivity[],
  events: CalendarEvent[],
  settings: UserSettings,
  reference: Date = new Date(),
): IntelScreenData {
  return {
    ...buildHistoryData(activities, events, settings),
    tomorrow: buildTomorrowData(activities, events, settings, reference),
  };
}
