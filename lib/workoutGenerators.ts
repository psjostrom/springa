import {
  addDays,
  addWeeks,
  startOfWeek,
  parseISO,
  isBefore,
  isSameDay,
  set,
} from "date-fns";
import type { WorkoutEvent, PlanContext, SpeedSessionType } from "./types";
import type { BGResponseModel } from "./bgModel";
import { SPEED_ROTATION, SPEED_SESSION_LABELS, resolveZoneBand } from "./constants";
import { formatStep, createWorkoutText, createSimpleWorkoutText } from "./descriptionBuilder";
import { getCurrentFuelRate } from "./fuelRate";
import { getPhaseBoundaries, isRecoveryWeek as isRecoveryWeekFn } from "./periodization";

type ZoneName = "easy" | "steady" | "tempo" | "hard";

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
  weekIdx: number,
  totalWeeks: number,
  includeBasePhase: boolean,
): SpeedSessionType | null {
  const weekNum = weekIdx + 1;
  const b = getPhaseBoundaries(totalWeeks, includeBasePhase);

  // No speed during base, recovery, race test, or race week
  if (includeBasePhase && weekNum <= b.baseEnd) return null;
  if (weekNum === b.raceWeek) return null;
  if (isRecoveryWeekFn(weekNum, totalWeeks, includeBasePhase)) return null;

  // Taper weeks get race-pace intervals to stay sharp
  if (weekNum >= b.taperStart && weekNum <= b.taperEnd) return "race-pace-intervals";

  // Race test weeks — no speed session
  if (weekNum >= b.raceTestStart && weekNum <= b.raceTestEnd) return null;

  // Count how many speed sessions came before this week (for rotation)
  let speedCount = 0;
  for (let i = b.buildStart; i < weekNum; i++) {
    if (!isRecoveryWeekFn(i, totalWeeks, includeBasePhase) &&
        !(i >= b.raceTestStart && i <= b.raceTestEnd)) speedCount++;
  }

  return SPEED_ROTATION[speedCount % SPEED_ROTATION.length];
}

const generateQualityRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const date = addDays(weekStart, 3);
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const weekNum = weekIdx + 1;
  const progress = weekIdx / ctx.totalWeeks;
  const prefixName = `W${weekNum.toString().padStart(2, "0")}`;
  const wu = s("10m", "easy", "Warmup");
  const cd = s("5m", "easy", "Cooldown");

  const sessionType = getSpeedSessionType(weekIdx, ctx.totalWeeks, ctx.includeBasePhase);

  if (sessionType === null) {
    const b = getPhaseBoundaries(ctx.totalWeeks, ctx.includeBasePhase);
    const isBase = ctx.includeBasePhase && weekNum <= b.baseEnd;
    const isRaceWeekQ = weekNum === b.raceWeek;
    const isRaceTestQ = weekNum >= b.raceTestStart && weekNum <= b.raceTestEnd;

    // Race week: no Thursday session — the Tuesday shakeout is enough
    if (isRaceWeekQ) return null;

    let notes: string;
    let duration: string;
    if (isBase) {
      notes = "Base phase — easy running only. Building consistency and letting your body adapt to regular training. Save the speed for the build phase.";
      duration = "45m";
    } else if (isRaceTestQ) {
      notes = "Race test week — keep Thursday light. Save your legs for the dress rehearsal long run. Easy pace, short duration, zero stress.";
      duration = "30m";
    } else {
      notes = "Recovery week. Keep it genuinely easy — this is where your body absorbs the training from the past weeks. Resist the urge to push. Relaxed breathing, comfortable pace.";
      duration = "45m";
    }

    return {
      start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name: `${prefixName} ${isRaceTestQ ? "Easy [PRE-TEST]" : "Easy"} ${ctx.prefix}`,
      description: createSimpleWorkoutText(s(duration, "easy"), notes),
      external_id: `${ctx.prefix}-speed-${weekNum}`,
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
    name: `${prefixName} ${label} ${ctx.prefix}`,
    description: createWorkoutText(wu, steps, cd, reps, notes),
    external_id: `${ctx.prefix}-speed-${weekNum}`,
    type: "Run",
    fuelRate: ctx.fuelInterval,
  };
};

const generateEasyRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const date = addDays(weekStart, 1);
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const weekNum = weekIdx + 1;
  const b = getPhaseBoundaries(ctx.totalWeeks, ctx.includeBasePhase);
  const isBase = ctx.includeBasePhase && weekNum <= b.baseEnd;
  const isRaceWeek = weekNum === b.raceWeek;
  const isTaper = weekNum >= b.taperStart && weekNum <= b.taperEnd;
  const isRaceTest = weekNum >= b.raceTestStart && weekNum <= b.raceTestEnd;
  const isRecovery = isRecoveryWeekFn(weekNum, ctx.totalWeeks, ctx.includeBasePhase);
  const withStrides = weekIdx % 2 === 1 && !isRaceWeek && !isBase;

  // Ben Parkes pattern: easy runs start at 5k (~20m main) and build to 8k (~40m main) at peak
  const progress = weekIdx / ctx.totalWeeks;
  const duration = isRaceWeek
    ? 15
    : isRaceTest || isTaper || isRecovery
      ? 20
      : 20 + Math.round(progress * 25);

  const sessionLabel = withStrides ? "Easy + Strides" : "Easy";
  const name = `W${weekNum.toString().padStart(2, "0")} ${sessionLabel} ${ctx.prefix}${isRaceWeek ? " [SHAKEOUT]" : ""}`;

  let notes: string;
  if (isRaceWeek) {
    notes = "Pre-race shakeout. Just loosen the legs and shake off any nerves. Keep it short, keep it easy. Tomorrow is the day.";
  } else if (withStrides) {
    notes = "Easy run with strides at the end. The main run should be fully conversational — save your energy. After the easy portion, do 4 short strides: accelerate smoothly to near-sprint over 20 seconds, then walk/jog back. Strides build neuromuscular speed without creating fatigue.";
  } else {
    notes = "Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.";
  }

  if (withStrides) {
    const wu = s("10m", "easy", "Warmup");
    const cd = s("5m", "easy", "Cooldown");
    const lines = [
      notes, "",
      "Warmup", `- ${wu}`, "",
      "Main set", `- ${s(`${duration}m`, "easy", "Easy")}`, "",
      "Strides 4x", `- ${s("20s", "hard", "Stride")}`, `- ${s("1m", "walk")}`, "",
      "Cooldown", `- ${cd}`, "",
    ];
    return {
      start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name,
      description: lines.join("\n"),
      external_id: `${ctx.prefix}-easy-${weekNum}`,
      type: "Run",
      fuelRate: ctx.fuelEasy,
    };
  }

  // Single-zone easy run — no warmup/cooldown structure needed
  const totalDuration = duration + 15; // 10m warmup + main + 5m cooldown
  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name,
    description: createSimpleWorkoutText(s(`${totalDuration}m`, "easy"), notes),
    external_id: `${ctx.prefix}-easy-${weekNum}`,
    type: "Run",
    fuelRate: ctx.fuelEasy,
  };
};

const generateBonusRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const date = addDays(weekStart, 5);
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const weekNum = weekIdx + 1;
  const notes = "The Saturday bonus. Let's be honest — there's maybe a 20% chance this actually happens. If your legs say no, listen to them. If they say yes, enjoy 30 easy minutes with zero expectations. No pace, no plan. Just a gift to future you.";

  // Single-zone easy run — no warmup/cooldown structure needed
  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `W${weekNum.toString().padStart(2, "0")} Bonus Easy ${ctx.prefix}`,
    description: createSimpleWorkoutText(s("45m", "easy"), notes),
    external_id: `${ctx.prefix}-bonus-${weekNum}`,
    type: "Run",
    fuelRate: ctx.fuelEasy,
  };
};

const generateLongRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const weekNum = weekIdx + 1;
  const isRaceWeek = weekNum === ctx.totalWeeks;
  if (isRaceWeek) {
    return {
      start_date_local: set(ctx.raceDate, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name: `RACE DAY ${ctx.prefix}`,
      description: `RACE DAY! ${ctx.raceDist}km.\n\nGood luck!`,
      external_id: `${ctx.prefix}-race`,
      type: "Run",
      fuelRate: ctx.fuelLong,
    };
  }
  const date = addDays(weekStart, 6);
  if (!isBefore(date, ctx.raceDate)) return null;

  const s = makeStep(ctx);
  const b = getPhaseBoundaries(ctx.totalWeeks, ctx.includeBasePhase);
  const isBase = ctx.includeBasePhase && weekNum <= b.baseEnd;
  const isTaper = weekNum >= b.taperStart && weekNum <= b.taperEnd;
  const isRaceTest = weekNum >= b.raceTestStart && weekNum <= b.raceTestEnd;
  const isRecovery = isRecoveryWeekFn(weekNum, ctx.totalWeeks, ctx.includeBasePhase);

  let km = Math.min(
    Math.floor(
      ctx.startKm +
        ((ctx.raceDist - ctx.startKm) / Math.max(ctx.totalWeeks - 4, 1)) *
          weekIdx,
    ),
    ctx.raceDist,
  );
  let type = "";
  if (isBase || isRecovery) {
    km = isBase ? Math.min(ctx.startKm + weekIdx, ctx.startKm + 2) : ctx.startKm;
    type = isRecovery ? " [RECOVERY]" : "";
  }
  if (isTaper) {
    km = Math.floor(ctx.raceDist * 0.5);
    type = " [TAPER]";
  }
  if (isRaceTest) {
    km = ctx.raceDist;
    type = " [RACE TEST]";
  }

  // Base and recovery weeks are always all-easy long runs
  // Build weeks alternate between sandwich and progressive variants
  let longRunVariant: "easy" | "sandwich" | "progressive" = "easy";
  if (!isBase && !isRecovery && !isTaper && !isRaceTest && weekNum > b.buildStart) {
    let nonSpecialCount = 0;
    for (let i = b.buildStart; i < weekNum; i++) {
      if (!isRecoveryWeekFn(i, ctx.totalWeeks, ctx.includeBasePhase)) nonSpecialCount++;
    }
    longRunVariant = nonSpecialCount % 2 === 0 ? "sandwich" : "progressive";
  }

  const mainKm = Math.max(km - 2, 1); // -1km WU, -1km CD
  const wu = s("1km", "easy", "Warmup");
  const cd = s("1km", "easy", "Cooldown");

  let mainSteps: string[];
  let notes: string;

  if (longRunVariant === "sandwich" && mainKm >= 4) {
    const rpBlockKm = Math.min(2 + Math.floor((weekIdx / ctx.totalWeeks) * 3), Math.floor(mainKm * 0.4));
    const easyBeforeKm = Math.floor((mainKm - rpBlockKm) / 2);
    const easyAfterKm = mainKm - rpBlockKm - easyBeforeKm;
    mainSteps = [s(`${easyBeforeKm}km`, "easy", "Easy"), s(`${rpBlockKm}km`, "steady", "Race Pace"), s(`${easyAfterKm}km`, "easy", "Easy")];
    notes = `Long run with a ${rpBlockKm}km race pace block sandwiched in the middle. Start easy and settle in before picking up to race effort. The race pace section should feel controlled, not hard — practise running at goal effort on tired legs. Ease back down afterwards and finish relaxed.`;
  } else if (longRunVariant === "progressive" && mainKm >= 4) {
    const easyKm = Math.ceil(mainKm * 0.5);
    const steadyKm = Math.max(Math.floor(mainKm * 0.3), 1);
    const tempoKm = mainKm - easyKm - steadyKm;
    mainSteps = [s(`${easyKm}km`, "easy", "Easy"), s(`${steadyKm}km`, "steady", "Race Pace"), s(`${tempoKm}km`, "tempo", "Fast")];
    notes = `Progressive long run — start easy and build through the gears. The first ${easyKm}km should feel effortless. Pick up to race pace for ${steadyKm}km, then finish the last ${tempoKm}km at interval effort. The goal is to feel strongest at the end, not to survive it.`;
  } else {
    mainSteps = [s(`${mainKm}km`, "easy", "Easy")];
    if (isRecovery) {
      notes = "Recovery week long run — shorter distance to let your body absorb the training. Run the whole thing easy and enjoy being out there. No pace pressure today.";
    } else if (isBase) {
      notes = "Base phase — building your foundation. Keep it easy and focus on time on feet. No need to push pace. This is where BG management habits get built.";
    } else if (isTaper) {
      notes = "Taper run. The hay is in the barn — you've done the work. Keep this short and easy. Your legs might feel heavy or oddly flat; that's normal during taper. Trust the process.";
    } else if (isRaceTest) {
      notes = `Race distance test at easy effort. This is about covering ${km}km and practising your fueling and BG strategy, not about pace. Treat it as a dress rehearsal: same kit, same fuel timing, same pump setup you'll use on race day. Note what works and what doesn't.`;
    } else {
      notes = "Long run at easy pace. This is the most important run of the week — it builds your endurance engine. Keep the effort genuinely easy throughout. If the last few km feel harder at the same pace, that's normal; resist the urge to speed up early to 'bank time'. Fuel early, fuel often.";
    }
  }

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `W${weekNum.toString().padStart(2, "0")} Long (${km}km)${type} ${ctx.prefix}`,
    description: createWorkoutText(wu, mainSteps, cd, 1, notes),
    external_id: `${ctx.prefix}-long-${weekNum}`,
    type: "Run",
    fuelRate: ctx.fuelLong,
    distance: km,
  };
};

