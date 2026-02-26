import { describe, it, expect } from "vitest";
import { generatePlan } from "../workoutGenerators";
import { getDay } from "date-fns";

describe("generatePlan", () => {
  const defaultArgs = {
    fuelInterval: 5,
    fuelLong: 10,
    fuelEasy: 8,
    raceDateStr: "2026-06-13",
    raceDist: 16,
    prefix: "eco16",
    totalWeeks: 12,
    startKm: 8,
    lthr: 169,
  };

  function generate(overrides: Partial<typeof defaultArgs> = {}) {
    const args = { ...defaultArgs, ...overrides };
    return generatePlan(
      args.fuelInterval, args.fuelLong, args.fuelEasy,
      args.raceDateStr, args.raceDist, args.prefix,
      args.totalWeeks, args.startKm, args.lthr,
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

  it("includes eco16 suffix in all workout names", () => {
    const plan = generate();
    for (const event of plan) {
      expect(event.name).toContain("eco16");
    }
  });

  it("names long runs with 'Long' not 'LR'", () => {
    const plan = generate();
    const longRuns = plan.filter((e) => e.name.includes("Sun"));
    for (const lr of longRuns) {
      if (!lr.name.includes("RACE DAY")) {
        expect(lr.name).toContain("Long");
        expect(lr.name).not.toContain("LR");
      }
    }
  });

  it("names Saturday runs with 'Bonus'", () => {
    const plan = generate();
    const satRuns = plan.filter((e) => e.name.includes("Sat"));
    for (const run of satRuns) {
      expect(run.name).toContain("Bonus");
    }
  });

  it("includes a race day event in the last week", () => {
    const plan = generate();
    const raceDay = plan.find((e) => e.name.includes("RACE DAY"));
    expect(raceDay).toBeDefined();
    expect(raceDay!.name).toContain("eco16");
  });

  it("skips speed sessions on recovery weeks (every 4th week)", () => {
    const plan = generate();
    const w4Thu = plan.find((e) => e.name.startsWith("W04 Thu"));
    if (w4Thu) {
      expect(w4Thu.name).toContain("Easy");
    }
  });

  it("has proper workout description format with HR zones", () => {
    const plan = generate();
    for (const event of plan) {
      if (event.name.includes("RACE DAY")) continue;
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
      const stepLines = event.description.split("\n").filter((l: string) => l.startsWith("- "));
      expect(stepLines.length).toBeGreaterThan(0);
      for (const line of stepLines) {
        expect(line).toMatch(/intensity=(warmup|active|rest|cooldown)$/);
      }
    }
  });

  it("maps intensity tags correctly for hills workout", () => {
    const plan = generateFull();
    const hills = plan.find((e) => e.name.includes("Hills"));
    expect(hills).toBeDefined();
    const steps = hills!.description.split("\n").filter((l: string) => l.startsWith("- "));
    // Warmup → warmup, Uphill → active, Downhill → recovery, Cooldown → cooldown
    expect(steps[0]).toContain("intensity=warmup");
    expect(steps[1]).toContain("intensity=active");
    expect(steps[2]).toContain("intensity=rest");
    expect(steps[steps.length - 1]).toContain("intensity=cooldown");
  });

  it("maps intensity tags correctly for short intervals workout", () => {
    const plan = generateFull();
    const intervals = plan.find((e) => e.name.includes("Short Intervals"));
    expect(intervals).toBeDefined();
    const steps = intervals!.description.split("\n").filter((l: string) => l.startsWith("- "));
    // Warmup → warmup, Fast → active, Walk → recovery, Cooldown → cooldown
    expect(steps[0]).toContain("intensity=warmup");
    expect(steps[1]).toContain("intensity=active");
    expect(steps[2]).toContain("intensity=rest");
    expect(steps[steps.length - 1]).toContain("intensity=cooldown");
  });

  it("rotates speed session types", () => {
    const plan = generate();
    const speedSessions = plan
      .filter((e) => e.name.includes("Thu") && !e.name.includes("Easy"))
      .map((e) => e.name);

    const types = new Set<string>();
    for (const name of speedSessions) {
      if (name.includes("Short Intervals")) types.add("short");
      if (name.includes("Hills")) types.add("hills");
      if (name.includes("Long Intervals")) types.add("long");
      if (name.includes("Distance Intervals")) types.add("distance");
      if (name.includes("Race Pace Intervals")) types.add("racepace");
    }
    expect(types.size).toBeGreaterThan(1);
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

  it("all events have start_date_local with clean time (12:00)", () => {
    const plan = generate();
    for (const event of plan) {
      const date = event.start_date_local;
      expect(date.getHours()).toBe(12);
      expect(date.getMinutes()).toBe(0);
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

  it("assigns Tue sessions to Tuesday (day 2)", () => {
    const plan = generateFull();
    const tueSessions = plan.filter((e) => e.name.includes(" Tue "));
    expect(tueSessions.length).toBeGreaterThan(0);
    for (const event of tueSessions) {
      expect(getDay(event.start_date_local)).toBe(2);
    }
  });

  it("assigns Thu sessions to Thursday (day 4)", () => {
    const plan = generateFull();
    const thuSessions = plan.filter((e) => e.name.includes(" Thu "));
    expect(thuSessions.length).toBeGreaterThan(0);
    for (const event of thuSessions) {
      expect(getDay(event.start_date_local)).toBe(4);
    }
  });

  it("assigns Sat sessions to Saturday (day 6)", () => {
    const plan = generateFull();
    const satSessions = plan.filter((e) => e.name.includes(" Sat "));
    expect(satSessions.length).toBeGreaterThan(0);
    for (const event of satSessions) {
      expect(getDay(event.start_date_local)).toBe(6);
    }
  });

  it("assigns Sun long runs to Sunday (day 0)", () => {
    const plan = generateFull();
    const sunSessions = plan.filter((e) => e.name.includes(" Sun "));
    expect(sunSessions.length).toBeGreaterThan(0);
    for (const event of sunSessions) {
      expect(getDay(event.start_date_local)).toBe(0);
    }
  });

  // --- LONG RUN SANDWICH PROGRESSION ---

  it("rotates long runs between all-easy, sandwich, and progressive", () => {
    const plan = generateFull();
    const longRuns = plan.filter(
      (e) => e.name.includes("Sun Long") && !e.name.includes("RECOVERY") && !e.name.includes("TAPER") && !e.name.includes("RACE TEST"),
    );
    // At least some should have race pace sections (sandwich or progressive)
    expect(longRuns.some((lr) => lr.description.includes("78-89%"))).toBe(true);
    // At least some should have tempo sections (progressive)
    expect(longRuns.some((lr) => lr.description.includes("89-99%"))).toBe(true);
    // At least some should be all-easy
    expect(longRuns.some((lr) =>
      !lr.description.includes("78-89%") && !lr.description.includes("89-99%"),
    )).toBe(true);
  });

  it("progressive long runs build from easy through steady to tempo", () => {
    const plan = generateFull();
    const progressiveRuns = plan.filter(
      (e) => e.name.includes("Sun Long") && e.description.includes("Progressive"),
    );
    expect(progressiveRuns.length).toBeGreaterThan(0);
    for (const run of progressiveRuns) {
      // Main set should contain all three zones in ascending order
      const mainSet = run.description.slice(run.description.indexOf("Main set"));
      expect(mainSet).toContain("66-78%");
      expect(mainSet).toContain("78-89%");
      expect(mainSet).toContain("89-99%");
      // Steady comes after easy, tempo comes after steady
      const steadyIdx = mainSet.indexOf("78-89%");
      const tempoIdx = mainSet.indexOf("89-99%");
      expect(tempoIdx).toBeGreaterThan(steadyIdx);
    }
  });

  it("grows race pace block distance as plan progresses", () => {
    const plan = generateFull();
    const sandwichRuns = plan.filter(
      (e) => e.name.includes("Sun Long") && e.description.includes("78-89%"),
    );
    if (sandwichRuns.length < 2) return;

    // Extract race pace km from each sandwich run
    const rpKms = sandwichRuns.map((lr) => {
      const match = lr.description.match(/(\d+)km\s+78-89%/);
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
      (e) => e.name.includes("Sun Long") && !e.name.includes("RECOVERY") && !e.name.includes("TAPER"),
    );

    const distances = longRuns.map((lr) => {
      const match = lr.name.match(/\((\d+)km\)/);
      return match ? parseInt(match[1], 10) : 0;
    });

    // First long run should start at startKm (8)
    expect(distances[0]).toBe(8);
    // Last non-special long run distance should be greater than first
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0]);
  });

  it("reduces distance on recovery weeks (every 4th week)", () => {
    const plan = generateFull();
    const recoveryRuns = plan.filter((e) => e.name.includes("[RECOVERY]"));
    expect(recoveryRuns.length).toBeGreaterThan(0);
    for (const run of recoveryRuns) {
      const match = run.name.match(/\((\d+)km\)/);
      expect(match).not.toBeNull();
      // Recovery runs reset to startKm (8)
      expect(parseInt(match![1], 10)).toBe(8);
    }
  });

  it("reduces distance on taper week", () => {
    const plan = generateFull();
    const taperRuns = plan.filter((e) => e.name.includes("[TAPER]"));
    expect(taperRuns.length).toBe(1);
    const match = taperRuns[0].name.match(/\((\d+)km\)/);
    expect(match).not.toBeNull();
    // Taper is 50% of race distance (16 * 0.5 = 8)
    expect(parseInt(match![1], 10)).toBe(8);
  });

  it("sets race test weeks to full race distance", () => {
    const plan = generateFull();
    const raceTests = plan.filter((e) => e.name.includes("[RACE TEST]"));
    expect(raceTests.length).toBeGreaterThan(0);
    for (const rt of raceTests) {
      const match = rt.name.match(/\((\d+)km\)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBe(16);
    }
  });
});
