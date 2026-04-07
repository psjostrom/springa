import {
  addDays,
  addWeeks,
  startOfWeek,
  parseISO,
  isBefore,
  isSameDay,
  set,
  format,
} from "date-fns";
import type { WorkoutEvent, PlanContext, SpeedSessionType } from "./types";
import type { BGResponseModel } from "./bgModel";
import { SPEED_ROTATION, SPEED_SESSION_LABELS, resolveZoneBand } from "./constants";
import { formatStep, createWorkoutText, createSimpleWorkoutText } from "./descriptionBuilder";
import { getCurrentFuelRate } from "./fuelRate";
import { getPhaseBoundaries, isRecoveryWeek as isRecoveryWeekFn, type PhaseBoundaries } from "./periodization";
import { getWeekIdx } from "./workoutMath";

type ZoneName = "easy" | "steady" | "tempo" | "hard";

export type OnDemandCategory = "easy" | "quality" | "long" | "club";
export type DayRole = "long" | "speed" | "easy" | "club" | "free";

/** Assign a training role to each selected run day.
 *  Roles: long (1), speed (0-1), club (0-1), easy (fill), free (extras beyond 4). */
export function assignDayRoles(
  runDays: number[],
  longRunDay: number,
  clubDay?: number,
  clubType?: string,
): Map<number, DayRole> {
  const roles = new Map<number, DayRole>();
  const sorted = [...runDays].sort((a, b) => a - b);

  // 1. Long run (fall back to last run day if longRunDay not in runDays)
  const effectiveLongRunDay = sorted.includes(longRunDay) ? longRunDay : sorted[sorted.length - 1];
  roles.set(effectiveLongRunDay, "long");

  // 2. Club run (if configured and in runDays)
  if (clubDay != null && sorted.includes(clubDay)) {
    roles.set(clubDay, "club");
  }

  // 3. Speed — needed if 3+ days AND club doesn't cover speed
  const clubCoversSpeed = clubDay != null && clubType === "speed";
  const remaining = sorted.filter((d) => !roles.has(d));
  if (remaining.length > 0 && sorted.length >= 3 && !clubCoversSpeed) {
    // Pick the day with maximum circular distance from long run
    let bestDay = remaining[0];
    let bestDist = 0;
    for (const d of remaining) {
      const dist = Math.min(Math.abs(d - effectiveLongRunDay), 7 - Math.abs(d - effectiveLongRunDay));
      if (dist > bestDist) { bestDist = dist; bestDay = d; }
    }
    roles.set(bestDay, "speed");
  }

  // 4. Fill remaining as easy (up to 4 total), then free
  const easyAndFree = sorted.filter((d) => !roles.has(d));
  for (const d of easyAndFree) {
    roles.set(d, roles.size < 4 ? "easy" : "free");
  }

  return roles;
}

/** Per-week phase flags, computed once per week in the orchestrator. */
export interface WeekPhase {
  weekNum: number;
  b: PhaseBoundaries;
  isBase: boolean;
  isRaceWeek: boolean;
  isTaper: boolean;
  isRaceTest: boolean;
  isRecovery: boolean;
}

export function getWeekPhase(ctx: PlanContext, weekIdx: number): WeekPhase {
  const weekNum = weekIdx + 1;
  const b = ctx.boundaries;
  return {
    weekNum,
    b,
    isBase: ctx.includeBasePhase && weekNum <= b.baseEnd,
    isRaceWeek: weekNum === b.raceWeek,
    isTaper: weekNum >= b.taperStart && weekNum <= b.taperEnd,
    isRaceTest: weekNum >= b.raceTestStart && weekNum <= b.raceTestEnd,
    isRecovery: isRecoveryWeekFn(weekNum, ctx.totalWeeks, ctx.includeBasePhase),
  };
}

/** Derive Garmin step intensity from the step's note and zone.
 *  Controls what the watch voices: "Warm Up", "Run", "Recovery", "Cooldown". */
function garminIntensity(zone: ZoneName | "walk", note?: string): string {
  if (note === "Warmup") return "warmup";
  if (note === "Cooldown") return "cooldown";
  if (zone === "walk" || note === "Downhill") return "rest";
  return "active";
}

