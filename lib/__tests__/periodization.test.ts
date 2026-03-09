import { describe, it, expect } from "vitest";
import {
  getPhaseBoundaries,
  isRecoveryWeek,
  getPhaseForWeek,
  getPhaseDefinitions,
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
    const b = getPhaseBoundaries(8, true);
    expect(b.baseEnd).toBeGreaterThanOrEqual(2);
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

describe("getPhaseForWeek", () => {
  it("returns correct phases without base (18 weeks)", () => {
    expect(getPhaseForWeek(1, 18, false)).toBe("Build");
    expect(getPhaseForWeek(13, 18, false)).toBe("Build");
    expect(getPhaseForWeek(14, 18, false)).toBe("Race Test");
    expect(getPhaseForWeek(15, 18, false)).toBe("Race Test");
    expect(getPhaseForWeek(16, 18, false)).toBe("Taper");
    expect(getPhaseForWeek(17, 18, false)).toBe("Taper");
    expect(getPhaseForWeek(18, 18, false)).toBe("Race Week");
  });

  it("returns correct phases with base (18 weeks)", () => {
    expect(getPhaseForWeek(1, 18, true)).toBe("Base");
    expect(getPhaseForWeek(3, 18, true)).toBe("Base");
    expect(getPhaseForWeek(4, 18, true)).toBe("Build");
    expect(getPhaseForWeek(13, 18, true)).toBe("Build");
    expect(getPhaseForWeek(14, 18, true)).toBe("Race Test");
    expect(getPhaseForWeek(15, 18, true)).toBe("Race Test");
    expect(getPhaseForWeek(16, 18, true)).toBe("Taper");
    expect(getPhaseForWeek(17, 18, true)).toBe("Taper");
    expect(getPhaseForWeek(18, 18, true)).toBe("Race Week");
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
