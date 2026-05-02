import { describe, it, expect } from "vitest";
import {
  parseWorkoutZones,
  parseWorkoutSegments,
  extractNotes,
  extractStructure,
  parseWorkoutStructure,
  extractStepTotals,
} from "../descriptionParser";
import { formatPace, formatZoneTime, formatHrMin, getPaceForZone, getZoneLabel } from "../format";
import {
  getEstimatedDuration,
  estimateWorkoutDuration,
  estimateWorkoutDistance,
  estimateWorkoutDescriptionDistance,
  estimatePlanEventDistance,
  calculateWorkoutCarbs,
} from "../workoutMath";
import { FALLBACK_PACE_TABLE, DEFAULT_LTHR } from "../constants";
import { TEST_HR_ZONES } from "./testConstants";
import type { PaceTable, CalendarEvent, WorkoutEvent } from "../types";

const testHrZones = [...TEST_HR_ZONES];

describe("formatPace", () => {
  it("converts decimal to MM:SS format", () => {
    expect(formatPace(6.25)).toBe("6:15");
    expect(formatPace(4.75)).toBe("4:45");
    expect(formatPace(5.0)).toBe("5:00");
    expect(formatPace(6.5)).toBe("6:30");
  });

  it("handles sub-minute seconds with padding", () => {
    expect(formatPace(5.083)).toBe("5:05");
  });

  it("rounds correctly", () => {
    expect(formatPace(6.71)).toBe("6:43");
  });
});

describe("formatZoneTime", () => {
  it("formats seconds only", () => {
    expect(formatZoneTime(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatZoneTime(135)).toBe("2m 15s");
  });

  it("formats exact minutes without seconds", () => {
    expect(formatZoneTime(120)).toBe("2m");
  });

  it("formats hours and minutes", () => {
    expect(formatZoneTime(5400)).toBe("1h30m");
  });

  it("formats exact hours", () => {
    expect(formatZoneTime(7200)).toBe("2h");
  });

  it("handles zero", () => {
    expect(formatZoneTime(0)).toBe("0s");
  });
});

describe("formatHrMin", () => {
  it("formats minutes only when under an hour", () => {
    expect(formatHrMin(45)).toBe("45m");
    expect(formatHrMin(0)).toBe("0m");
  });

  it("formats hours and minutes", () => {
    expect(formatHrMin(101)).toBe("1h 41m");
    expect(formatHrMin(135)).toBe("2h 15m");
  });

  it("drops the minutes part for exact hours", () => {
    expect(formatHrMin(60)).toBe("1h");
    expect(formatHrMin(120)).toBe("2h");
  });
});

describe("getPaceForZone", () => {
  it("returns entry from table when present", () => {
    const table: PaceTable = {
      z1: null,
      z2: { zone: "z2", avgPace: 7.0, sampleCount: 5, avgHr: 125 },
      z3: null,
      z4: null,
      z5: null,
    };
    const result = getPaceForZone(table, "z2");
    expect(result.avgPace).toBe(7.0);
    expect(result.sampleCount).toBe(5);
    expect(result.avgHr).toBe(125);
  });

  it("falls back to FALLBACK_PACE_TABLE when entry is null", () => {
    const table: PaceTable = {
      z1: null,
      z2: null,
      z3: null,
      z4: null,
      z5: null,
    };
    const result = getPaceForZone(table, "z2");
    expect(result.avgPace).toBe(FALLBACK_PACE_TABLE.z2!.avgPace);
    expect(result.sampleCount).toBe(0);
  });

  it("returns correct fallback for each zone", () => {
    const emptyTable: PaceTable = {
      z1: null,
      z2: null,
      z3: null,
      z4: null,
      z5: null,
    };
    expect(getPaceForZone(emptyTable, "z3").avgPace).toBe(5.67);
    expect(getPaceForZone(emptyTable, "z4").avgPace).toBe(5.21);
    expect(getPaceForZone(emptyTable, "z5").avgPace).toBe(4.75);
  });
});

describe("getZoneLabel", () => {
  it("maps zone names to display labels", () => {
    expect(getZoneLabel("z2")).toBe("Easy");
    expect(getZoneLabel("z3")).toBe("Race Pace");
    expect(getZoneLabel("z4")).toBe("Interval");
    expect(getZoneLabel("z5")).toBe("Hard");
  });
});

describe("parseWorkoutZones", () => {
  it("extracts HR zones from a short intervals description", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    // midpoint(66,78)=72 → easy, midpoint(89,99)=94 → tempo
    expect(zones).toEqual(["z2", "z4"]);
  });

  it("extracts HR zones from a hills description", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 28g

Warmup
- FUEL PER 10: 5g TOTAL: 28g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    // midpoint(66,78)=72 → easy, midpoint(99,111)=105 → hard
    expect(zones).toEqual(["z2", "z5"]);
  });

  it("extracts all zones from race pace sandwich long run", () => {
    const desc = `FUEL PER 10: 10g TOTAL: 75g

Warmup
- FUEL PER 10: 10g TOTAL: 75g 1km 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 4km 78-89% LTHR (132-150 bpm)
- 4km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    // midpoint(66,78)=72 → easy, midpoint(78,89)=83.5 → steady
    expect(zones).toEqual(["z2", "z3"]);
  });

  it("returns sorted zones low-to-high", () => {
    const desc = `Main set 5x
- 5m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    // midpoint(66,78)=72 → easy, midpoint(89,99)=94 → tempo
    expect(zones[0]).toBe("z2");
    expect(zones[1]).toBe("z4");
  });

  it("returns empty array for descriptions without HR zones", () => {
    expect(parseWorkoutZones("Just a note", DEFAULT_LTHR, testHrZones)).toEqual([]);
    expect(parseWorkoutZones("", DEFAULT_LTHR, testHrZones)).toEqual([]);
  });
});

