import { describe, it, expect } from "vitest";
import {
  getPhaseBoundaries,
  isRecoveryWeek,
  getPhaseDefinitions,
  isCompressedPlan,
  supportsBasePhase,
} from "../periodization";

describe("getPhaseBoundaries", () => {
  it("18-week plan without base phase", () => {
    const b = getPhaseBoundaries(18, false);
    expect(b.baseEnd).toBe(0);
    expect(b.buildStart).toBe(1);
    expect(b.buildEnd).toBe(13);
    expect(b.raceTestStart).toBe(14);
    expect(b.raceTestEnd).toBe(15);
    expect(b.taperStart).toBe(16);
    expect(b.taperEnd).toBe(17);
    expect(b.raceWeek).toBe(18);
  });

  it("18-week plan with base phase", () => {
    const b = getPhaseBoundaries(18, true);
    expect(b.baseEnd).toBe(3);
    expect(b.buildStart).toBe(4);
    expect(b.buildEnd).toBe(13);
    expect(b.raceTestStart).toBe(14);
    expect(b.raceTestEnd).toBe(15);
    expect(b.taperStart).toBe(16);
    expect(b.taperEnd).toBe(17);
    expect(b.raceWeek).toBe(18);
  });

  it("12-week plan without base phase", () => {
    const b = getPhaseBoundaries(12, false);
    expect(b.baseEnd).toBe(0);
    expect(b.buildStart).toBe(1);
    expect(b.buildEnd).toBe(7);
    expect(b.raceTestStart).toBe(8);
    expect(b.raceTestEnd).toBe(9);
    expect(b.taperStart).toBe(10);
    expect(b.taperEnd).toBe(11);
    expect(b.raceWeek).toBe(12);
  });

  it("12-week plan with base phase", () => {
    const b = getPhaseBoundaries(12, true);
    expect(b.baseEnd).toBe(2);
    expect(b.buildStart).toBe(3);
    expect(b.buildEnd).toBe(7);
  });

  it("base phase is at least 2 weeks when enabled", () => {
    const b = getPhaseBoundaries(12, true);
    expect(b.baseEnd).toBeGreaterThanOrEqual(2);
  });

  it("8-week compressed plan without base phase", () => {
    const b = getPhaseBoundaries(8, false);
    expect(b.baseEnd).toBe(0);
    expect(b.buildStart).toBe(1);
    expect(b.buildEnd).toBe(5);
    expect(b.raceTestStart).toBe(6);
    expect(b.raceTestEnd).toBe(6);
    expect(b.taperStart).toBe(7);
    expect(b.taperEnd).toBe(7);
    expect(b.raceWeek).toBe(8);
  });

  it("9-week compressed plan without base phase", () => {
    const b = getPhaseBoundaries(9, false);
    expect(b.baseEnd).toBe(0);
    expect(b.buildStart).toBe(1);
    expect(b.buildEnd).toBe(6);
    expect(b.raceTestStart).toBe(7);
    expect(b.raceTestEnd).toBe(7);
    expect(b.taperStart).toBe(8);
    expect(b.taperEnd).toBe(8);
    expect(b.raceWeek).toBe(9);
  });

  it("rejects plans shorter than MIN_PLAN_WEEKS", () => {
    expect(() => getPhaseBoundaries(7, false)).toThrow("at least 8 weeks");
  });

  it("ignores base phase when total weeks are too short to support it", () => {
    expect(getPhaseBoundaries(8, true)).toEqual(getPhaseBoundaries(8, false));
    expect(getPhaseBoundaries(9, true)).toEqual(getPhaseBoundaries(9, false));
    expect(getPhaseBoundaries(10, true)).toEqual(getPhaseBoundaries(10, false));
  });

  it("accepts 10-week plan without base", () => {
    const b = getPhaseBoundaries(10, false);
    expect(b.buildEnd - b.buildStart + 1).toBeGreaterThanOrEqual(4);
  });

  it("accepts 12-week plan with base", () => {
    const b = getPhaseBoundaries(12, true);
    expect(b.buildEnd - b.buildStart + 1).toBeGreaterThanOrEqual(4);
  });

  it("11-week plan with base is the minimum valid configuration", () => {
    const b = getPhaseBoundaries(11, true);
    expect(b.baseEnd).toBe(2);
    expect(b.buildStart).toBe(3);
    expect(b.buildEnd).toBe(6);
    expect(b.raceTestStart).toBe(7);
    expect(b.raceTestEnd).toBe(8);
    expect(b.taperStart).toBe(9);
    expect(b.taperEnd).toBe(10);
    expect(b.raceWeek).toBe(11);
    expect(b.buildEnd - b.buildStart + 1).toBe(4); // exactly one 3:1 cycle
  });

  it("reports compressed and base-phase support boundaries", () => {
    expect(isCompressedPlan(8)).toBe(true);
    expect(isCompressedPlan(9)).toBe(true);
    expect(isCompressedPlan(10)).toBe(false);
    expect(supportsBasePhase(8)).toBe(false);
    expect(supportsBasePhase(9)).toBe(false);
    expect(supportsBasePhase(10)).toBe(false);
    expect(supportsBasePhase(11)).toBe(true);
  });
});