/** Create zone-aware step helper that captures ctx. */
function makeStep(ctx: PlanContext) {
  const walkMin = 0.50;
  const walkMax = ctx.hrZones[0] / ctx.lthr;

  return (duration: string, zone: ZoneName | "walk", note?: string) => {
    const band = zone === "walk"
      ? { min: walkMin, max: walkMax }
      : resolveZoneBand(zone, ctx.lthr, ctx.hrZones);
    const step = formatStep(duration, band.min, band.max, ctx.lthr, note ?? (zone === "walk" ? "Walk" : undefined));
    return `${step} intensity=${garminIntensity(zone, note)}`;
  };
}

function getSpeedSessionType(
  ctx: PlanContext,
  wp: WeekPhase,
): SpeedSessionType | null {
  // No speed during base, recovery, race test, or race week
  if (wp.isBase || wp.isRaceWeek || wp.isRecovery || wp.isRaceTest) return null;

  // Taper weeks get race-pace intervals to stay sharp
  if (wp.isTaper) return "race-pace-intervals";

  // Count how many quality sessions came before this week (for rotation)
  let speedCount = 0;
  for (let i = wp.b.buildStart; i < wp.weekNum; i++) {
    const idx = i - wp.b.buildStart;
    if (!(idx > 0 && (idx + 1) % 4 === 0)) speedCount++;
  }

  return SPEED_ROTATION[speedCount % SPEED_ROTATION.length];
}

const generateQualityRun = (
  ctx: PlanContext,
  weekIdx: number,
  date: Date,
  wp: WeekPhase,
): WorkoutEvent | null => {
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const progress = weekIdx / ctx.totalWeeks;
  const prefixName = `W${wp.weekNum.toString().padStart(2, "0")}`;
  const wu = s("10m", "easy", "Warmup");
  const cd = s("5m", "easy", "Cooldown");

  const sessionType = getSpeedSessionType(ctx, wp);

  if (sessionType === null) {
    // Race week: no Thursday session — the Tuesday shakeout is enough
    if (wp.isRaceWeek) return null;

    let notes: string;
    let duration: string;
    if (wp.isBase) {
      notes = "Base phase — easy running only. Building consistency and letting your body adapt to regular training. Save the speed for the build phase.";
      duration = "45m";
    } else if (wp.isRaceTest) {
      notes = "Race test week — keep Thursday light. Save your legs for the dress rehearsal long run. Easy pace, short duration, zero stress.";
      duration = "30m";
    } else {
      notes = "Recovery week. Keep it genuinely easy — this is where your body absorbs the training from the past weeks. Resist the urge to push. Relaxed breathing, comfortable pace.";
      duration = "45m";
    }

    return {
      start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name: `${prefixName} ${wp.isRaceTest ? "Easy [PRE-TEST]" : "Easy"}`,
      description: createSimpleWorkoutText(s(duration, "easy"), notes),
      external_id: `speed-${wp.weekNum}`,
      type: "Run",
      fuelRate: ctx.fuelEasy,
    };
  }

  let reps: number;
  let steps: string[];
  let notes: string;
  const label = SPEED_SESSION_LABELS[sessionType];

  switch (sessionType) {
    case "short-intervals": {
      reps = 6 + Math.floor(progress * 2);
      steps = [s("2m", "tempo", "Fast"), s("2m", "walk")];
      notes = "Short, punchy efforts to build leg speed and running economy. Run each rep at a strong, controlled effort — not a flat-out sprint. Focus on quick cadence and light feet. Walk the recovery — let your HR come back down fully before the next rep.";
      break;
    }
    case "hills": {
      reps = 6 + Math.floor(progress * 2);
      steps = [s("2m", "hard", "Uphill"), s("3m", "easy", "Downhill")];
      notes = "Hill reps build strength and power that translates directly to EcoTrail's terrain. Outdoors: find a steady hill with a moderate gradient. Drive your knees, lean slightly forward from the ankles, and keep a strong arm swing. Jog back down easy — the downhill IS the recovery. Treadmill: set a fixed incline (5-6%) for the entire session. Hard reps at 10-12 km/h, recovery at 4-5 km/h walk.";
      break;
    }
    case "long-intervals": {
      const workMin = 4 + Math.floor(progress * 2);
      reps = 4;
      steps = [s(`${workMin}m`, "tempo", "Fast"), s("2m", "walk")];
      notes = "Longer intervals to develop your threshold and teach your body to clear lactate at pace. These should feel 'comfortably hard' — you can speak a few words but not hold a conversation. Stay relaxed in your shoulders and hands. Walk the recovery fully. Each rep should feel the same effort, not faster as you go.";
      break;
    }
    case "distance-intervals": {
      const distM = 600 + Math.floor(progress * 2) * 200;
      reps = distM >= 1000 ? 6 : 8;
      const distKm = (distM / 1000).toFixed(1);
      steps = [s(`${distKm}km`, "tempo", "Fast"), s("0.2km", "walk")];
      notes = `Track-style reps to sharpen your pace awareness. Run each ${distM}m at a consistent, controlled pace — aim to hit the same split every rep rather than going out too fast. Walk the 200m recovery. These build the specific speed and confidence you need on race day.`;
      break;
    }
    case "race-pace-intervals": {
      reps = 5;
      steps = [s("5m", "steady", "Race Pace"), s("2m", "walk")];
      notes = "Race pace practice. The goal is to lock in what race effort feels like so it becomes automatic on the day. These should feel controlled and sustainable — not hard. Focus on rhythm: steady breathing, relaxed form, consistent pace. Walk the recovery. If it feels too easy, you're doing it right.";
      break;
    }
  }

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `${prefixName} ${label}`,
    description: createWorkoutText(wu, steps, cd, reps, notes),
    external_id: `speed-${wp.weekNum}`,
    type: "Run",
    fuelRate: ctx.fuelInterval,
  };
};

