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
import { SPEED_ROTATION, SPEED_SESSION_LABELS } from "./constants";
import { formatStep, createWorkoutText, calculateWorkoutCarbs } from "./utils";

function getSpeedSessionType(
  weekIdx: number,
  totalWeeks: number,
): SpeedSessionType | null {
  const weekNum = weekIdx + 1;
  const isRaceWeek = weekNum === totalWeeks;
  const isTaper = weekNum >= totalWeeks - 1;
  const isRecoveryWeek = weekNum % 4 === 0;

  if (isRaceWeek) return null;
  if (isRecoveryWeek) return null;
  if (isTaper) return "race-pace-intervals";

  let speedCount = 0;
  for (let i = 0; i < weekIdx; i++) {
    const wn = i + 1;
    if (wn % 4 !== 0 && wn < totalWeeks - 1) speedCount++;
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

  const weekNum = weekIdx + 1;
  const progress = weekIdx / ctx.totalWeeks;
  const prefixName = `W${weekNum.toString().padStart(2, "0")} Thu`;

  const sessionType = getSpeedSessionType(weekIdx, ctx.totalWeeks);

  if (sessionType === null) {
    const totalDuration = 10 + 30 + 5;
    const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelEasy);
    const strat = `PUMP ON (EASE OFF) - FUEL PER 10: ${ctx.fuelEasy}g TOTAL: ${totalCarbs}g`;
    const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
    const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
    const notes = "Recovery week. Keep it genuinely easy — this is where your body absorbs the training from the past weeks. Resist the urge to push. Relaxed breathing, comfortable pace.";
    return {
      start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name: `${prefixName} Easy ${ctx.prefix}`,
      description: createWorkoutText(strat, wu, [
        formatStep("30m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ], cd, 1, notes),
      external_id: `${ctx.prefix}-thu-${weekNum}`,
      type: "Run",
    };
  }

  let reps: number;
  let repDuration: number;
  let steps: string[];
  let notes: string;
  const label = SPEED_SESSION_LABELS[sessionType];

  switch (sessionType) {
    case "short-intervals": {
      reps = 6 + Math.floor(progress * 2);
      repDuration = 4;
      steps = [
        formatStep("2m", ctx.zones.tempo.min, ctx.zones.tempo.max, ctx.lthr),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = "Short, punchy efforts to build leg speed and running economy. Run each rep at a strong, controlled effort — not a flat-out sprint. Focus on quick cadence and light feet. The recovery jog should be truly easy, letting your HR come back down before the next one.";
      break;
    }
    case "hills": {
      reps = 6 + Math.floor(progress * 2);
      repDuration = 5;
      steps = [
        formatStep("2m", ctx.zones.hard.min, ctx.zones.hard.max, ctx.lthr, "Uphill"),
        formatStep("3m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, "Downhill"),
      ];
      notes = "Hill reps build strength and power that translates directly to EcoTrail's terrain. Outdoors: find a steady hill with a moderate gradient. Drive your knees, lean slightly forward from the ankles, and keep a strong arm swing. Jog back down easy — the downhill IS the recovery. Treadmill: set a fixed incline (5-6%) for the entire session. Hard reps at 10-12 km/h, recovery at 4-5 km/h walk.";
      break;
    }
    case "long-intervals": {
      const workMin = 4 + Math.floor(progress * 2);
      reps = 4;
      repDuration = workMin + 2;
      steps = [
        formatStep(`${workMin}m`, ctx.zones.tempo.min, ctx.zones.tempo.max, ctx.lthr),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = "Longer intervals to develop your threshold and teach your body to clear lactate at pace. These should feel 'comfortably hard' — you can speak a few words but not hold a conversation. Stay relaxed in your shoulders and hands. Each rep should feel the same effort, not faster as you go.";
      break;
    }
    case "distance-intervals": {
      const distM = 600 + Math.floor(progress * 2) * 200;
      reps = distM >= 1000 ? 6 : 8;
      const distKm = (distM / 1000).toFixed(1);
      const recoveryKm = "0.2";
      repDuration = Math.ceil((distM / 1000) * 5.2) + 1.5;
      steps = [
        formatStep(`${distKm}km`, ctx.zones.tempo.min, ctx.zones.tempo.max, ctx.lthr),
        formatStep(`${recoveryKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = `Track-style reps to sharpen your pace awareness. Run each ${distM}m at a consistent, controlled pace — aim to hit the same split every rep rather than going out too fast. The 200m jog recovery is short, so keep moving. These build the specific speed and confidence you need on race day.`;
      break;
    }
    case "race-pace-intervals": {
      reps = 5;
      repDuration = 7;
      steps = [
        formatStep("5m", ctx.zones.steady.min, ctx.zones.steady.max, ctx.lthr),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = "Race pace practice. The goal is to lock in what race effort feels like so it becomes automatic on the day. These should feel controlled and sustainable — not hard. Focus on rhythm: steady breathing, relaxed form, consistent pace. If it feels too easy, you're doing it right.";
      break;
    }
  }

  const totalDuration = 10 + reps * repDuration + 5;
  const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelInterval);
  const strat = `PUMP OFF - FUEL PER 10: ${ctx.fuelInterval}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `${prefixName} ${label} ${ctx.prefix}`,
    description: createWorkoutText(strat, wu, steps, cd, reps, notes),
    external_id: `${ctx.prefix}-thu-${weekNum}`,
    type: "Run",
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
  const weekNum = weekIdx + 1;
  const progress = weekIdx / ctx.totalWeeks;
  const isRaceWeek = weekNum === ctx.totalWeeks;
  const isRaceTest =
    weekNum === ctx.totalWeeks - 2 || weekNum === ctx.totalWeeks - 3;
  const withStrides = weekIdx % 2 === 1 && !isRaceWeek;

  const duration = isRaceWeek
    ? 20
    : isRaceTest
      ? 30
      : 40 + Math.floor(progress * 20);

  const stridesDuration = withStrides ? 6 : 0;
  const totalDuration = 10 + duration + stridesDuration + 5;
  const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelEasy);

  const strat = `PUMP ON (EASE OFF) - FUEL PER 10: ${ctx.fuelEasy}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);

  const sessionLabel = withStrides ? "Easy + Strides" : "Easy";
  const name = `W${weekNum.toString().padStart(2, "0")} Tue ${sessionLabel} ${ctx.prefix}${isRaceWeek ? " [SHAKEOUT]" : ""}`;

  let notes: string;
  if (isRaceWeek) {
    notes = "Pre-race shakeout. Just loosen the legs and shake off any nerves. Keep it short, keep it easy. Tomorrow is the day.";
  } else if (withStrides) {
    notes = "Easy run with strides at the end. The main run should be fully conversational — save your energy. After the easy portion, do 4 short strides: accelerate smoothly to near-sprint over 20 seconds, then walk/jog back. Strides build neuromuscular speed without creating fatigue.";
  } else {
    notes = "Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.";
  }

  if (withStrides) {
    const easyStep = formatStep(`${duration}m`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
    const strideWork = formatStep("20s", ctx.zones.hard.min, ctx.zones.hard.max, ctx.lthr);
    const strideRest = formatStep("1m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
    const lines = [
      strat,
      "",
      notes,
      "",
      "Warmup",
      `- ${wu}`,
      "",
      "Main set",
      `- ${easyStep}`,
      "",
      "Strides 4x",
      `- ${strideWork}`,
      `- ${strideRest}`,
      "",
      "Cooldown",
      `- ${cd}`,
      "",
    ];
    return {
      start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
      name,
      description: lines.join("\n"),
      external_id: `${ctx.prefix}-tue-${weekNum}`,
      type: "Run",
    };
  }

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name,
    description: createWorkoutText(strat, wu, [
      formatStep(`${duration}m`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ], cd, 1, notes),
    external_id: `${ctx.prefix}-tue-${weekNum}`,
    type: "Run",
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
  const weekNum = weekIdx + 1;

  const name = `W${weekNum.toString().padStart(2, "0")} Sat Bonus Easy ${ctx.prefix}`;

  const totalDuration = 10 + 30 + 5;
  const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelEasy);

  const strat = `PUMP ON (EASE OFF) - FUEL PER 10: ${ctx.fuelEasy}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
  const notes = "Optional bonus run to add volume. This is extra credit — if your legs feel heavy from the week, skip it or walk instead. If you're feeling fresh, enjoy an easy 30 minutes. No pressure, no pace targets. Just move.";

  return {
    start_date_local: set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }),
    name,
    description: createWorkoutText(strat, wu, [
      formatStep("30m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ], cd, 1, notes),
    external_id: `${ctx.prefix}-sat-${weekNum}`,
    type: "Run",
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
    const estimatedRaceDuration = ctx.raceDist * 5.67;
    const totalCarbs = calculateWorkoutCarbs(estimatedRaceDuration, ctx.fuelLong);
    const strat = `PUMP OFF - FUEL PER 10: ${ctx.fuelLong}g TOTAL: ${totalCarbs}g`;
    return {
      start_date_local: set(ctx.raceDate, { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 }),
      name: `RACE DAY ${ctx.prefix}`,
      description: `RACE DAY! ${ctx.raceDist}km. ${strat}\n\nGood luck!`,
      external_id: `${ctx.prefix}-race`,
      type: "Run",
    };
  }
  const date = addDays(weekStart, 6);
  if (!isBefore(date, ctx.raceDate)) return null;
  const isTaper = weekNum === ctx.totalWeeks - 1;
  const isRaceTest =
    weekNum === ctx.totalWeeks - 2 || weekNum === ctx.totalWeeks - 3;
  const isRecoveryWeek = weekNum % 4 === 0;

  let km = Math.min(
    Math.floor(
      ctx.startKm +
        ((ctx.raceDist - ctx.startKm) / Math.max(ctx.totalWeeks - 4, 1)) *
          weekIdx,
    ),
    ctx.raceDist,
  );
  let type = "";
  if (isRecoveryWeek) {
    km = ctx.startKm;
    type = " [RECOVERY]";
  }
  if (isTaper) {
    km = Math.floor(ctx.raceDist * 0.5);
    type = " [TAPER]";
  }
  if (isRaceTest) {
    km = ctx.raceDist;
    type = " [RACE TEST]";
  }

  let isRacePaceSandwich = false;
  if (!isRecoveryWeek && !isTaper && weekNum > 1) {
    let nonSpecialCount = 0;
    for (let i = 0; i < weekIdx; i++) {
      const wn = i + 1;
      if (wn % 4 !== 0 && wn < ctx.totalWeeks - 1 && wn > 1) nonSpecialCount++;
    }
    isRacePaceSandwich = nonSpecialCount % 2 === 1;
  }

  const wuKm = 1;
  const cdKm = 1;
  const mainKm = Math.max(km - wuKm - cdKm, 1);

  const estimatedDuration = km * 6.71;
  const totalCarbs = calculateWorkoutCarbs(estimatedDuration, ctx.fuelLong);

  const strat = `PUMP OFF - FUEL PER 10: ${ctx.fuelLong}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep(`${wuKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep(`${cdKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);

  let mainSteps: string[];
  let notes: string;

  if (isRacePaceSandwich && mainKm >= 4) {
    const rpBlockKm = Math.min(2 + Math.floor((weekIdx / ctx.totalWeeks) * 3), Math.floor(mainKm * 0.4));
    const easyBeforeKm = Math.floor((mainKm - rpBlockKm) / 2);
    const easyAfterKm = mainKm - rpBlockKm - easyBeforeKm;
    mainSteps = [
      formatStep(`${easyBeforeKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      formatStep(`${rpBlockKm}km`, ctx.zones.steady.min, ctx.zones.steady.max, ctx.lthr),
      formatStep(`${easyAfterKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = `Long run with a ${rpBlockKm}km race pace block sandwiched in the middle. Start easy and settle in before picking up to race effort. The race pace section should feel controlled, not hard — practise running at goal effort on tired legs. Ease back down afterwards and finish relaxed.`;
  } else if (isRecoveryWeek) {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = "Recovery week long run — shorter distance to let your body absorb the training. Run the whole thing easy and enjoy being out there. No pace pressure today.";
  } else if (isTaper) {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = "Taper run. The hay is in the barn — you've done the work. Keep this short and easy. Your legs might feel heavy or oddly flat; that's normal during taper. Trust the process.";
  } else if (isRaceTest) {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = `Race distance test at easy effort. This is about covering ${km}km and practising your fueling and BG strategy, not about pace. Treat it as a dress rehearsal: same kit, same fuel timing, same pump setup you'll use on race day. Note what works and what doesn't.`;
  } else {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = "Long run at easy pace. This is the most important run of the week — it builds your endurance engine. Keep the effort genuinely easy throughout. If the last few km feel harder at the same pace, that's normal; resist the urge to speed up early to 'bank time'. Fuel early, fuel often.";
  }

  return {
    start_date_local: set(date, { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 }),
    name: `W${weekNum.toString().padStart(2, "0")} Sun Long (${km}km)${type} ${ctx.prefix}`,
    description: createWorkoutText(`${strat} (Trail)`, wu, mainSteps, cd, 1, notes),
    external_id: `${ctx.prefix}-sun-${weekNum}`,
    type: "Run",
  };
};

// --- MAIN ORCHESTRATOR ---

export function generatePlan(
  fuelInterval: number,
  fuelLong: number,
  fuelEasy: number,
  raceDateStr: string,
  raceDist: number,
  prefix: string,
  totalWeeks: number,
  startKm: number,
  lthr: number,
): WorkoutEvent[] {
  const raceDate = parseISO(raceDateStr);
  const today = new Date();
  const ctx: PlanContext = {
    fuelInterval,
    fuelLong,
    fuelEasy,
    raceDate,
    raceDist,
    prefix,
    totalWeeks,
    startKm,
    lthr,
    planStartMonday: addWeeks(
      startOfWeek(raceDate, { weekStartsOn: 1 }),
      -(totalWeeks - 1),
    ),
    zones: {
      easy: { min: 0.66, max: 0.78 },
      steady: { min: 0.78, max: 0.89 },
      tempo: { min: 0.89, max: 0.99 },
      hard: { min: 0.99, max: 1.11 },
    },
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
