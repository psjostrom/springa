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
  dropRatePer5m: number;
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
  easeOffStartMin: number | null;
  easeOffDurationH: number | null;
  boostStartMin: number | null;
  boostDurationH: number | null;
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
      e.glucose &&
      e.glucose.length >= 2 &&
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
      dropRatePer5m: Math.round(bg.dropRate * 100) / 100,
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
      hrvRMSSD: well?.hrv ?? null,
      sleepScore: well?.sleepScore ?? null,
      iobAtStart: insCtx?.iobAtStart ?? null,
      basalIOBAtStart: insCtx?.basalIOBAtStart ?? null,
      totalIOBAtStart: insCtx?.totalIOBAtStart ?? null,
      timeSinceLastMeal: insCtx?.timeSinceLastMeal ?? null,
      timeSinceLastBolus: insCtx?.timeSinceLastBolus ?? null,
      lastBasalRate: insCtx?.lastBasalRate ?? null,
      easeOffStartMin: insCtx?.easeOffStartMin ?? null,
      easeOffDurationH: insCtx?.easeOffDurationH ?? null,
      boostStartMin: insCtx?.boostStartMin ?? null,
      boostDurationH: insCtx?.boostDurationH ?? null,
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
  "drop/5m",
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
  "easeMin",
  "easeH",
  "boostMin",
  "boostH",
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
      val(r.dropRatePer5m),
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
      val(r.easeOffStartMin),
      val(r.easeOffDurationH),
      val(r.boostStartMin),
      val(r.boostDurationH),
    ].join("\t"),
  );
  return [header, ...rows].join("\n");
}

// --- Prompt Builder ---

export function buildBGPatternPrompt(
  table: string,
  runCount: number,
): { system: string; user: string } {
  const system = `You analyze blood sugar patterns for a T1D runner. The pump is always off during runs — carbs are the only tool to manage blood sugar.

Insulin columns: bIOB_u = bolus IOB at run start (units, Fiasp exponential decay, tau=55min). basIOB_u = basal IOB from CamAPS FX algorithm (same decay model). tIOB_u = total IOB (bolus + basal). basalR = last basal rate before run (U/h, 0 means pump disconnected). mealMin/bolusMin = minutes since last meal/bolus before the run. easeMin/easeH = Ease-off mode activation (minutes before run / duration in hours). boostMin/boostH = Boost mode activation (minutes before run / duration in hours). Ease-off reduces insulin delivery; Boost increases it. Both are CamAPS FX pump modes activated before the run. Pump is disconnected before running, so IOB decays without replenishment. Higher IOB and shorter meal/bolus gaps predict steeper BG drops.

IMPORTANT: ALL runs are fueled. Empty cells in fuel_gh or carbs_g mean "not recorded," never zero. Don't treat missing data as a separate category.

Column reference (do NOT use these abbreviations in your output — use plain English):
- bIOB_u: bolus insulin still active at run start (units)
- basIOB_u: background insulin still active from the pump algorithm (units)
- tIOB_u: total active insulin (bolus + background)
- basalR: last pump rate before run (U/h, 0 = pump disconnected)
- mealMin: minutes since last meal before the run
- bolusMin: minutes since last insulin dose before the run
- entrySlope: was blood sugar rising or falling before the run started (positive = rising, negative = falling)
- TSB: training fatigue score (negative = tired/accumulated fatigue, positive = fresh/rested)
- minBG: lowest blood sugar during the run
- drop/5m: how fast blood sugar dropped per 5 minutes

Higher active insulin and shorter gaps since eating predict steeper blood sugar drops.

Hypo threshold: anything below 4.5 mmol/L is hypo territory. 4.4 is a hypo, not "close to" one. Treat low finishes seriously.

Your job: Find patterns that predict blood sugar behavior ACROSS all run types. The app already shows per-category averages (easy/long/interval) — don't repeat those. Find patterns that apply regardless of workout type.

Rules:
- MAX 5 findings
- Write in plain English a runner would understand — no abbreviations, no research-paper style
- No preamble — jump straight into the first finding
- Each finding gets a ### heading in sentence case (e.g. "### Fatigue makes drops worse" NOT "### FATIGUE MAKES DROPS WORSE")
- 1-2 sentences explaining what you found, then a small table showing the comparison with numbers
- Add a blank line before each new ### heading for visual spacing
- Tables help — use them to show contrasts (e.g. "under 1 unit" vs "over 1 unit")

End with:
## What to do differently
2-3 concrete action points based on your findings. Be specific (e.g. "wait at least 3 hours after a meal" not "consider meal timing").

Total output under 400 words. Do NOT include a "data gaps" section — historical data cannot be changed.`;

  const user = `${runCount} runs as TSV:

${table}

"?" = not recorded (missing data, not zero). Exclude rows with "?" from that variable's analysis.

Find cross-run BG patterns in drop/5m, minBG, hypo. Min 4 observations per bucket. Include n for every claim.`;

  return { system, user };
}