describe("isRecoveryWeek", () => {
  it("follows 3:1 pattern within build (no base, 18 weeks)", () => {
    // Build: weeks 1-13. Recovery at build index 3 (week 4), index 7 (week 8), index 11 (week 12)
    const recoveries = [];
    for (let w = 1; w <= 18; w++) {
      if (isRecoveryWeek(w, 18, false)) recoveries.push(w);
    }
    expect(recoveries).toEqual([4, 8, 12]);
  });

  it("follows 3:1 pattern within build (with base, 18 weeks)", () => {
    // Build: weeks 4-13. Recovery at build index 3 (week 7) and index 7 (week 11)
    const recoveries = [];
    for (let w = 1; w <= 18; w++) {
      if (isRecoveryWeek(w, 18, true)) recoveries.push(w);
    }
    expect(recoveries).toEqual([7, 11]);
  });

  it("never marks non-build weeks as recovery", () => {
    // Race test, taper, race week should never be recovery
    for (let w = 15; w <= 18; w++) {
      expect(isRecoveryWeek(w, 18, false)).toBe(false);
      expect(isRecoveryWeek(w, 18, true)).toBe(false);
    }
  });
});

describe("getPhaseDefinitions", () => {
  it("returns 4 phases without base", () => {
    const phases = getPhaseDefinitions(18, false);
    expect(phases).toHaveLength(4);
    expect(phases[0].name).toBe("Build");
  });

  it("returns 5 phases with base", () => {
    const phases = getPhaseDefinitions(18, true);
    expect(phases).toHaveLength(5);
    expect(phases[0].name).toBe("Base");
  });

  it("uses one-shot race test copy for compressed plans", () => {
    const phases = getPhaseDefinitions(8, false);
    const raceTest = phases.find((phase) => phase.name === "Race Test");
    expect(raceTest?.startWeek).toBe(6);
    expect(raceTest?.endWeek).toBe(6);
    expect(raceTest?.description).toContain("One race-specific rehearsal");
    expect(raceTest?.description).not.toContain("Two shots");
  });

  it("covers all weeks without gaps (no base)", () => {
    const phases = getPhaseDefinitions(18, false);
    for (let w = 1; w <= 18; w++) {
      const inPhase = phases.some((p) => w >= p.startWeek && w <= p.endWeek);
      expect(inPhase).toBe(true);
    }
  });

  it("covers all weeks without gaps (with base)", () => {
    const phases = getPhaseDefinitions(18, true);
    for (let w = 1; w <= 18; w++) {
      const inPhase = phases.some((p) => w >= p.startWeek && w <= p.endWeek);
      expect(inPhase).toBe(true);
    }
  });
});
