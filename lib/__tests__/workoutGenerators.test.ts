import { describe, it, expect } from "vitest";
import { generatePlan, generateSingleWorkout, suggestCategory, buildContext, getWeekPhase } from "../workoutGenerators";
import type { OnDemandCategory } from "../workoutGenerators";
import { getDay } from "date-fns";
import { getWeekIdx } from "../workoutMath";
import { TEST_HR_ZONES, TEST_LTHR } from "./testConstants";

describe("generatePlan", () => {
  const defaultArgs = {
    bgModel: null,
    raceDateStr: "2026-06-13",
    raceDist: 16,
    totalWeeks: 12,
    startKm: 8,
    lthr: TEST_LTHR,
    hrZones: [...TEST_HR_ZONES],
  };

  function generate(overrides: Partial<typeof defaultArgs> = {}) {
    const args = { ...defaultArgs, ...overrides };
    return generatePlan(
      args.bgModel,
      args.raceDateStr, args.raceDist,
      args.totalWeeks, args.startKm, args.lthr, args.hrZones,
    );
  }

  // Use a far-future race date so all 12 weeks are generated regardless of today's date
  function generateFull(overrides: Partial<typeof defaultArgs> = {}) {
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

  it("names Saturday runs with 'Bonus'", () => {
    const plan = generate();
    const satRuns = plan.filter((e) => e.external_id.includes("bonus-"));
    for (const run of satRuns) {
      expect(run.name).toContain("Bonus");
    }
  });

  it("includes a race day event in the last week", () => {
    const plan = generate();
    const raceDay = plan.find((e) => e.name.includes("RACE DAY"));
    expect(raceDay).toBeDefined();
  });

  it("generates club run on Thursday every week", () => {
    const plan = generateFull();
    const clubRuns = plan.filter((e) => e.external_id.includes("club-"));
    expect(clubRuns.length).toBeGreaterThan(0);
    for (const run of clubRuns) {
      expect(run.name).toContain("Club Run");
      expect(getDay(run.start_date_local)).toBe(4); // Thursday
      expect(run.start_date_local.getHours()).toBe(18);
      expect(run.start_date_local.getMinutes()).toBe(30);
    }
  });

  it("does not generate speed/quality sessions in the plan", () => {
    const plan = generateFull();
    const speedSessions = plan.filter((e) => e.external_id.includes("speed-"));
    expect(speedSessions).toHaveLength(0);
  });

  it("has proper workout description format with HR zones", () => {
    const plan = generate();
    for (const event of plan) {
      if (event.name.includes("RACE DAY")) continue;
      if (event.name.includes("Club Run")) continue;
      expect(event.description).toContain("LTHR");
      expect(event.description).toContain("bpm");
    }
  });

  it("sets fuelRate on all events instead of embedding in descriptions", () => {
    const plan = generate();
    for (const event of plan) {
      expect(event.fuelRate).toBeDefined();
      expect(event.fuelRate).toBeGreaterThan(0);
      // Descriptions should NOT contain fuel text
      expect(event.description).not.toContain("FUEL PER 10:");
      expect(event.description).not.toContain("TOTAL:");
    }
  });

  it("includes Garmin intensity= tags on all step lines", () => {
    const plan = generateFull();
    for (const event of plan) {
      if (event.name.includes("RACE DAY")) continue;
      if (event.name.includes("Club Run")) continue;
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
    const plan = generate();
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
    // Group events by day — no two events within the same generator
    // call should share the exact same Date object reference
    for (let i = 0; i < plan.length; i++) {
      for (let j = i + 1; j < plan.length; j++) {
        if (plan[i].start_date_local === plan[j].start_date_local) {
          // Same object reference means mutation bug
          expect(plan[i].start_date_local).not.toBe(plan[j].start_date_local);
        }
      }
    }
  });

  // --- DAY-OF-WEEK ASSIGNMENTS ---

  it("assigns easy sessions to Tuesday (day 2)", () => {
    const plan = generateFull();
    const easySessions = plan.filter((e) => e.external_id.includes("easy-"));
    expect(easySessions.length).toBeGreaterThan(0);
    for (const event of easySessions) {
      expect(getDay(event.start_date_local)).toBe(2);
    }
  });

  it("assigns club runs to Thursday (day 4)", () => {
    const plan = generateFull();
    const clubRuns = plan.filter((e) => e.external_id.includes("club-"));
    expect(clubRuns.length).toBeGreaterThan(0);
    for (const event of clubRuns) {
      expect(getDay(event.start_date_local)).toBe(4);
    }
  });

  it("assigns bonus sessions to Saturday (day 6)", () => {
    const plan = generateFull();
    const bonusSessions = plan.filter((e) => e.external_id.includes("bonus-"));
    expect(bonusSessions.length).toBeGreaterThan(0);
    for (const event of bonusSessions) {
      expect(getDay(event.start_date_local)).toBe(6);
    }
  });

  it("assigns long runs to Sunday (day 0)", () => {
    const plan = generateFull();
    const longSessions = plan.filter((e) => e.external_id.includes("long-"));
    expect(longSessions.length).toBeGreaterThan(0);
    for (const event of longSessions) {
      expect(getDay(event.start_date_local)).toBe(0);
    }
  });

  // --- LONG RUN SANDWICH PROGRESSION ---

  it("rotates long runs between all-easy, sandwich, and progressive", () => {
    const plan = generateFull();
    const longRuns = plan.filter(
      (e) => e.external_id.includes("long-") && !e.name.includes("RECOVERY") && !e.name.includes("TAPER") && !e.name.includes("RACE TEST"),
    );
    // At least some should have race pace sections (sandwich or progressive)
    expect(longRuns.some((lr) => lr.description.includes("83-92%"))).toBe(true);
    // At least some should have tempo sections (progressive)
    expect(longRuns.some((lr) => lr.description.includes("92-99%"))).toBe(true);
    // At least some should be all-easy
    expect(longRuns.some((lr) =>
      !lr.description.includes("83-92%") && !lr.description.includes("92-99%"),
    )).toBe(true);
  });

  it("progressive long runs build from easy through steady to tempo", () => {
    const plan = generateFull();
    const progressiveRuns = plan.filter(
      (e) => e.external_id.includes("long-") && e.description.includes("Progressive"),
    );
    expect(progressiveRuns.length).toBeGreaterThan(0);
    for (const run of progressiveRuns) {
      // Main set should contain all three zones in ascending order
      const mainSet = run.description.slice(run.description.indexOf("Main set"));
      expect(mainSet).toContain("68-83%");
      expect(mainSet).toContain("83-92%");
      expect(mainSet).toContain("92-99%");
      // Steady comes after easy, tempo comes after steady
      const steadyIdx = mainSet.indexOf("83-92%");
      const tempoIdx = mainSet.indexOf("92-99%");
      expect(tempoIdx).toBeGreaterThan(steadyIdx);
    }
  });

  it("grows race pace block distance as plan progresses", () => {
    const plan = generateFull();
    const sandwichRuns = plan.filter(
      (e) => e.external_id.includes("long-") && e.description.includes("83-92%"),
    );
    if (sandwichRuns.length < 2) return;

    // Extract race pace km from each sandwich run
    const rpKms = sandwichRuns.map((lr) => {
      const match = /(\d+)km\s+83-92%/.exec(lr.description);
      return match ? parseInt(match[1], 10) : 0;
    });

    // The race pace block should not shrink over time (monotonic non-decreasing)
    for (let i = 1; i < rpKms.length; i++) {
      expect(rpKms[i]).toBeGreaterThanOrEqual(rpKms[i - 1]);
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

    // First long run should start at startKm (8)
    expect(distances[0]).toBe(8);
    // Last non-special long run distance should be greater than first
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0]);
  });

  it("reduces distance on recovery weeks (3:1 pattern within build)", () => {
    const plan = generateFull();
    const recoveryRuns = plan.filter((e) => e.name.includes("[RECOVERY]"));
    expect(recoveryRuns.length).toBeGreaterThan(0);
    for (const run of recoveryRuns) {
      const match = /\((\d+)km\)/.exec(run.name);
      expect(match).not.toBeNull();
      // Recovery runs reset to startKm (8)
      expect(parseInt(match![1], 10)).toBe(8);
    }
  });

  it("reduces distance on taper weeks", () => {
    const plan = generateFull();
    const taperRuns = plan.filter((e) => e.name.includes("[TAPER]"));
    expect(taperRuns.length).toBe(2); // 2-week taper
    for (const run of taperRuns) {
      const match = /\((\d+)km\)/.exec(run.name);
      expect(match).not.toBeNull();
      // Taper is 50% of race distance (16 * 0.5 = 8)
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
      // CD is 15m for most runs, 10m for very short runs (shakeout/race-test)
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

  it("bonus runs use WU/main/CD structure with 15m cooldown", () => {
    const plan = generateFull();
    const bonusRuns = plan.filter((e) => e.external_id.includes("bonus-"));
    expect(bonusRuns.length).toBeGreaterThan(0);
    for (const run of bonusRuns) {
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
    // Quality is on-demand only — generate one and check cooldown
    const ctx = buildContext(null, "2027-06-12", 16, 12, 8, TEST_LTHR, [...TEST_HR_ZONES], false);
    const buildThursday = new Date(ctx.planStartMonday);
    buildThursday.setDate(buildThursday.getDate() + 4 * 7 + 3); // week 5
    const event = generateSingleWorkout("quality", buildThursday, null, {
      raceDate: "2027-06-12", raceDist: 16, totalWeeks: 12,
      startKm: 8, lthr: TEST_LTHR, hrZones: [...TEST_HR_ZONES],
    });
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
      // Total should be >= 30 (shortest easy: 10m WU + 10m main + 10m CD)
      // and <= 70 (longest: 10m WU + 45m main + 15m CD)
      expect(totalMin).toBeGreaterThanOrEqual(30);
      expect(totalMin).toBeLessThanOrEqual(70);
    }
  });
});

describe("generateSingleWorkout", () => {
  const settings = {
    raceDate: "2027-06-12",
    raceDist: 16,
    totalWeeks: 12,
    startKm: 8,
    lthr: TEST_LTHR,
    hrZones: [...TEST_HR_ZONES],
  };

  // Pick a Thursday in a build week (week 5)
  const ctx = buildContext(null, settings.raceDate, settings.raceDist, settings.totalWeeks, settings.startKm, settings.lthr, settings.hrZones, false);
  const buildThursday = new Date(ctx.planStartMonday);
  buildThursday.setDate(buildThursday.getDate() + 4 * 7 + 3); // week 5, Thursday

  it("returns a workout for each category", () => {
    const categories: OnDemandCategory[] = ["easy", "quality", "long", "club"];
    for (const cat of categories) {
      const event = generateSingleWorkout(cat, buildThursday, null, settings);
      expect(event).not.toBeNull();
      expect(event!.type).toBe("Run");
      expect(event!.description.length).toBeGreaterThan(0);
    }
  });

  it("overrides the date to the requested date", () => {
    const event = generateSingleWorkout("easy", buildThursday, null, settings);
    expect(event).not.toBeNull();
    expect(event!.start_date_local.getFullYear()).toBe(buildThursday.getFullYear());
    expect(event!.start_date_local.getMonth()).toBe(buildThursday.getMonth());
    expect(event!.start_date_local.getDate()).toBe(buildThursday.getDate());
  });

  it("sets external_id to ondemand-YYYY-MM-DD", () => {
    const event = generateSingleWorkout("easy", buildThursday, null, settings);
    expect(event).not.toBeNull();
    expect(event!.external_id).toMatch(/^ondemand-\d{4}-\d{2}-\d{2}$/);
  });

  it("returns null for dates outside plan window", () => {
    const farPast = new Date("2020-01-01");
    const event = generateSingleWorkout("easy", farPast, null, settings);
    expect(event).toBeNull();
  });

  it("club category always returns Thursday at 18:30 regardless of input date", () => {
    // Generate from a Tuesday — should still land on Thursday
    const tuesday = new Date(buildThursday);
    tuesday.setDate(tuesday.getDate() - 2);
    const event = generateSingleWorkout("club", tuesday, null, settings);
    expect(event).not.toBeNull();
    expect(event!.start_date_local.getDay()).toBe(4); // Thursday
    expect(event!.start_date_local.getHours()).toBe(18);
    expect(event!.start_date_local.getMinutes()).toBe(30);
  });

  it("club category works during recovery weeks (no phase guard)", () => {
    // Find a recovery week
    for (let w = 0; w < settings.totalWeeks; w++) {
      const wp = getWeekPhase(ctx, w);
      if (wp.isRecovery) {
        const recoveryDate = new Date(ctx.planStartMonday);
        recoveryDate.setDate(recoveryDate.getDate() + w * 7 + 3);
        const event = generateSingleWorkout("club", recoveryDate, null, settings);
        expect(event).not.toBeNull();
        expect(event!.name).toContain("Club Run");
        return;
      }
    }
  });

  it("quality category downgrades to easy during recovery week", () => {
    for (let w = 0; w < settings.totalWeeks; w++) {
      const wp = getWeekPhase(ctx, w);
      if (wp.isRecovery) {
        const recoveryThursday = new Date(ctx.planStartMonday);
        recoveryThursday.setDate(recoveryThursday.getDate() + w * 7 + 3);
        const event = generateSingleWorkout("quality", recoveryThursday, null, settings);
        expect(event).not.toBeNull();
        expect(event!.name).toContain("Easy");
        return;
      }
    }
  });

  it("quality category downgrades to easy during base phase", () => {
    const baseSettings = { ...settings, includeBasePhase: true };
    const baseCtx = buildContext(null, baseSettings.raceDate, baseSettings.raceDist, baseSettings.totalWeeks, baseSettings.startKm, baseSettings.lthr, baseSettings.hrZones, true);
    const week1Thursday = new Date(baseCtx.planStartMonday);
    week1Thursday.setDate(week1Thursday.getDate() + 3);
    const wp = getWeekPhase(baseCtx, 0);
    if (wp.isBase) {
      const event = generateSingleWorkout("quality", week1Thursday, null, baseSettings);
      expect(event).not.toBeNull();
      expect(event!.name).toContain("Easy");
    }
  });
});

describe("suggestCategory", () => {
  const ctx = buildContext(null, "2027-06-12", 16, 12, 8, TEST_LTHR, [...TEST_HR_ZONES], false);

  it("suggests long on Sunday", () => {
    // Find a Sunday in a build week
    const sunday = new Date(ctx.planStartMonday);
    sunday.setDate(sunday.getDate() + 4 * 7 + 6); // week 5, Sunday
    const weekIdx = getWeekIdx(sunday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(sunday, wp)).toBe("long");
  });

  it("suggests quality on Thursday", () => {
    const thursday = new Date(ctx.planStartMonday);
    thursday.setDate(thursday.getDate() + 4 * 7 + 3); // week 5, Thursday
    const weekIdx = getWeekIdx(thursday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(thursday, wp)).toBe("quality");
  });

  it("suggests easy on other days", () => {
    const tuesday = new Date(ctx.planStartMonday);
    tuesday.setDate(tuesday.getDate() + 4 * 7 + 1); // week 5, Tuesday
    const weekIdx = getWeekIdx(tuesday, ctx.planStartMonday);
    const wp = getWeekPhase(ctx, weekIdx);
    expect(suggestCategory(tuesday, wp)).toBe("easy");
  });

  it("suggests easy during recovery week regardless of day", () => {
    // Recovery weeks are every 4th week in build phase
    // Find a recovery week Thursday
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