// --- MAIN ORCHESTRATOR ---

export function generatePlan(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  prefix: string,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase = false,
): WorkoutEvent[] {
  const raceDate = parseISO(raceDateStr);
  const today = new Date();
  const ctx: PlanContext = {
    fuelInterval: getCurrentFuelRate("interval", bgModel),
    fuelLong: getCurrentFuelRate("long", bgModel),
    fuelEasy: getCurrentFuelRate("easy", bgModel),
    raceDate,
    raceDist,
    prefix,
    totalWeeks,
    startKm,
    lthr,
    hrZones,
    includeBasePhase,
    planStartMonday: addWeeks(
      startOfWeek(raceDate, { weekStartsOn: 1 }),
      -(totalWeeks - 1),
    ),
  };
  const weekIndices = Array.from({ length: totalWeeks }, (_, i) => i);
  return weekIndices.flatMap((i) => {
    const weekStart = addWeeks(ctx.planStartMonday, i);
    if (isBefore(addDays(weekStart, 7), today)) return [];
    return [
      generateEasyRun(ctx, i, weekStart),
      generateQualityRun(ctx, i, weekStart),
      generateBonusRun(ctx, i, weekStart),
      generateLongRun(ctx, i, weekStart),
    ].filter((e): e is WorkoutEvent => e !== null);
  });
}

/** Generate the full plan for all weeks (no date filtering). Used for plan-vs-actual comparisons. */
export function generateFullPlan(
  bgModel: BGResponseModel | null,
  raceDateStr: string,
  raceDist: number,
  prefix: string,
  totalWeeks: number,
  startKm: number,
  lthr: number,
  hrZones: number[],
  includeBasePhase = false,
): WorkoutEvent[] {
  const raceDate = parseISO(raceDateStr);
  const ctx: PlanContext = {
    fuelInterval: getCurrentFuelRate("interval", bgModel),
    fuelLong: getCurrentFuelRate("long", bgModel),
    fuelEasy: getCurrentFuelRate("easy", bgModel),
    raceDate,
    raceDist,
    prefix,
    totalWeeks,
    startKm,
    lthr,
    hrZones,
    includeBasePhase,
    planStartMonday: addWeeks(
      startOfWeek(raceDate, { weekStartsOn: 1 }),
      -(totalWeeks - 1),
    ),
  };
  const weekIndices = Array.from({ length: totalWeeks }, (_, i) => i);
  return weekIndices.flatMap((i) => {
    const weekStart = addWeeks(ctx.planStartMonday, i);
    return [
      generateEasyRun(ctx, i, weekStart),
      generateQualityRun(ctx, i, weekStart),
      generateBonusRun(ctx, i, weekStart),
      generateLongRun(ctx, i, weekStart),
    ].filter((e): e is WorkoutEvent => e !== null);
  });
}
