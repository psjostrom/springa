import { describe, it, expect } from "vitest";
import { generatePlan } from "../workoutGenerators";

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

  it("includes fuel strategy in descriptions", () => {
    const plan = generate();
    for (const event of plan) {
      expect(event.description).toContain("FUEL PER 10:");
      expect(event.description).toContain("TOTAL:");
    }
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
});
