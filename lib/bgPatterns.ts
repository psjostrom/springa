import { format, differenceInCalendarDays, startOfDay } from "date-fns";
import type { CalendarEvent } from "./types";
import type { RunBGContext } from "./runBGContext";
import type { InsulinContext } from "./insulinContext";
import type { FitnessDataPoint } from "./fitness";
import type { WellnessEntry } from "./intervalsApi";
import { scoreBG } from "./reportCard";

// --- Types ---

export interface EnrichedRun {
  date: string; // yyyy-MM-dd
  timeOfDay: string; // HH:mm
  dayOfWeek: string; // mon/tue/wed/...
  category: string; // easy/long/interval
  distanceKm: number;
  durationMin: number;
  paceMinKm: number;
  avgHr: number;
  maxHr: number;
  cadence: number | null;
  elevationGain: number | null;
  trainingLoad: number | null;
  // BG
  startBG: number;
  minBG: number;
  dropRatePer10m: number;
  hypo: boolean;
  bgScore: string; // good/ok/bad
  entrySlope: number | null;
  // Fuel
  fuelRateGH: number | null;
  carbsIngestedG: number | null;
  // Training context
  daysSinceLastRun: number | null;
  weeklyKmSoFar: number;
  ctl: number;
  atl: number;
  tsb: number;
  // Wellness
  restingHR: number | null;
  hrvRMSSD: number | null;
  sleepScore: number | null;
  // Insulin (from MyLife Cloud)
  iobAtStart: number | null;
  basalIOBAtStart: number | null;
  totalIOBAtStart: number | null;
  timeSinceLastMeal: number | null;
  timeSinceLastBolus: number | null;
  lastBasalRate: number | null;
}

// --- Table Builder ---

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function buildEnrichedRunTable(
  events: CalendarEvent[],
  fitnessData: FitnessDataPoint[],
  wellness: WellnessEntry[],
  bgContexts: Record<string, RunBGContext>,
  insulinContexts?: Record<string, InsulinContext>,
): EnrichedRun[] {
  // Only completed runs with BG data
  const completed = events.filter(
    (e) =>
      e.type === "completed" &&
      e.streamData?.glucose &&
      e.streamData.glucose.length >= 2 &&
      e.distance &&
      e.duration,
  );

  if (completed.length === 0) return [];

  // Sort by date ascending
  const sorted = [...completed].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // Build lookup maps
  const fitnessMap = new Map<string, FitnessDataPoint>();
  for (const dp of fitnessData) {
    fitnessMap.set(dp.date, dp);
  }

  const wellnessMap = new Map<string, WellnessEntry>();
  for (const w of wellness) {
    wellnessMap.set(w.id, w);
  }

  const runs: EnrichedRun[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const bg = scoreBG(event);
    if (!bg) continue;

    const dateStr = format(event.date, "yyyy-MM-dd");
    const timeStr = format(event.date, "HH:mm");
    const dayOfWeek = DAY_NAMES[event.date.getDay()];

    // Distance in km (CalendarEvent.distance is in meters)
    const distanceKm = (event.distance ?? 0) / 1000;
    // Duration in minutes (CalendarEvent.duration is in seconds)
    const durationMin = (event.duration ?? 0) / 60;
    // Pace min/km
    const paceMinKm = distanceKm > 0 ? durationMin / distanceKm : 0;

    // Days since last run
    let daysSinceLastRun: number | null = null;
    if (i > 0) {
      daysSinceLastRun = differenceInCalendarDays(
        startOfDay(event.date),
        startOfDay(sorted[i - 1].date),
      );
    }

    // Weekly km so far: sum distances in the 7 days before this run (not including this run)
    const weekStart = startOfDay(
      new Date(event.date.getTime() - 7 * 24 * 60 * 60 * 1000),
    );
    let weeklyKmSoFar = 0;
    for (let j = 0; j < i; j++) {
      const prev = sorted[j];
      if (prev.date >= weekStart && prev.date < event.date && prev.distance) {
        weeklyKmSoFar += prev.distance / 1000;
      }
    }

    // Fitness data — find nearest date
    const fitness = fitnessMap.get(dateStr);

    // Wellness data
    const well = wellnessMap.get(dateStr);

    // Entry slope from RunBGContext
    const actId = event.activityId;
    const ctx = actId ? bgContexts[actId] : undefined;
    const entrySlope = ctx?.pre?.entrySlope30m ?? null;

    // Insulin context from MyLife Cloud
    const insCtx = actId && insulinContexts ? insulinContexts[actId] : undefined;

    // Elevation gain from stream data
    let elevationGain: number | null = null;
    const alt = event.streamData?.altitude;
    if (alt && alt.length >= 2) {
      let gain = 0;
      for (let a = 1; a < alt.length; a++) {
        const diff = alt[a].value - alt[a - 1].value;
        if (diff > 0) gain += diff;
      }
      elevationGain = Math.round(gain);
    }

    runs.push({
      date: dateStr,
      timeOfDay: timeStr,
      dayOfWeek,
      category: event.category === "race" || event.category === "other" ? "easy" : event.category,
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMin: Math.round(durationMin),
      paceMinKm: Math.round(paceMinKm * 100) / 100,
      avgHr: event.avgHr ?? 0,
      maxHr: event.maxHr ?? 0,
      cadence: event.cadence ?? null,
      elevationGain,
      trainingLoad: event.load ?? null,
      startBG: bg.startBG,
      minBG: bg.minBG,
      dropRatePer10m: Math.round(bg.dropRate * 100) / 100,
      hypo: bg.hypo,
      bgScore: bg.rating,
      entrySlope,
      fuelRateGH: event.fuelRate ?? null,
      carbsIngestedG: event.carbsIngested ?? null,
      daysSinceLastRun,
      weeklyKmSoFar: Math.round(weeklyKmSoFar * 10) / 10,
      ctl: fitness?.ctl ?? 0,
      atl: fitness?.atl ?? 0,
      tsb: fitness?.tsb ?? 0,
      restingHR: well?.restingHR ?? null,
      hrvRMSSD: well?.hrvRMSSD ?? null,
      sleepScore: well?.sleepScore ?? null,
      iobAtStart: insCtx?.iobAtStart ?? null,
      basalIOBAtStart: insCtx?.basalIOBAtStart ?? null,
      totalIOBAtStart: insCtx?.totalIOBAtStart ?? null,
      timeSinceLastMeal: insCtx?.timeSinceLastMeal ?? null,
      timeSinceLastBolus: insCtx?.timeSinceLastBolus ?? null,
      lastBasalRate: insCtx?.lastBasalRate ?? null,
    });
  }

  return runs;
}