const generateEasyRun = (
  ctx: PlanContext,
  weekIdx: number,
  date: Date,
  wp: WeekPhase,
  easyIndex = 0,
): WorkoutEvent | null => {
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const withStrides = easyIndex === 0 && weekIdx % 2 === 1 && !wp.isRaceWeek && !wp.isBase;

  // Ben Parkes pattern: easy runs start at 5k (~20m main) and build to 8k (~40m main) at peak
  const progress = weekIdx / ctx.totalWeeks;
  const duration = wp.isRaceWeek
    ? 15
    : wp.isRaceTest || wp.isTaper || wp.isRecovery
      ? 20
      : 20 + Math.round(progress * 25);

  const sessionLabel = withStrides ? "Easy + Strides" : "Easy";
  const name = `W${wp.weekNum.toString().padStart(2, "0")} ${sessionLabel}${wp.isRaceWeek ? " [SHAKEOUT]" : ""}`;

  let notes: string;
  if (wp.isRaceWeek) {
    notes = "Pre-race shakeout. Just loosen the legs and shake off any nerves. Keep it short, keep it easy. Tomorrow is the day.";
  } else if (withStrides) {
    notes = "Easy run with strides at the end. The main run should be fully conversational — save your energy. After the easy portion, do 4 short strides: accelerate smoothly to near-sprint over 20 seconds, then walk/jog back. Strides build neuromuscular speed without creating fatigue.";
  } else {
    notes = "Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.";
  }

  if (withStrides) {
    const wu = s("10m", "easy", "Warmup");
    const cd = s("15m", "easy", "Cooldown");
    const mainDuration = Math.max(duration - 10, 10);
    const lines = [
      notes, "",
      "Warmup", `- ${wu}`, "",
      "Main set", `- ${s(`${mainDuration}m`, "easy", "Easy")}`, "",
      "Strides 4x", `- ${s("20s", "hard", "Stride")}`, `- ${s("1m", "walk")}`, "",
      "Cooldown", `- ${cd}`, "",
    ];
    return {
      start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name,
      description: lines.join("\n"),
      external_id: `easy-${wp.weekNum}-${date.getDay()}`,
      type: "Run",
      fuelRate: ctx.fuelEasy,
    };
  }

  const totalDuration = duration + 15; // preserve original total (was single step)
  const cdDuration = Math.min(15, totalDuration - 10 - 10); // WU=10, min main=10
  const mainDuration = totalDuration - 10 - cdDuration;
  const wu = s("10m", "easy", "Warmup");
  const cd = s(`${cdDuration}m`, "easy", "Cooldown");
  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name,
    description: createWorkoutText(wu, [s(`${mainDuration}m`, "easy")], cd, 1, notes),
    external_id: `easy-${wp.weekNum}-${date.getDay()}`,
    type: "Run",
    fuelRate: ctx.fuelEasy,
  };
};

