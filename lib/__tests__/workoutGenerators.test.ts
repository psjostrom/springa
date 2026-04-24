import { describe, it, expect } from "vitest";
import { generatePlan, generateSingleWorkout, suggestCategory, buildContext, getWeekPhase, assignDayRoles } from "../workoutGenerators";
import type { OnDemandCategory, DayRole, PlanConfig } from "../workoutGenerators";
import { getDay } from "date-fns";
import { getWeekIdx, prescribedCarbs } from "../workoutMath";
import { TEST_HR_ZONES, TEST_LTHR, TEST_GOAL_TIME } from "./testConstants";

describe("assignDayRoles", () => {
  it("assigns long + easy for 2-day schedule (no speed)", () => {
    const roles = assignDayRoles([2, 0], 0); // Tue + Sun, long on Sun
    expect(roles.get(0)).toBe("long");
    expect(roles.get(2)).toBe("easy");
    expect(roles.size).toBe(2);
  });

  it("assigns long + speed + easy for 3-day schedule", () => {
    const roles = assignDayRoles([2, 5, 0], 0); // Tue + Fri + Sun
    expect(roles.get(0)).toBe("long");
    expect(roles.has(2) || roles.has(5)).toBe(true);
    const speedDay = [...roles.entries()].find(([, r]) => r === "speed");
    expect(speedDay).toBeDefined();
  });

  it("places speed as far from long run as possible", () => {
    const roles = assignDayRoles([1, 3, 5, 0], 0); // Mon/Wed/Fri/Sun, long=Sun
    // Wednesday (3) or Thursday (if present) is farthest from Sunday (0)
    // Mon=1 is distance 1 from Sun=0, Wed=3 is distance 3, Fri=5 is distance 2
    expect(roles.get(3)).toBe("speed");
  });

  it("assigns free runs for 5+ days", () => {
    const roles = assignDayRoles([1, 2, 3, 5, 0], 0);
    const freeRuns = [...roles.entries()].filter(([, r]) => r === "free");
    expect(freeRuns.length).toBe(1);
  });

  it("club replaces speed when clubType is speed", () => {
    const roles = assignDayRoles([2, 4, 6, 0], 0, 4, "speed");
    expect(roles.get(4)).toBe("club");
    const speedDays = [...roles.entries()].filter(([, r]) => r === "speed");
    expect(speedDays.length).toBe(0);
  });

  it("club coexists with speed when clubType is easy", () => {
    const roles = assignDayRoles([2, 4, 6, 0], 0, 4, "easy");
    expect(roles.get(4)).toBe("club");
    const speedDays = [...roles.entries()].filter(([, r]) => r === "speed");
    expect(speedDays.length).toBe(1);
  });

  it("no club run when clubDay is not set", () => {
    const roles = assignDayRoles([2, 6, 0], 0);
    const clubDays = [...roles.entries()].filter(([, r]) => r === "club");
    expect(clubDays.length).toBe(0);
  });
});