// --- TSV Formatter ---

const COLUMNS = [
  "date",
  "time",
  "day",
  "cat",
  "km",
  "min",
  "pace",
  "avgHR",
  "maxHR",
  "cad",
  "elev",
  "load",
  "startBG",
  "minBG",
  "drop/10m",
  "hypo",
  "bgScore",
  "entrySlope",
  "fuel_gh",
  "carbs_g",
  "dayOff",
  "wkKm",
  "CTL",
  "ATL",
  "TSB",
  "rHR",
  "HRV",
  "sleep",
  "bIOB_u",
  "basIOB_u",
  "tIOB_u",
  "mealMin",
  "bolusMin",
  "basalR",
] as const;

function val(v: number | string | boolean | null): string {
  if (v === null) return "?";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  return v;
}

export function formatRunTable(runs: EnrichedRun[]): string {
  const header = COLUMNS.join("\t");
  const rows = runs.map((r) =>
    [
      r.date,
      r.timeOfDay,
      r.dayOfWeek,
      r.category,
      val(r.distanceKm),
      val(r.durationMin),
      val(r.paceMinKm),
      val(r.avgHr),
      val(r.maxHr),
      val(r.cadence),
      val(r.elevationGain),
      val(r.trainingLoad),
      val(r.startBG),
      val(r.minBG),
      val(r.dropRatePer10m),
      val(r.hypo),
      r.bgScore,
      val(r.entrySlope),
      val(r.fuelRateGH),
      val(r.carbsIngestedG),
      val(r.daysSinceLastRun),
      val(r.weeklyKmSoFar),
      val(r.ctl),
      val(r.atl),
      val(r.tsb),
      val(r.restingHR),
      val(r.hrvRMSSD),
      val(r.sleepScore),
      val(r.iobAtStart),
      val(r.basalIOBAtStart),
      val(r.totalIOBAtStart),
      val(r.timeSinceLastMeal),
      val(r.timeSinceLastBolus),
      val(r.lastBasalRate),
    ].join("\t"),
  );
  return [header, ...rows].join("\n");
}

// --- Prompt Builder ---

export function buildBGPatternPrompt(
  table: string,
  runCount: number,
): { system: string; user: string } {
  const system = `You are a sports science analyst for a T1D runner. Pump always off during runs. Carbs are the only BG tool. ALL runs are fueled — empty cells in fuel_gh or carbs_g mean "not recorded," NEVER "zero fuel." Do not treat missing fuel data as a separate category or compare it against recorded values.

Insulin columns: bIOB_u = bolus IOB at run start (units, Fiasp exponential decay, tau=55min). basIOB_u = basal IOB from CamAPS FX algorithm (same decay model). tIOB_u = total IOB (bolus + basal). basalR = last basal rate before run (U/h, 0 means pump disconnected). mealMin/bolusMin = minutes since last meal/bolus before the run. Pump is disconnected before running, so IOB decays without replenishment. Higher IOB and shorter meal/bolus gaps predict steeper BG drops.

What "cross-run" means:
The app already has a per-category BG model showing average drop rate by easy/long/interval. This analysis must find patterns ACROSS categories — variables that predict BG outcomes regardless of workout type. Do NOT report per-category averages, do NOT summarize dataset-level facts (e.g. "no hypos recorded"), and do NOT build a finding around a single outlier run. Every finding must span multiple runs (min 4).

Output rules:
- MAX 5 findings. Only cross-run signals.
- Each finding: one ### heading, 1-2 sentences with numbers, one small table if it helps. Done.
- End with "## Gaps" — max 3 missing variables that would matter most.
- Total output under 400 words.`;

  const user = `${runCount} runs as TSV:

${table}

"?" = not recorded (missing data, not zero). Exclude rows with "?" from that variable's analysis.

Find cross-run BG patterns in drop/10m, minBG, hypo. Min 4 observations per bucket. Include n for every claim.`;

  return { system, user };
}