describe("zone classification integration — real workout descriptions", () => {
  // Uses exact descriptions from CLAUDE.md Section 8.
  // Verifies both parseWorkoutStructure (per-step zones) and parseWorkoutZones (distinct zones)
  // produce correct labels matching the training plan's zone definitions.

  it("Short Intervals: warmup/recovery = Easy, work = Interval", () => {
    const desc = `Short, punchy efforts to build leg speed and running economy.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- Walk 2m 50-66% LTHR (85-112 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z2");       // warmup
    expect(structure[1].steps[0].zone).toBe("z4");       // interval work
    expect(structure[1].steps[1].zone).toBe("z1");        // walk recovery
    expect(structure[2].steps[0].zone).toBe("z2");        // cooldown

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2", "z4"]);
  });

  it("Hills: warmup/downhill = Easy, uphill = Hard", () => {
    const desc = `Hill reps build strength and power that translates directly to EcoTrail's terrain.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z2");
    expect(structure[1].steps[0].zone).toBe("z5");        // uphill
    expect(structure[1].steps[1].zone).toBe("z2");        // downhill
    expect(structure[2].steps[0].zone).toBe("z2");

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2", "z5"]);
  });

  it("Long Run — All Easy: every step = Easy", () => {
    const desc = `Long run at easy pace. This is the most important run of the week.

Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 6km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    for (const section of structure) {
      for (const step of section.steps) {
        expect(step.zone).toBe("z2");
      }
    }

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2"]);
  });

  it("Long Run — Race Pace Sandwich: easy sections = Easy, race pace block = Race Pace", () => {
    const desc = `Long run with a 3km race pace block sandwiched in the middle.

Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 3km 78-89% LTHR (132-150 bpm)
- 3km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z2");        // warmup
    expect(structure[1].steps[0].zone).toBe("z2");        // easy before RP
    expect(structure[1].steps[1].zone).toBe("z3");      // race pace
    expect(structure[1].steps[2].zone).toBe("z2");        // easy after RP
    expect(structure[2].steps[0].zone).toBe("z2");        // cooldown

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2", "z3"]);
  });

  it("Easy + Strides: main = Easy, strides = Hard, recovery = Easy", () => {
    const desc = `Easy run with strides at the end.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set
- 21m 66-78% LTHR (112-132 bpm)

Strides 4x
- 20s 99-111% LTHR (167-188 bpm)
- 1m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z2");        // warmup
    expect(structure[1].steps[0].zone).toBe("z2");        // main easy
    expect(structure[2].steps[0].zone).toBe("z5");        // stride burst
    expect(structure[2].steps[1].zone).toBe("z2");        // stride recovery
    expect(structure[3].steps[0].zone).toBe("z2");        // cooldown

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2", "z5"]);
  });

  it("Distance Intervals: warm/cool = Easy, fast reps = Interval, walk = Easy", () => {
    const desc = `Track-style reps for pacing practice.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 8x
- Fast 0.8km 89-99% LTHR (150-167 bpm)
- Walk 0.2km 50-66% LTHR (85-112 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z2");
    expect(structure[1].steps[0].zone).toBe("z4");       // fast reps
    expect(structure[1].steps[1].zone).toBe("z1");        // walk recovery
    expect(structure[2].steps[0].zone).toBe("z2");

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2", "z4"]);
  });

  it("Race Pace Intervals: warm/cool = Easy, reps = Race Pace, walk = Easy", () => {
    const desc = `Practice goal race pace in a structured session.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 5x
- 5m 78-89% LTHR (132-150 bpm)
- Walk 2m 50-66% LTHR (85-112 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z2");
    expect(structure[1].steps[0].zone).toBe("z3");      // race pace reps
    expect(structure[1].steps[1].zone).toBe("z1");        // walk recovery
    expect(structure[2].steps[0].zone).toBe("z2");

    const zones = parseWorkoutZones(desc, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual(["z2", "z3"]);
  });

  it("zone boundaries: 50-66% is easy (not sub-easy), 78-89% is steady (not easy or tempo)", () => {
    // Walk recovery at 50-66% should still classify as easy (midpoint 58%)
    // Race pace at 78-89% should classify as steady (midpoint 83.5%), not easy (max < 89) or tempo
    const desc = `Main set
- 5m 50-66% LTHR (85-112 bpm)
- 5m 78-89% LTHR (132-150 bpm)`;

    const structure = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(structure[0].steps[0].zone).toBe("z1");
    expect(structure[0].steps[1].zone).toBe("z3");
  });
});

describe("getEstimatedDuration", () => {
  it("estimates long run duration from km in name", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Long (8km)",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(48);
  });

  it("returns 45 for non-long workouts", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Short Intervals",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(45);
  });

  it("returns 45 for easy runs", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Easy",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(45);
  });
});

describe("parseWorkoutSegments", () => {
  it("parses a short intervals workout", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const segments = parseWorkoutSegments(desc);
    // Warmup (10m) + 6 * (2m + 2m) + Cooldown (5m)
    expect(segments.length).toBe(1 + 12 + 1);
    expect(segments[0].duration).toBe(10);
    expect(segments[0].intensity).toBe(72); // (66+78)/2
    expect(segments[segments.length - 1].duration).toBe(5);
  });

  it("parses a hills workout with Uphill/Downhill prefixes", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const segments = parseWorkoutSegments(desc);
    // Warmup (10m) + 6 * (2m uphill + 3m downhill) + Cooldown (5m)
    expect(segments.length).toBe(1 + 12 + 1);
    // Check uphill segment intensity
    expect(segments[1].intensity).toBe(105); // (99+111)/2
    expect(segments[1].duration).toBe(2);
  });

  it("parses a long run with race pace sandwich", () => {
    const desc = `FUEL PER 10: 10g TOTAL: 75g

Warmup
- FUEL PER 10: 10g TOTAL: 75g 1km 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 4km 78-89% LTHR (132-150 bpm)
- 4km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const segments = parseWorkoutSegments(desc);
    // Warmup (1km) + 3 main segments + Cooldown (1km)
    expect(segments.length).toBe(5);
    // Race pace segment should have higher intensity
    expect(segments[2].intensity).toBe(83.5); // (78+89)/2
    // Easy segments should have lower intensity
    expect(segments[1].intensity).toBe(72); // (66+78)/2
  });

  it("parses an easy + strides workout", () => {
    const desc = `FUEL PER 10: 8g TOTAL: 32g

Warmup
- FUEL PER 10: 8g TOTAL: 32g 10m 66-78% LTHR (112-132 bpm)

Main set
- 20m 66-78% LTHR (112-132 bpm)

Strides 4x
- 20s 99-111% LTHR (167-188 bpm)
- 1m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const segments = parseWorkoutSegments(desc);
    // Warmup (10m) + Main (20m) + 4 * (20s + 1m) + Cooldown (5m)
    expect(segments.length).toBe(1 + 1 + 8 + 1);
    // Stride work segment (20s = 0.333m)
    const strideWork = segments[2];
    expect(strideWork.duration).toBeCloseTo(1 / 3, 1);
    expect(strideWork.intensity).toBe(105);
  });

  it("returns empty array for description without structured workout", () => {
    expect(parseWorkoutSegments("Just a note")).toEqual([]);
    expect(parseWorkoutSegments("")).toEqual([]);
  });

  // --- SINGLE-STEP FORMAT ---

  it("parses single-step workout (no section headers)", () => {
    const desc = `Steady easy running to build your aerobic base.

- 35m 68-83% LTHR (115-140 bpm) intensity=active
`;

    const segments = parseWorkoutSegments(desc);
    expect(segments).toHaveLength(1);
    expect(segments[0].duration).toBe(35);
    expect(segments[0].intensity).toBe(75.5); // (68+83)/2
    expect(segments[0].estimated).toBe(false);
  });

  it("parses bonus run single-step workout", () => {
    const desc = `The Saturday bonus. Just a gift to future you.

- 45m 68-83% LTHR (115-140 bpm) intensity=active
`;

    const segments = parseWorkoutSegments(desc);
    expect(segments).toHaveLength(1);
    expect(segments[0].duration).toBe(45);
  });

  it("parses distance intervals with decimal km and step labels", () => {
    const desc = `Track-style reps.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 8x
- Fast 0.8km 89-99% LTHR (150-167 bpm)
- Walk 0.2km 50-66% LTHR (85-112 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const segments = parseWorkoutSegments(desc);
    // Warmup (10m) + 8 * (0.8km + 0.2km) + Cooldown (5m)
    expect(segments.length).toBe(1 + 16 + 1);
    // 0.8km at tempo pace (~4.89 min/km) ≈ 3.9m
    expect(segments[1].duration).toBeGreaterThan(3);
    expect(segments[1].duration).toBeLessThan(5);
    // 0.2km at easy pace (~7 min/km) ≈ 1.4m
    expect(segments[2].duration).toBeGreaterThan(1);
    expect(segments[2].duration).toBeLessThan(2);
  });
});

describe("estimateWorkoutDuration", () => {
  it("estimates total duration from a structured description", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDuration(desc);
    // 10 + 6*(2+2) + 5 = 39
    expect(result).toEqual({ minutes: 39, estimated: false });
  });

  it("returns null for unstructured descriptions", () => {
    expect(estimateWorkoutDuration("No workout here")).toBeNull();
  });

  it("marks duration as estimated when km-based steps are present", () => {
    const desc = `Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 6km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDuration(desc);
    expect(result).not.toBeNull();
    expect(result!.estimated).toBe(true);
  });

  it("marks duration as exact when all steps are time-based", () => {
    const desc = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set
- 20m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDuration(desc);
    expect(result).toEqual({ minutes: 35, estimated: false });
  });

  it("marks as estimated when mixing time and km steps", () => {
    const desc = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDuration(desc);
    expect(result).not.toBeNull();
    expect(result!.estimated).toBe(true);
    // 10 + (4 * 7.25) + 5 = 44
    expect(result!.minutes).toBe(44);
  });

  it("handles strides with seconds as exact", () => {
    const desc = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set
- 21m 66-78% LTHR (112-132 bpm)

Strides 4x
- 20s 99-111% LTHR (167-188 bpm)
- 1m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDuration(desc);
    expect(result).not.toBeNull();
    expect(result!.estimated).toBe(false);
    // 10 + 21 + 4*(20/60 + 1) + 5 ≈ 41.3 → 41
    expect(result!.minutes).toBe(41);
  });

  it("handles distance intervals (e.g. 800m) as estimated", () => {
    const desc = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 8x
- 0.8km 89-99% LTHR (150-167 bpm)
- 0.2km 50-66% LTHR (85-112 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDuration(desc);
    expect(result).not.toBeNull();
    expect(result!.estimated).toBe(true);
  });
});

describe("estimateWorkoutDescriptionDistance", () => {
  it("returns exact distance for all-km workouts (long run)", () => {
    const desc = `Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 6km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDescriptionDistance(desc);
    expect(result).toEqual({ km: 8, estimated: false });
  });

  it("returns estimated distance for all-time workouts (intervals)", () => {
    const desc = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDescriptionDistance(desc);
    expect(result).not.toBeNull();
    expect(result!.estimated).toBe(true);
    // Should be reasonable: ~5-6 km for a 39-min mixed interval workout
    expect(result!.km).toBeGreaterThan(4);
    expect(result!.km).toBeLessThan(8);
  });

  it("returns estimated distance when mixing km and time steps", () => {
    const desc = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set
- 3km 78-89% LTHR (132-150 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDescriptionDistance(desc);
    expect(result).not.toBeNull();
    expect(result!.estimated).toBe(true);
    // 10min/7.25 + 3km + 5min/7.25 ≈ 2.07 + 3 + 0.69 ≈ 5.1
    expect(result!.km).toBeGreaterThan(4.5);
    expect(result!.km).toBeLessThan(6);
  });

  it("returns exact distance for race pace sandwich (all km)", () => {
    const desc = `Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 3km 78-89% LTHR (132-150 bpm)
- 3km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const result = estimateWorkoutDescriptionDistance(desc);
    expect(result).toEqual({ km: 12, estimated: false });
  });

  it("returns null for unstructured descriptions", () => {
    expect(estimateWorkoutDescriptionDistance("No workout here")).toBeNull();
  });
});

describe("estimateWorkoutDistance", () => {
  it("returns actual distance in km for completed events", () => {
    const event: CalendarEvent = {
      id: "1",
      date: new Date(),
      name: "W03 Easy",
      description: "",
      type: "completed",
      category: "easy",
      distance: 5500,
      duration: 2200,
      avgHr: 125,
    };
    expect(estimateWorkoutDistance(event)).toBe(5.5);
  });

  it("extracts km from name for long runs", () => {
    const event: CalendarEvent = {
      id: "2",
      date: new Date(),
      name: "W05 Long (12km)",
      description: "",
      type: "planned",
      category: "long",
    };
    expect(estimateWorkoutDistance(event)).toBe(12);
  });

  it("estimates from workout duration for structured descriptions", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const event: CalendarEvent = {
      id: "3",
      date: new Date(),
      name: "W01 Short Intervals",
      description: desc,
      type: "planned",
      category: "interval",
    };
    // 39 min / 5.15 min/km (tempo pace for intervals) ≈ 7.6 km
    const result = estimateWorkoutDistance(event);
    expect(result).toBeGreaterThan(7);
    expect(result).toBeLessThan(8);
  });

  it("returns 0 for events with no data", () => {
    const event: CalendarEvent = {
      id: "4",
      date: new Date(),
      name: "W01 Easy",
      description: "No structured workout",
      type: "planned",
      category: "easy",
    };
    expect(estimateWorkoutDistance(event)).toBe(0);
  });
});

describe("parseWorkoutStructure", () => {
  it("parses a short intervals workout", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe("Warmup");
    expect(sections[0].steps).toHaveLength(1);
    expect(sections[0].steps[0].duration).toBe("10m");

    expect(sections[1].name).toBe("Main set");
    expect(sections[1].repeats).toBe(6);
    expect(sections[1].steps).toHaveLength(2);
    // midpoint(89,99)=94 → tempo, midpoint(66,78)=72 → easy
    expect(sections[1].steps[0].zone).toBe("z4");
    expect(sections[1].steps[1].zone).toBe("z2");

    expect(sections[2].name).toBe("Cooldown");
    expect(sections[2].steps[0].duration).toBe("5m");
  });

  it("parses a hills workout with Uphill/Downhill labels", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    const mainSet = sections[1];
    expect(mainSet.repeats).toBe(6);
    expect(mainSet.steps[0].label).toBe("Uphill");
    expect(mainSet.steps[0].duration).toBe("2m");
    expect(mainSet.steps[0].bpmRange).toBe("167-188 bpm");
    expect(mainSet.steps[1].label).toBe("Downhill");
  });

  it("parses a long run with km distances", () => {
    const desc = `FUEL PER 10: 10g TOTAL: 75g

Warmup
- FUEL PER 10: 10g TOTAL: 75g 10m 66-78% LTHR (112-132 bpm)

Main set
- 8km 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(sections[1].name).toBe("Main set");
    expect(sections[1].repeats).toBeUndefined();
    expect(sections[1].steps[0].duration).toBe("8km");
  });

  it("parses a race pace sandwich long run", () => {
    const desc = `FUEL PER 10: 10g TOTAL: 75g

Warmup
- FUEL PER 10: 10g TOTAL: 75g 10m 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 4km 78-89% LTHR (132-150 bpm)
- 4km 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    const mainSet = sections[1];
    expect(mainSet.steps).toHaveLength(3);
    // midpoint(66,78)=72 → easy, midpoint(78,89)=83.5 → steady, midpoint(66,78)=72 → easy
    expect(mainSet.steps[0].zone).toBe("z2");
    expect(mainSet.steps[1].zone).toBe("z3");
    expect(mainSet.steps[2].zone).toBe("z2");
  });

  it("parses an easy + strides workout", () => {
    const desc = `FUEL PER 10: 8g TOTAL: 32g

Warmup
- FUEL PER 10: 8g TOTAL: 32g 10m 66-78% LTHR (112-132 bpm)

Main set
- 20m 66-78% LTHR (112-132 bpm)

Strides 4x
- 20s 99-111% LTHR (167-188 bpm)
- 1m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(sections).toHaveLength(4);
    expect(sections[2].name).toBe("Strides");
    expect(sections[2].repeats).toBe(4);
    expect(sections[2].steps[0].duration).toBe("20s");
    expect(sections[2].steps[1].duration).toBe("1m");
  });

  it("returns empty array for non-standard descriptions", () => {
    expect(parseWorkoutStructure("Just a note", DEFAULT_LTHR, testHrZones)).toEqual([]);
    expect(parseWorkoutStructure("", DEFAULT_LTHR, testHrZones)).toEqual([]);
  });

  // --- SINGLE-STEP FORMAT ---

  it("parses single-step workout (no section headers)", () => {
    const desc = `Steady easy running to build your aerobic base.

- 35m 68-83% LTHR (115-140 bpm) intensity=active
`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Main set");
    expect(sections[0].steps).toHaveLength(1);
    expect(sections[0].steps[0].duration).toBe("35m");
    expect(sections[0].steps[0].zone).toBe("z2");
    expect(sections[0].steps[0].bpmRange).toBe("115-140 bpm");
  });

  it("parses single-step workout with bonus run notes", () => {
    const desc = `The Saturday bonus. Let's be honest — there's maybe a 20% chance this actually happens.

- 45m 68-83% LTHR (115-140 bpm) intensity=active
`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Main set");
    expect(sections[0].steps[0].duration).toBe("45m");
  });

  it("parses distance intervals with decimal km values", () => {
    const desc = `Track-style reps.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 8x
- Fast 0.8km 89-99% LTHR (150-167 bpm)
- Walk 0.2km 50-66% LTHR (85-112 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    expect(sections).toHaveLength(3);
    const mainSet = sections[1];
    expect(mainSet.name).toBe("Main set");
    expect(mainSet.repeats).toBe(8);
    expect(mainSet.steps).toHaveLength(2);
    expect(mainSet.steps[0].duration).toBe("0.8km");
    // midpoint(89,99)=94 → tempo
    expect(mainSet.steps[0].zone).toBe("z4");
    expect(mainSet.steps[1].duration).toBe("0.2km");
  });

  it("hides redundant step labels (Easy, Fast, Walk) but keeps Uphill/Downhill/Stride", () => {
    const desc = `Notes.

Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Easy 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc, DEFAULT_LTHR, testHrZones);
    const mainSet = sections[1];
    expect(mainSet.steps[0].label).toBe("Uphill");
    expect(mainSet.steps[1].label).toBeUndefined(); // "Easy" filtered out
  });
});

describe("extractNotes", () => {
  it("extracts notes from between strategy header and first section (old format)", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Short, punchy efforts to build leg speed and running economy.

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)`;

    expect(extractNotes(desc)).toBe(
      "Short, punchy efforts to build leg speed and running economy.",
    );
  });

  it("extracts notes from new format (no fuel header)", () => {
    const desc = `Short, punchy efforts to build leg speed and running economy.

Warmup
- 10m 66-78% LTHR (112-132 bpm)`;

    expect(extractNotes(desc)).toBe(
      "Short, punchy efforts to build leg speed and running economy.",
    );
  });

  it("returns null when no notes present (old format)", () => {
    const desc = `FUEL PER 10: 5g TOTAL: 25g

Warmup
- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)`;

    expect(extractNotes(desc)).toBeNull();
  });

  it("returns null for empty description", () => {
    expect(extractNotes("")).toBeNull();
  });

  it("returns null for description without sections", () => {
    expect(extractNotes("Just a note")).toBeNull();
  });

  // --- SINGLE-STEP FORMAT ---

  it("extracts notes from single-step workout", () => {
    const desc = `Steady easy running to build your aerobic base.

- 35m 68-83% LTHR (115-140 bpm) intensity=active
`;

    expect(extractNotes(desc)).toBe("Steady easy running to build your aerobic base.");
  });

  it("extracts multi-line notes from single-step workout", () => {
    const desc = `The Saturday bonus. Let's be honest — there's maybe a 20% chance this actually happens. If your legs say no, listen to them.

- 45m 68-83% LTHR (115-140 bpm) intensity=active
`;

    expect(extractNotes(desc)).toBe(
      "The Saturday bonus. Let's be honest — there's maybe a 20% chance this actually happens. If your legs say no, listen to them.",
    );
  });
});

describe("extractStructure", () => {
  it("extracts structure from structured workout", () => {
    const desc = `Notes here.

Warmup
- 10m 68-83% LTHR (115-140 bpm)

Main set
- 30m 68-83% LTHR (115-140 bpm)

Cooldown
- 5m 68-83% LTHR (115-140 bpm)`;

    const structure = extractStructure(desc);
    expect(structure).toContain("Warmup");
    expect(structure).toContain("Main set");
    expect(structure).toContain("Cooldown");
    expect(structure).not.toContain("Notes here");
  });

  it("extracts structure from single-step workout", () => {
    const desc = `Steady easy running to build your aerobic base.

- 35m 68-83% LTHR (115-140 bpm) intensity=active
`;

    const structure = extractStructure(desc);
    expect(structure).toBe("- 35m 68-83% LTHR (115-140 bpm) intensity=active");
  });

  it("returns empty string for description without structure", () => {
    expect(extractStructure("Just a note")).toBe("");
    expect(extractStructure("")).toBe("");
  });
});

// --- CALIBRATED PACE TABLE INTEGRATION ---

// A fast runner's calibrated pace table
const FAST_TABLE: PaceTable = {
  z1: null,
  z2: { zone: "z2", avgPace: 6.0, sampleCount: 10 },
  z3: { zone: "z3", avgPace: 5.0, sampleCount: 8 },
  z4: { zone: "z4", avgPace: 4.5, sampleCount: 5 },
  z5: { zone: "z5", avgPace: 4.0, sampleCount: 0 },
};

// A slow runner's calibrated pace table
const SLOW_TABLE: PaceTable = {
  z1: null,
  z2: { zone: "z2", avgPace: 8.0, sampleCount: 10 },
  z3: { zone: "z3", avgPace: 7.0, sampleCount: 8 },
  z4: { zone: "z4", avgPace: 6.0, sampleCount: 5 },
  z5: { zone: "z5", avgPace: 5.5, sampleCount: 0 },
};

// Workout with km-based steps — duration depends on pace
const KM_WORKOUT = `Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 4km 78-89% LTHR (132-150 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

// Workout with time-based steps — duration does NOT depend on pace
const TIME_WORKOUT = `Warmup
- 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

describe("parseWorkoutSegments with paceTable", () => {
  it("uses calibrated paces for km-based steps", () => {
    const fast = parseWorkoutSegments(KM_WORKOUT, FAST_TABLE);
    const slow = parseWorkoutSegments(KM_WORKOUT, SLOW_TABLE);

    // Same 4km main set — fast runner should have shorter duration
    expect(fast[1].duration).toBeLessThan(slow[1].duration);
    // Fast: 4km * 5.0 min/km = 20 min
    expect(fast[1].duration).toBeCloseTo(20, 0);
    // Slow: 4km * 7.0 min/km = 28 min
    expect(slow[1].duration).toBeCloseTo(28, 0);
  });

  it("time-based steps are identical regardless of paceTable", () => {
    const fast = parseWorkoutSegments(TIME_WORKOUT, FAST_TABLE);
    const slow = parseWorkoutSegments(TIME_WORKOUT, SLOW_TABLE);
    const none = parseWorkoutSegments(TIME_WORKOUT);

    // All should have identical durations
    expect(fast.length).toBe(none.length);
    for (let i = 0; i < fast.length; i++) {
      expect(fast[i].duration).toBe(slow[i].duration);
      expect(fast[i].duration).toBe(none[i].duration);
    }
  });

  it("falls back to FALLBACK_PACE_TABLE when no paceTable provided", () => {
    const withTable = parseWorkoutSegments(KM_WORKOUT, FAST_TABLE);
    const noTable = parseWorkoutSegments(KM_WORKOUT);

    // Main set 4km at steady: fast table uses 5.0, FALLBACK uses 5.67
    expect(withTable[1].duration).toBeCloseTo(4 * 5.0, 0);
    expect(noTable[1].duration).toBeCloseTo(4 * FALLBACK_PACE_TABLE.z3!.avgPace, 0);
  });
});

describe("estimateWorkoutDuration with paceTable", () => {
  it("produces different durations for different pace tables on km workouts", () => {
    const fast = estimateWorkoutDuration(KM_WORKOUT, FAST_TABLE);
    const slow = estimateWorkoutDuration(KM_WORKOUT, SLOW_TABLE);

    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(fast!.minutes).toBeLessThan(slow!.minutes);
  });

  it("produces identical durations for time-based workouts regardless of pace table", () => {
    const fast = estimateWorkoutDuration(TIME_WORKOUT, FAST_TABLE);
    const none = estimateWorkoutDuration(TIME_WORKOUT);

    expect(fast).not.toBeNull();
    expect(none).not.toBeNull();
    expect(fast!.minutes).toBe(none!.minutes);
  });
});

describe("estimateWorkoutDescriptionDistance with paceTable", () => {
  it("produces different distances for time-based workouts with different paces", () => {
    const fast = estimateWorkoutDescriptionDistance(TIME_WORKOUT, FAST_TABLE);
    const slow = estimateWorkoutDescriptionDistance(TIME_WORKOUT, SLOW_TABLE);

    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    // Faster pace → more distance in same time
    expect(fast!.km).toBeGreaterThan(slow!.km);
  });

  it("produces identical km for all-km workouts regardless of pace table", () => {
    const fast = estimateWorkoutDescriptionDistance(KM_WORKOUT, FAST_TABLE);
    const slow = estimateWorkoutDescriptionDistance(KM_WORKOUT, SLOW_TABLE);

    expect(fast).not.toBeNull();
    expect(slow).not.toBeNull();
    expect(fast!.km).toBe(slow!.km);
    expect(fast!.km).toBe(6); // 1 + 4 + 1
    expect(fast!.estimated).toBe(false);
  });
});

describe("estimateWorkoutDistance with paceTable", () => {
  it("uses actual distance when available (ignores pace table)", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "Easy", description: "",
      type: "completed", category: "easy", distance: 5500, duration: 2200,
    };
    expect(estimateWorkoutDistance(event, FAST_TABLE)).toBe(5.5);
    expect(estimateWorkoutDistance(event, SLOW_TABLE)).toBe(5.5);
  });

  it("uses calibrated pace for time-based planned events", () => {
    const event: CalendarEvent = {
      id: "2", date: new Date(), name: "W01 Short Intervals",
      description: TIME_WORKOUT, type: "planned", category: "interval",
    };
    const fast = estimateWorkoutDistance(event, FAST_TABLE);
    const slow = estimateWorkoutDistance(event, SLOW_TABLE);
    // Same 39 min workout — faster pace → more km
    expect(fast).toBeGreaterThan(slow);
  });

  it("falls back to FALLBACK_PACE_TABLE without pace table", () => {
    const event: CalendarEvent = {
      id: "3", date: new Date(), name: "W01 Easy",
      description: TIME_WORKOUT, type: "planned", category: "easy",
    };
    const withTable = estimateWorkoutDistance(event, FAST_TABLE);
    const noTable = estimateWorkoutDistance(event);
    // Should differ because FAST_TABLE differs from FALLBACK_PACE_TABLE
    expect(withTable).not.toBe(noTable);
  });
});

describe("estimatePlanEventDistance", () => {
  it("extracts km from event name", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(), name: "W05 Long (12km)",
      description: "", external_id: "test", type: "Run",
    };
    expect(estimatePlanEventDistance(event)).toBe(12);
    expect(estimatePlanEventDistance(event, FAST_TABLE)).toBe(12);
  });

  it("estimates from description with calibrated paces", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(), name: "W01 Short Intervals",
      description: TIME_WORKOUT, external_id: "test", type: "Run",
    };
    const fast = estimatePlanEventDistance(event, FAST_TABLE);
    const slow = estimatePlanEventDistance(event, SLOW_TABLE);
    const none = estimatePlanEventDistance(event);

    // Faster pace → more km in same time
    expect(fast).toBeGreaterThan(slow);
    // Without table → uses FALLBACK_PACE_TABLE
    expect(none).toBeGreaterThan(0);
  });

  it("returns 0 for events with no km and no description", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(), name: "W01 Easy",
      description: "Just a note", external_id: "test", type: "Run",
    };
    expect(estimatePlanEventDistance(event)).toBe(0);
  });
});

describe("totalCarbs recomputation with calibrated paces", () => {
  it("produces different fuel totals for different pace tables", () => {
    const fuelRate = 60; // 60 g/h
    const fastDuration = estimateWorkoutDuration(KM_WORKOUT, FAST_TABLE)!;
    const slowDuration = estimateWorkoutDuration(KM_WORKOUT, SLOW_TABLE)!;

    const fastCarbs = calculateWorkoutCarbs(fastDuration.minutes, fuelRate);
    const slowCarbs = calculateWorkoutCarbs(slowDuration.minutes, fuelRate);

    // Slower runner takes longer → needs more carbs
    expect(slowCarbs).toBeGreaterThan(fastCarbs);
  });

  it("time-based workouts produce identical fuel regardless of pace table", () => {
    const fuelRate = 60;
    const fastDuration = estimateWorkoutDuration(TIME_WORKOUT, FAST_TABLE)!;
    const noneDuration = estimateWorkoutDuration(TIME_WORKOUT)!;

    expect(calculateWorkoutCarbs(fastDuration.minutes, fuelRate))
      .toBe(calculateWorkoutCarbs(noneDuration.minutes, fuelRate));
  });
});

// --- ABSOLUTE PACE FORMAT TESTS ---

const ABS_PACE_WORKOUT = `Race pace practice.

Warmup
- Warmup 10m 6:15-7:52/km Pace intensity=warmup

Main set 5x
- Race Pace 5m 5:24-5:33/km Pace intensity=active
- Walk 2m intensity=rest

Cooldown
- Cooldown 5m 6:15-7:52/km Pace intensity=cooldown
`;

const ABS_PACE_THRESHOLD = 5.5; // 5:30/km

describe("parseWorkoutZones — absolute pace format", () => {
  it("extracts zones from absolute pace format with threshold", () => {
    const zones = parseWorkoutZones(ABS_PACE_WORKOUT, DEFAULT_LTHR, testHrZones, ABS_PACE_THRESHOLD);
    expect(zones).toContain("z2");
    expect(zones).toContain("z3");
  });

  it("returns empty when threshold is missing for absolute pace", () => {
    const zones = parseWorkoutZones(ABS_PACE_WORKOUT, DEFAULT_LTHR, testHrZones);
    expect(zones).toEqual([]);
  });
});

describe("parseWorkoutStructure — absolute pace format", () => {
  it("parses absolute pace steps with zone classification", () => {
    const sections = parseWorkoutStructure(ABS_PACE_WORKOUT, DEFAULT_LTHR, testHrZones, ABS_PACE_THRESHOLD);
    expect(sections).toHaveLength(3);

    expect(sections[0].name).toBe("Warmup");
    expect(sections[0].steps[0].duration).toBe("10m");
    expect(sections[0].steps[0].bpmRange).toBe("6:15-7:52 /km");
    expect(sections[0].steps[0].zone).toBe("z2");

    expect(sections[1].name).toBe("Main set");
    expect(sections[1].repeats).toBe(5);
    expect(sections[1].steps[0].bpmRange).toBe("5:24-5:33 /km");
    expect(sections[1].steps[0].zone).toBe("z3");

    expect(sections[1].steps[1].zone).toBe("z1");
    expect(sections[1].steps[1].bpmRange).toBe("");
  });

  it("falls back to z2 classification when racePacePerKm is missing", () => {
    const sections = parseWorkoutStructure(ABS_PACE_WORKOUT, DEFAULT_LTHR, testHrZones);
    expect(sections).toHaveLength(3);
    expect(sections[0].steps[0].zone).toBe("z2");
  });
});

describe("parseWorkoutSegments — absolute pace format", () => {
  it("estimates duration from absolute pace for km-based steps", () => {
    const desc = `Warmup
- 1km 6:15-7:52/km Pace intensity=warmup

Main set
- 4km 5:24-5:33/km Pace intensity=active

Cooldown
- 2km 6:15-7:52/km Pace intensity=cooldown
`;
    const segments = parseWorkoutSegments(desc);
    expect(segments).toHaveLength(3);

    // 1km at avg pace ~7.06 min/km → ~7.06 min
    expect(segments[0].duration).toBeCloseTo(7.06, 0);
    expect(segments[0].estimated).toBe(true);
    expect(segments[0].km).toBe(1);

    // 4km at avg pace ~5.475 min/km → ~21.9 min
    expect(segments[1].duration).toBeCloseTo(21.9, 0);
    expect(segments[1].km).toBe(4);

    // 2km at avg pace ~7.06 min/km → ~14.1 min
    expect(segments[2].duration).toBeCloseTo(14.1, 0);
  });

  it("handles time-based absolute pace steps", () => {
    const desc = `- 10m 6:15-7:52/km Pace intensity=warmup
`;
    const segments = parseWorkoutSegments(desc);
    expect(segments).toHaveLength(1);
    expect(segments[0].duration).toBe(10);
    expect(segments[0].estimated).toBe(false);
    expect(segments[0].km).toBeNull();
  });

  it("computes real intensity from threshold when provided", () => {
    const desc = `- 10m 5:24-5:33/km Pace intensity=active
`;
    const segments = parseWorkoutSegments(desc, undefined, ABS_PACE_THRESHOLD);
    expect(segments).toHaveLength(1);
    // avg pace ~5.475 min/km, threshold 5.5 → pct ~100.5
    expect(segments[0].intensity).toBeCloseTo(100.5, 0);
  });

  it("falls back to 85 intensity without threshold", () => {
    const desc = `- 10m 5:24-5:33/km Pace intensity=active
`;
    const segments = parseWorkoutSegments(desc);
    expect(segments[0].intensity).toBe(85);
  });
});

describe("extractStepTotals — absolute pace format", () => {
  it("counts named steps in repeat sections", () => {
    const desc = `Main set 6x
- Downhill 3m 6:15-7:52/km Pace intensity=rest
`;
    const totals = extractStepTotals(desc);
    expect(totals).toEqual({ DOWNHILL: 6 });
  });

  it("returns empty for non-repeat sections", () => {
    const desc = `Main set
- 20m 6:15-7:52/km Pace intensity=active
`;
    expect(extractStepTotals(desc)).toEqual({});
  });
});

describe("parseWorkoutStructure — free format", () => {
  it("renders a no-pace step with the Free label and no pace text", () => {
    const desc = `Club run — pace and route follow the club. Workout varies week to week.

- Free 60m intensity=active
`;
    const sections = parseWorkoutStructure(desc);
    expect(sections).toHaveLength(1);
    expect(sections[0].steps).toHaveLength(1);
    const step = sections[0].steps[0];
    expect(step.label).toBe("Free");
    expect(step.duration).toBe("60m");
    expect(step.bpmRange).toBe("");
  });
});

describe("parseWorkoutSegments — wide easy zone duration estimate", () => {
  // Regression: wide z2 range (30-88% — allows walking) used to produce a
  // duration estimate of ~12-13 min/km because we averaged the literal pace
  // bounds, including the walking-pace lower bound. With a known threshold
  // the estimate now uses the user's typical zone pace via paceForIntensity.
  it("uses zone-typical pace, not the literal walking-pace midpoint, when threshold is known", () => {
    const desc = `- 8km 6:27-18:54/km Pace intensity=active
`;
    const segments = parseWorkoutSegments(desc, undefined, 5.5);
    expect(segments).toHaveLength(1);
    // intensity = 5.5 / 12.675 * 100 ≈ 43% → fallback z2 = 7.25 min/km
    // 8km × 7.25 ≈ 58 min — sane for an 8km easy run.
    expect(segments[0].duration).toBeCloseTo(58, 0);
  });
});

describe("parseWorkoutSegments — no-pace step (free format)", () => {
  it("parses literal duration with no pace target", () => {
    const segments = parseWorkoutSegments(`- Free 60m intensity=active`);
    expect(segments).toHaveLength(1);
    expect(segments[0].duration).toBe(60);
    expect(segments[0].km).toBeNull();
    expect(segments[0].noPace).toBe(true);
    expect(segments[0].estimated).toBe(false);
  });

  it("parses seconds unit", () => {
    const segments = parseWorkoutSegments(`- Free 90s intensity=active`);
    expect(segments).toHaveLength(1);
    expect(segments[0].duration).toBe(1.5);
    expect(segments[0].noPace).toBe(true);
  });

  it("does not false-match a pace-spec step as no-pace", () => {
    // The "60m" inside a paced step must be claimed by absPacePattern, not noPace.
    const segments = parseWorkoutSegments(
      `- Easy 60m 6:27-18:54/km Pace intensity=active`,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].noPace).toBeUndefined();
    expect(segments[0].duration).toBe(60); // m unit, literal
  });
});

describe("estimateWorkoutDescriptionDistance — no-pace segments", () => {
  it("returns null when all segments are no-pace (distance unknowable)", () => {
    const desc = `- Free 60m intensity=active
`;
    const dist = estimateWorkoutDescriptionDistance(desc);
    expect(dist).toBeNull();
  });
});