const generateFreeRun = (
  ctx: PlanContext,
  date: Date,
  wp: WeekPhase,
): WorkoutEvent | null => {
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const notes = "Free run — no structure, no pressure. Run easy for however long feels right. This is bonus volume, not a test.";

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `W${wp.weekNum.toString().padStart(2, "0")} Free Run`,
    description: createSimpleWorkoutText(s("30m", "easy"), notes),
    external_id: `free-${wp.weekNum}-${date.getDay()}`,
    type: "Run",
    fuelRate: ctx.fuelEasy,
  };
};

const generateLongRun = (
  ctx: PlanContext,
  weekIdx: number,
  date: Date,
  wp: WeekPhase,
): WorkoutEvent | null => {
  if (wp.isRaceWeek) {
    return {
      start_date_local: set(ctx.raceDate, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name: `RACE DAY`,
      description: `RACE DAY! ${ctx.raceDist}km.\n\nGood luck!`,
      external_id: `race`,
      type: "Run",
      fuelRate: ctx.fuelLong,
    };
  }
  if (!isBefore(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);

  // Distance ramp uses build-relative index so base weeks don't inflate early distances
  const buildWeeks = wp.b.buildEnd - wp.b.buildStart + 1;
  const buildWeekIdx = Math.max(0, weekIdx - (wp.b.buildStart - 1));
  let km = Math.min(
    Math.floor(
      ctx.startKm +
        ((ctx.raceDist - ctx.startKm) / buildWeeks) *
          buildWeekIdx,
    ),
    ctx.raceDist,
  );
  let type = "";
  if (wp.isBase || wp.isRecovery) {
    km = wp.isBase ? Math.min(ctx.startKm + weekIdx, ctx.startKm + 2) : ctx.startKm;
    type = wp.isRecovery ? " [RECOVERY]" : "";
  }
  if (wp.isTaper) {
    km = Math.floor(ctx.raceDist * 0.5);
    type = " [TAPER]";
  }
  if (wp.isRaceTest) {
    km = ctx.raceDist;
    type = " [RACE TEST]";
  }

  // Base and recovery weeks are always all-easy long runs
  // Build weeks alternate between sandwich and progressive variants
  let longRunVariant: "easy" | "sandwich" | "progressive" = "easy";
  if (!wp.isBase && !wp.isRecovery && !wp.isTaper && !wp.isRaceTest && wp.weekNum > wp.b.buildStart) {
    let nonSpecialCount = 0;
    for (let i = wp.b.buildStart; i < wp.weekNum; i++) {
      const idx = i - wp.b.buildStart;
      if (!(idx > 0 && (idx + 1) % 4 === 0)) nonSpecialCount++;
    }
    longRunVariant = nonSpecialCount % 2 === 0 ? "sandwich" : "progressive";
  }

  const mainKm = Math.max(km - 3, 1); // -1km WU, -2km CD
  const wu = s("1km", "easy", "Warmup");
  const cd = s("2km", "easy", "Cooldown");

  let mainSteps: string[];
  let notes: string;

  if (longRunVariant === "sandwich" && mainKm >= 4) {
    const rpBlockKm = Math.min(2 + Math.floor((weekIdx / ctx.totalWeeks) * 3), Math.floor(mainKm * 0.4));
    const easyBeforeKm = Math.floor((mainKm - rpBlockKm) / 2);
    const easyAfterKm = mainKm - rpBlockKm - easyBeforeKm;
    mainSteps = [s(`${easyBeforeKm}km`, "easy", "Easy"), s(`${rpBlockKm}km`, "steady", "Race Pace"), s(`${easyAfterKm}km`, "easy", "Easy")];
    notes = `Long run with a ${rpBlockKm}km race pace block sandwiched in the middle. Start easy and settle in before picking up to race effort. The race pace section should feel controlled, not hard — practise running at goal effort on tired legs. Ease back down afterwards and finish relaxed.`;
  } else if (longRunVariant === "progressive" && mainKm >= 4) {
    const easyKm = Math.floor(mainKm * 0.5);
    const steadyKm = Math.max(Math.floor(mainKm * 0.3), 1);
    const tempoKm = mainKm - easyKm - steadyKm;
    mainSteps = [s(`${easyKm}km`, "easy", "Easy"), s(`${steadyKm}km`, "steady", "Race Pace"), s(`${tempoKm}km`, "tempo", "Fast")];
    notes = `Progressive long run — start easy and build through the gears. The first ${easyKm}km should feel effortless. Pick up to race pace for ${steadyKm}km, then finish the last ${tempoKm}km at interval effort. The goal is to feel strongest at the end, not to survive it.`;
  } else {
    mainSteps = [s(`${mainKm}km`, "easy", "Easy")];
    if (wp.isRecovery) {
      notes = "Recovery week long run — shorter distance to let your body absorb the training. Run the whole thing easy and enjoy being out there. No pace pressure today.";
    } else if (wp.isBase) {
      notes = "Base phase — building your foundation. Keep it easy and focus on time on feet. No need to push pace. This is where BG management habits get built.";
    } else if (wp.isTaper) {
      notes = "Taper run. The hay is in the barn — you've done the work. Keep this short and easy. Your legs might feel heavy or oddly flat; that's normal during taper. Trust the process.";
    } else if (wp.isRaceTest) {
      notes = `Race distance test at easy effort. This is about covering ${km}km and practising your fueling and BG strategy, not about pace. Treat it as a dress rehearsal: same kit, same fuel timing, same pump setup you'll use on race day. Note what works and what doesn't.`;
    } else {
      notes = "Long run at easy pace. This is the most important run of the week — it builds your endurance engine. Keep the effort genuinely easy throughout. If the last few km feel harder at the same pace, that's normal; resist the urge to speed up early to 'bank time'. Fuel early, fuel often.";
    }
  }

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `W${wp.weekNum.toString().padStart(2, "0")} Long (${km}km)${type}`,
    description: createWorkoutText(wu, mainSteps, cd, 1, notes),
    external_id: `long-${wp.weekNum}`,
    type: "Run",
    fuelRate: ctx.fuelLong,
    distance: km,
  };
};

// --- MAIN ORCHESTRATOR ---

export interface SchedulingConfig {
  runDays?: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
}

export function buildContext(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase: boolean,
  diabetesMode?: boolean,
  scheduling?: SchedulingConfig,
): PlanContext {
  const raceDate = parseISO(raceDateStr);
  return {
    fuelInterval: getCurrentFuelRate("interval", bgModel, diabetesMode),
    fuelLong: getCurrentFuelRate("long", bgModel, diabetesMode),
    fuelEasy: getCurrentFuelRate("easy", bgModel, diabetesMode),
    raceDate,
    raceDist,
    totalWeeks,
    startKm,
    lthr,
    hrZones,
    includeBasePhase,
    boundaries: getPhaseBoundaries(totalWeeks, includeBasePhase),
    planStartMonday: addWeeks(
      startOfWeek(raceDate, { weekStartsOn: 1 }),
      -(totalWeeks - 1),
    ),
    runDays: scheduling?.runDays ?? [2, 4, 6, 0],     // Default: Tue, Thu, Sat, Sun
    longRunDay: scheduling?.longRunDay ?? 0,            // Default: Sunday
    clubDay: scheduling?.clubDay,
    clubType: scheduling?.clubType,
  };
}

function buildClubRunEvent(date: Date, wp: WeekPhase, fuelRate: number, externalId: string): WorkoutEvent {
  return {
    start_date_local: set(date, { hours: 18, minutes: 30, seconds: 0, milliseconds: 0 }),
    name: `W${wp.weekNum.toString().padStart(2, "0")} Club Run`,
    description: [
      "Club run — workout varies week to week.",
      "",
      "- 60m",
      "",
    ].join("\n"),
    external_id: externalId,
    type: "Run",
    fuelRate,
  };
}


/** Convert JS day-of-week (0=Sun..6=Sat) to offset from Monday-based weekStart. */
function dayToOffset(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function generateWeekEvents(ctx: PlanContext, weekIdx: number, weekStart: Date): WorkoutEvent[] {
  const wp = getWeekPhase(ctx, weekIdx);
  const roles = assignDayRoles(ctx.runDays, ctx.longRunDay, ctx.clubDay, ctx.clubType);
  const events: WorkoutEvent[] = [];
  let easyCount = 0;

  // Sort by day-of-week offset so events are in calendar order
  const sortedRoles = [...roles.entries()].sort((a, b) => dayToOffset(a[0]) - dayToOffset(b[0]));

  for (const [dayOfWeek, role] of sortedRoles) {
    const date = addDays(weekStart, dayToOffset(dayOfWeek));
    let event: WorkoutEvent | null = null;

    switch (role) {
      case "long":
        event = generateLongRun(ctx, weekIdx, date, wp);
        break;
      case "speed":
        event = generateQualityRun(ctx, weekIdx, date, wp);
        break;
      case "easy":
        event = generateEasyRun(ctx, weekIdx, date, wp, easyCount);
        easyCount++;
        break;
      case "club":
        event = buildClubRunEvent(date, wp, ctx.fuelInterval, `club-${wp.weekNum}`);
        break;
      case "free":
        event = generateFreeRun(ctx, date, wp);
        break;
    }
    if (event) events.push(event);
  }

  return events;
}

export function generatePlan(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase = false,
  diabetesMode?: boolean,
  scheduling?: SchedulingConfig,
): WorkoutEvent[] {
  const ctx = buildContext(bgModel, raceDateStr, raceDist, totalWeeks, startKm, lthr, hrZones, includeBasePhase, diabetesMode, scheduling);
  const today = new Date();
  return Array.from({ length: totalWeeks }, (_, i) => i).flatMap((i) => {
    const weekStart = addWeeks(ctx.planStartMonday, i);
    if (isBefore(addDays(weekStart, 7), today)) return [];
    return generateWeekEvents(ctx, i, weekStart);
  });
}

/** Generate the full plan for all weeks (no date filtering). Used for plan-vs-actual comparisons. */
export function generateFullPlan(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase = false,
  diabetesMode?: boolean,
  scheduling?: SchedulingConfig,
): WorkoutEvent[] {
  const ctx = buildContext(bgModel, raceDateStr, raceDist, totalWeeks, startKm, lthr, hrZones, includeBasePhase, diabetesMode, scheduling);
  return Array.from({ length: totalWeeks }, (_, i) => i).flatMap((i) => {
    const weekStart = addWeeks(ctx.planStartMonday, i);
    return generateWeekEvents(ctx, i, weekStart);
  });
}

// --- ON-DEMAND GENERATION ---

/** Suggest a workout category based on the day of week and training phase. */
export function suggestCategory(
  date: Date,
  wp: WeekPhase,
  roles?: Map<number, DayRole>,
): OnDemandCategory {
  if (wp.isRecovery || wp.isTaper || wp.isBase || wp.isRaceTest) return "easy";
  if (roles) {
    const role = roles.get(date.getDay());
    if (role === "long") return "long";
    if (role === "speed") return "quality";
    if (role === "club") return "club";
    return "easy";
  }
  // Legacy fallback
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return "long";
  if (dayOfWeek === 4) return "quality";
  return "easy";
}

/** Generate a single workout for a given date and category, using the same
 *  plan context and phase logic as the full plan generator. */
export function generateSingleWorkout(
  category: OnDemandCategory,
  date: Date,
  bgModel: BGResponseModel | null,
  settings: {
    raceDate: string;
    raceDist: number;
    totalWeeks: number;
    startKm: number;
    lthr: number;
    hrZones: number[];
    includeBasePhase?: boolean;
    scheduling?: SchedulingConfig;
  },
): WorkoutEvent | null {
  const ctx = buildContext(
    bgModel,
    settings.raceDate,
    settings.raceDist,
    settings.totalWeeks,
    settings.startKm,
    settings.lthr,
    settings.hrZones,
    settings.includeBasePhase ?? false,
    undefined,
    settings.scheduling,
  );

  const weekIdx = getWeekIdx(date, ctx.planStartMonday);
  if (weekIdx < 0 || weekIdx >= ctx.totalWeeks) return null;

  const wp = getWeekPhase(ctx, weekIdx);

  let event: WorkoutEvent | null;

  switch (category) {
    case "easy":
      event = generateEasyRun(ctx, weekIdx, date, wp);
      break;
    case "quality":
      event = generateQualityRun(ctx, weekIdx, date, wp);
      break;
    case "long":
      event = generateLongRun(ctx, weekIdx, date, wp);
      break;
    case "club":
      return buildClubRunEvent(date, wp, ctx.fuelInterval, `ondemand-${format(date, "yyyy-MM-dd")}`);
  }

  if (!event) return null;

  event.external_id = `ondemand-${format(date, "yyyy-MM-dd")}`;
  return event;
}