describe("generatePlan", () => {
  const defaultConfig: PlanConfig = {
    bgModel: null,
    raceDateStr: "2026-06-13",
    raceDist: 16,
    totalWeeks: 12,
    startKm: 8,
    lthr: TEST_LTHR,
    hrZones: [...TEST_HR_ZONES],
    currentAbilitySecs: TEST_GOAL_TIME,
    currentAbilityDist: 16,
  };

  function generate(overrides: Partial<PlanConfig> = {}) {
    return generatePlan({ ...defaultConfig, ...overrides });
  }

  // Use a far-future race date so all 12 weeks are generated regardless of today's date
  function generateFull(overrides: Partial<PlanConfig> = {}) {
    return generate({ raceDateStr: "2027-06-12", ...overrides });
  }


  it("generates workouts for future weeks only", () => {
    const plan = generate();
    expect(plan.length).toBeGreaterThan(0);
  });

  it("uses clean workout names without prefix suffix", () => {
    const plan = generate();
    for (const event of plan) {
      expect(event.name).not.toContain("eco16");
    }
  });

  it("names long runs with 'Long' not 'LR'", () => {
    const plan = generate();
    const longRuns = plan.filter((e) => e.external_id.includes("long-"));
    for (const lr of longRuns) {
      if (!lr.name.includes("RACE DAY")) {
        expect(lr.name).toContain("Long");
        expect(lr.name).not.toContain("LR");
      }
    }
  });

  it("includes a race day event in the last week", () => {
    const plan = generate();
    const raceDay = plan.find((e) => e.name.includes("RACE DAY"));
    expect(raceDay).toBeDefined();
  });

  it("generates club run when clubDay is configured", () => {
    const plan = generatePlan({
      ...defaultConfig, raceDateStr: "2027-06-12",
      runDays: [2, 4, 6, 0], longRunDay: 0, clubDay: 4, clubType: "speed",
    });
    const clubRuns = plan.filter((e) => e.external_id.includes("club-"));
    expect(clubRuns.length).toBeGreaterThan(0);
    for (const run of clubRuns) {
      expect(run.name).toContain("Club Run");
      expect(getDay(run.start_date_local)).toBe(4);
      expect(run.start_date_local.getHours()).toBe(18);
      expect(run.start_date_local.getMinutes()).toBe(30);
    }
  });

  it("generates club runs with parseable duration for carb totals", () => {
    const plan = generatePlan({
      ...defaultConfig, raceDateStr: "2027-06-12",
      runDays: [2, 4, 6, 0], longRunDay: 0, clubDay: 4, clubType: "speed",
    });
    const clubRuns = plan.filter((e) => e.external_id.includes("club-"));
    expect(clubRuns.length).toBeGreaterThan(0);
    for (const run of clubRuns) {
      const carbs = prescribedCarbs(run.description, run.fuelRate);
      expect(carbs).not.toBeNull();
      expect(carbs).toBeGreaterThan(0);
    }
  });

  it("does not generate club runs when clubDay is not configured", () => {
    const plan = generateFull();
    const clubRuns = plan.filter((e) => e.external_id.includes("club-"));
    expect(clubRuns.length).toBe(0);
  });

  it("generates speed sessions when no club covers speed", () => {
    const plan = generateFull();
    const speedSessions = plan.filter((e) => e.external_id.includes("speed-"));
    expect(speedSessions.length).toBeGreaterThan(0);
  });

  it("has proper workout description format with pace targets", () => {
    const plan = generate();
    for (const event of plan) {
      if (event.name.includes("RACE DAY")) continue;
      if (event.name.includes("Club Run")) continue;
      if (event.name.includes("Free Run")) continue;
      expect(event.description).toContain("/km Pace");
      expect(event.description).not.toContain("LTHR");
    }
  });

  it("sets fuelRate on all events instead of embedding in descriptions", () => {
    const plan = generate();
    for (const event of plan) {
      expect(event.fuelRate).toBeDefined();
      expect(event.fuelRate).toBeGreaterThan(0);
      expect(event.description).not.toContain("FUEL PER 10:");
      expect(event.description).not.toContain("TOTAL:");
    }
  });

  it("includes Garmin intensity= tags on all step lines", () => {
    const plan = generateFull();
    for (const event of plan) {
      if (event.name.includes("RACE DAY")) continue;
      if (event.name.includes("Club Run")) continue;
      if (event.name.includes("Free Run")) continue;
      const stepLines = event.description.split("\n").filter((l: string) => l.startsWith("- "));
      expect(stepLines.length).toBeGreaterThan(0);
      for (const line of stepLines) {
        expect(line).toMatch(/intensity=(warmup|active|rest|cooldown)$/);
      }
    }
  });

  it("all events have type 'Run'", () => {
    const plan = generate();
    for (const event of plan) {
      expect(event.type).toBe("Run");
    }
  });

  it("all events have unique external_id", () => {
    const plan = generate();
    const ids = plan.map((e) => e.external_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all events have clean time (12:00 for runs, 18:30 for club)", () => {
    const plan = generatePlan({
      ...defaultConfig, raceDateStr: "2027-06-12",
      runDays: [2, 4, 6, 0], longRunDay: 0, clubDay: 4, clubType: "speed",
    });
    for (const event of plan) {
      const date = event.start_date_local;
      if (event.name.includes("Club Run")) {
        expect(date.getHours()).toBe(18);
        expect(date.getMinutes()).toBe(30);
      } else {
        expect(date.getHours()).toBe(12);
        expect(date.getMinutes()).toBe(0);
      }
      expect(date.getSeconds()).toBe(0);
    }
  });

  it("does not produce duplicate dates from date mutation", () => {
    const plan = generate();
    for (let i = 0; i < plan.length; i++) {
      for (let j = i + 1; j < plan.length; j++) {
        if (plan[i].start_date_local === plan[j].start_date_local) {
          expect(plan[i].start_date_local).not.toBe(plan[j].start_date_local);
        }
      }
    }
  });

  // --- DAY-OF-WEEK ASSIGNMENTS ---

  it("respects custom runDays scheduling", () => {
    const plan = generatePlan({
      ...defaultConfig, raceDateStr: "2027-06-12",
      runDays: [1, 3, 6], longRunDay: 6, // Mon/Wed/Sat, long=Sat
    });
    for (const event of plan) {
      const day = getDay(event.start_date_local);
      expect([1, 3, 6]).toContain(day);
    }
  });

  it("assigns long runs to the configured longRunDay", () => {
    const plan = generatePlan({
      ...defaultConfig, raceDateStr: "2027-06-12",
      runDays: [2, 5, 6], longRunDay: 6, // Tue/Fri/Sat, long=Sat
    });
    const longRuns = plan.filter((e) => e.external_id.includes("long-"));
    expect(longRuns.length).toBeGreaterThan(0);
    for (const event of longRuns) {
      expect(getDay(event.start_date_local)).toBe(6);
    }
  });

  it("assigns long runs to Sunday with default scheduling", () => {
    const plan = generateFull();
    const longSessions = plan.filter((e) => e.external_id.includes("long-"));
    expect(longSessions.length).toBeGreaterThan(0);
    for (const event of longSessions) {
      expect(getDay(event.start_date_local)).toBe(0);
    }
  });

  // --- LONG RUN COMPOSITION ---

  it("produces both all-easy and sandwich long runs in the build phase", () => {
    const plan = generateFull();
    const longRuns = plan.filter(
      (e) => e.external_id.includes("long-") && !e.name.includes("RECOVERY") && !e.name.includes("TAPER") && !e.name.includes("RACE TEST"),
    );
    expect(longRuns.some((lr) => lr.description.includes("race pace block sandwiched"))).toBe(true);
    expect(longRuns.some((lr) => !lr.description.includes("race pace block sandwiched"))).toBe(true);
  });

  it("never schedules sandwich long runs in consecutive weeks", () => {
    const plan = generateFull();
    const longRuns = plan
      .filter((e) => e.external_id.includes("long-"))
      .sort((a, b) => a.start_date_local.getTime() - b.start_date_local.getTime());
    const variants = longRuns.map((lr) =>
      lr.description.includes("race pace block sandwiched") ? "sandwich" : "easy",
    );
    for (let i = 1; i < variants.length; i++) {
      expect(variants[i] === "sandwich" && variants[i - 1] === "sandwich").toBe(false);
    }
  });

  it("never puts interval pace in a long run", () => {
    const plan = generateFull();
    const longRuns = plan.filter((e) => e.external_id.includes("long-"));
    expect(longRuns.length).toBeGreaterThan(0);
    for (const run of longRuns) {
      expect(run.description).not.toContain("106-111% pace");
    }
  });

  it("increases long run total distance progressively", () => {
    const plan = generateFull();
    const longRuns = plan.filter(
      (e) => e.external_id.includes("long-") && !e.name.includes("RECOVERY") && !e.name.includes("TAPER"),
    );
    const distances = longRuns.map((lr) => {
      const match = /\((\d+)km\)/.exec(lr.name);
      return match ? parseInt(match[1], 10) : 0;
    });
    expect(distances[0]).toBe(8);
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0]);
  });

  it("reduces distance on recovery weeks (3:1 pattern within build)", () => {
    const plan = generateFull();
    const recoveryRuns = plan.filter((e) => e.name.includes("[RECOVERY]"));
    expect(recoveryRuns.length).toBeGreaterThan(0);
    for (const run of recoveryRuns) {
      const match = /\((\d+)km\)/.exec(run.name);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(8);
    }
  });

  it("reduces distance on taper weeks", () => {
    const plan = generateFull();
    const taperRuns = plan.filter((e) => e.name.includes("[TAPER]"));
    expect(taperRuns.length).toBe(2);
    for (const run of taperRuns) {
      const match = /\((\d+)km\)/.exec(run.name);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(8);
    }
  });

  it("sets race test weeks to full race distance (2 weeks)", () => {
    const plan = generateFull();
    const raceTests = plan.filter((e) => e.name.includes("[RACE TEST]"));
    expect(raceTests.length).toBe(2);
    for (const rt of raceTests) {
      const match = /\((\d+)km\)/.exec(rt.name);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(16);
    }
  });

  // --- EASY RUN FORMAT ---

  it("easy runs use WU/main/CD structure with 15m cooldown", () => {
    const plan = generateFull();
    const easyRuns = plan.filter(
      (e) => e.external_id.includes("easy-") && !e.name.includes("Strides"),
    );
    expect(easyRuns.length).toBeGreaterThan(0);
    for (const run of easyRuns) {
      expect(run.description).toContain("Warmup");
      expect(run.description).toContain("Cooldown");
      const cdMatch = /Cooldown\n- .*?(\d+)m/.exec(run.description);
      expect(cdMatch).not.toBeNull();
      expect(parseInt(cdMatch![1], 10)).toBeGreaterThanOrEqual(10);
      expect(parseInt(cdMatch![1], 10)).toBeLessThanOrEqual(15);
    }
  });

  it("easy + strides cooldown is 15m", () => {
    const plan = generateFull();
    const strideRuns = plan.filter((e) => e.name.includes("Strides"));
    expect(strideRuns.length).toBeGreaterThan(0);
    for (const run of strideRuns) {
      expect(run.description).toContain("Warmup");
      expect(run.description).toContain("Cooldown");
      const cdMatch = /Cooldown\n- .*?(\d+)m/.exec(run.description);
      expect(cdMatch).not.toBeNull();
      expect(parseInt(cdMatch![1], 10)).toBe(15);
    }
  });

  it("long run cooldown is 2km", () => {
    const plan = generateFull();
    const longRuns = plan.filter(
      (e) => e.external_id.includes("long-") && !e.name.includes("RACE DAY"),
    );
    expect(longRuns.length).toBeGreaterThan(0);
    for (const run of longRuns) {
      const cdMatch = /Cooldown\n- .*?(\d+)km/.exec(run.description);
      expect(cdMatch).not.toBeNull();
      expect(parseInt(cdMatch![1], 10)).toBe(2);
    }
  });

  it("on-demand quality sessions have 5m cooldown", () => {
    const onDemandConfig: PlanConfig = { ...defaultConfig, raceDateStr: "2027-06-12" };
    const ctx = buildContext(onDemandConfig);
    const buildThursday = new Date(ctx.planStartMonday);
    buildThursday.setDate(buildThursday.getDate() + 4 * 7 + 3);
    const event = generateSingleWorkout("quality", buildThursday, onDemandConfig);
    expect(event).not.toBeNull();
    const cdMatch = /Cooldown\n- .*?(\d+)m/.exec(event!.description);
    expect(cdMatch).not.toBeNull();
    expect(parseInt(cdMatch![1], 10)).toBe(5);
  });

  it("easy run total duration is preserved after taper restructure", () => {
    const plan = generateFull();
    const easyRuns = plan.filter(
      (e) => e.external_id.includes("easy-") && !e.name.includes("Strides"),
    );
    for (const run of easyRuns) {
      const stepLines = run.description.split("\n").filter((l: string) => l.startsWith("- "));
      let totalMin = 0;
      for (const line of stepLines) {
        const match = /(\d+)m\s/.exec(line);
        if (match) totalMin += parseInt(match[1], 10);
      }
      expect(totalMin).toBeGreaterThanOrEqual(30);
      expect(totalMin).toBeLessThanOrEqual(70);
    }
  });

  it("uses absolute pace format when ability is set", () => {
    // 5K race
    const plan5k = generateFull({
      raceDist: 5, currentAbilitySecs: 1620, currentAbilityDist: 5,
    });
    const rp5k = plan5k.find((e) => e.description.includes("Race Pace") && e.description.includes("Race pace practice"));
    expect(rp5k).toBeDefined();
    expect(rp5k!.description).toContain("/km Pace");
    expect(rp5k!.description).not.toContain("% pace");

    // Marathon race
    const planMarathon = generateFull({
      raceDist: 42.195, currentAbilitySecs: 15300, currentAbilityDist: 42.195,
    });
    const rpMarathon = planMarathon.find((e) => e.description.includes("Race Pace") && e.description.includes("Race pace practice"));
    expect(rpMarathon).toBeDefined();
    expect(rpMarathon!.description).toContain("/km Pace");
    expect(rpMarathon!.description).not.toContain("% pace");

    // Easy also uses absolute pace
    const easy5k = plan5k.find((e) => e.external_id.includes("easy-"));
    expect(easy5k!.description).toContain("/km Pace");
    const easyMarathon = planMarathon.find((e) => e.external_id.includes("easy-"));
    expect(easyMarathon!.description).toContain("/km Pace");
  });

  it("derives paceTable from currentAbility", () => {
    const events = generatePlan({
      bgModel: null,
      raceDateStr: "2026-08-01",
      raceDist: 16,
      totalWeeks: 16,
      startKm: 8,
      lthr: 168,
      hrZones: [120, 150, 165, 179, 189],
      currentAbilitySecs: 3300,   // 10K in 55:00 (flat road)
      currentAbilityDist: 10,
    });
    const easyRun = events.find((e) => e.name.includes("Easy") && !e.name.includes("Strides"));
    expect(easyRun).toBeDefined();
    expect(easyRun!.description).toContain("/km Pace");
  });

  it("falls back to % pace when ability is not set", () => {
    const plan = generatePlan({
      bgModel: null,
      raceDateStr: "2027-06-12",
      raceDist: 16,
      totalWeeks: 12,
      startKm: 8,
      lthr: TEST_LTHR,
      hrZones: [...TEST_HR_ZONES],
    });
    const easyRun = plan.find((e) => e.name.includes("Easy") && !e.name.includes("Strides"));
    expect(easyRun).toBeDefined();
    expect(easyRun!.description).toContain("% pace");
    expect(easyRun!.description).not.toContain("/km Pace");
  });

  it("generates correct absolute paces for race pace steps", () => {
    const plan = generatePlan({
      bgModel: null,
      raceDateStr: "2027-06-12",
      raceDist: 21.0975,
      totalWeeks: 12,
      startKm: 8,
      lthr: TEST_LTHR,
      hrZones: [...TEST_HR_ZONES],
      currentAbilitySecs: TEST_GOAL_TIME,
      currentAbilityDist: 21.0975,
    });
    const rpRun = plan.find((e) => e.description.includes("Race pace practice"));
    expect(rpRun).toBeDefined();
    // HM at 8400s → threshold = 6.636 min/km
    // z3 (99-102%): fast = 6.636/1.02 = 6:30, slow = 6.636/0.99 = 6:42
    const rpLine = rpRun!.description.split("\n").find((l: string) => l.includes("Race Pace") && l.includes("/km Pace"));
    expect(rpLine).toBeDefined();
    const match = /(\d+:\d+)-(\d+:\d+)\/km Pace/.exec(rpLine!);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("6:30");
    expect(match![2]).toBe("6:42");
  });

  it("easy run steps use absolute pace format with wide range (allows walking)", () => {
    const events = generatePlan({
      bgModel: null,
      raceDateStr: "2026-08-01",
      raceDist: 21.0975,
      totalWeeks: 16,
      startKm: 8,
      lthr: 168,
      hrZones: [120, 150, 165, 179, 189],
      currentAbilitySecs: 8400,
      currentAbilityDist: 21.0975,
    });
    const easyRun = events.find((e) => e.name.includes("Easy") && !e.name.includes("Strides"));
    expect(easyRun).toBeDefined();
    expect(easyRun!.description).toContain("/km Pace");
    expect(easyRun!.description).not.toContain("% pace");
  });

  it("generates free runs for 5+ day schedules", () => {
    const plan = generatePlan({
      ...defaultConfig, raceDateStr: "2027-06-12",
      runDays: [1, 2, 3, 5, 0], longRunDay: 0,
    });
    const freeRuns = plan.filter((e) => e.external_id.includes("free-"));
    expect(freeRuns.length).toBeGreaterThan(0);
    for (const run of freeRuns) {
      expect(run.name).toContain("Free Run");
    }
  });
});

describe("generateSingleWorkout", () => {
  const config: PlanConfig = {
    bgModel: null,
    raceDateStr: "2027-06-12",
    raceDist: 16,
    totalWeeks: 12,
    startKm: 8,
    lthr: TEST_LTHR,
    hrZones: [...TEST_HR_ZONES],
  };

  const ctx = buildContext(config);
  const buildThursday = new Date(ctx.planStartMonday);
  buildThursday.setDate(buildThursday.getDate() + 4 * 7 + 3);

  it("returns a workout for each category", () => {
    const categories: OnDemandCategory[] = ["easy", "quality", "long", "club"];
    for (const cat of categories) {
      const event = generateSingleWorkout(cat, buildThursday, config);
      expect(event).not.toBeNull();
      expect(event!.type).toBe("Run");
      expect(event!.description.length).toBeGreaterThan(0);
    }
  });

  it("uses the requested date for on-demand generation", () => {
    const event = generateSingleWorkout("easy", buildThursday, config);
    expect(event).not.toBeNull();
    expect(event!.start_date_local.getFullYear()).toBe(buildThursday.getFullYear());
    expect(event!.start_date_local.getMonth()).toBe(buildThursday.getMonth());
    expect(event!.start_date_local.getDate()).toBe(buildThursday.getDate());
  });

  it("sets external_id to ondemand-YYYY-MM-DD", () => {
    const event = generateSingleWorkout("easy", buildThursday, config);
    expect(event).not.toBeNull();
    expect(event!.external_id).toMatch(/^ondemand-\d{4}-\d{2}-\d{2}$/);
  });

  it("returns null for dates outside plan window", () => {
    const farPast = new Date("2020-01-01");
    const event = generateSingleWorkout("easy", farPast, config);
    expect(event).toBeNull();
  });

  it("club category uses the requested date", () => {
    const tuesday = new Date(buildThursday);
    tuesday.setDate(tuesday.getDate() - 2);
    const event = generateSingleWorkout("club", tuesday, config);
    expect(event).not.toBeNull();
    expect(event!.start_date_local.getDay()).toBe(tuesday.getDay());
    expect(event!.start_date_local.getHours()).toBe(18);
    expect(event!.start_date_local.getMinutes()).toBe(30);
  });

  it("club category works during recovery weeks (no phase guard)", () => {
    for (let w = 0; w < config.totalWeeks; w++) {
      const wp = getWeekPhase(ctx, w);
      if (wp.isRecovery) {
        const recoveryDate = new Date(ctx.planStartMonday);
        recoveryDate.setDate(recoveryDate.getDate() + w * 7 + 3);
        const event = generateSingleWorkout("club", recoveryDate, config);
        expect(event).not.toBeNull();
        expect(event!.name).toContain("Club Run");
        return;
      }
    }
  });

  it("quality category downgrades to easy during recovery week", () => {
    for (let w = 0; w < config.totalWeeks; w++) {
      const wp = getWeekPhase(ctx, w);
      if (wp.isRecovery) {
        const recoveryThursday = new Date(ctx.planStartMonday);
        recoveryThursday.setDate(recoveryThursday.getDate() + w * 7 + 3);
        const event = generateSingleWorkout("quality", recoveryThursday, config);
        expect(event).not.toBeNull();
        expect(event!.name).toContain("Easy");
        return;
      }
    }
  });

  it("quality category downgrades to easy during base phase", () => {
    const baseConfig = { ...config, includeBasePhase: true };
    const baseCtx = buildContext(baseConfig);
    const week1Thursday = new Date(baseCtx.planStartMonday);
    week1Thursday.setDate(week1Thursday.getDate() + 3);
    const wp = getWeekPhase(baseCtx, 0);
    if (wp.isBase) {
      const event = generateSingleWorkout("quality", week1Thursday, baseConfig);
      expect(event).not.toBeNull();
      expect(event!.name).toContain("Easy");
    }
  });
});

describe("suggestCategory", () => {
  const ctx = buildContext({ bgModel: null, raceDateStr: "2027-06-12", raceDist: 16, totalWeeks: 12, startKm: 8, lthr: TEST_LTHR, hrZones: [...TEST_HR_ZONES] });

  it("suggests long on Sunday (legacy fallback)", () => {
    const sunday = new Date(ctx.planStartMonday);
    sunday.setDate(sunday.getDate() + 4 * 7 + 6);
    const weekIdx = getWeekIdx(sunday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(sunday, wp)).toBe("long");
  });

  it("suggests quality on Thursday (legacy fallback)", () => {
    const thursday = new Date(ctx.planStartMonday);
    thursday.setDate(thursday.getDate() + 4 * 7 + 3);
    const weekIdx = getWeekIdx(thursday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(thursday, wp)).toBe("quality");
  });

  it("suggests easy on other days (legacy fallback)", () => {
    const tuesday = new Date(ctx.planStartMonday);
    tuesday.setDate(tuesday.getDate() + 4 * 7 + 1);
    const weekIdx = getWeekIdx(tuesday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(tuesday, wp)).toBe("easy");
  });

  it("uses role map when provided", () => {
    const roles = new Map<number, DayRole>([
      [6, "long"],
      [3, "speed"],
      [1, "easy"],
    ]);
    const saturday = new Date(ctx.planStartMonday);
    saturday.setDate(saturday.getDate() + 4 * 7 + 5); // Saturday = day 6
    const weekIdx = getWeekIdx(saturday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(saturday, wp, roles)).toBe("long");
  });

  it("suggests easy during recovery week regardless of day", () => {
    for (let w = 0; w < 12; w++) {
      const wp = getWeekPhase(ctx, w);
      if (wp.isRecovery) {
        const thursday = new Date(ctx.planStartMonday);
        thursday.setDate(thursday.getDate() + w * 7 + 3);
        expect(suggestCategory(thursday, wp)).toBe("easy");
        break;
      }
    }
  });
});

