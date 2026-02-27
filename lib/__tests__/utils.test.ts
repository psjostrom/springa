import { describe, it, expect } from "vitest";
import {
  parseWorkoutZones,
  parseWorkoutSegments,
  extractFuelStatus,
  extractNotes,
  parseWorkoutStructure,
} from "../descriptionParser";
import { formatPace, getPaceForZone, getZoneLabel } from "../format";
import {
  getEstimatedDuration,
  estimateWorkoutDuration,
  estimateWorkoutDistance,
  estimateWorkoutDescriptionDistance,
  estimatePlanEventDistance,
  calculateWorkoutCarbs,
} from "../workoutMath";
import { FALLBACK_PACE_TABLE } from "../constants";
import type { PaceTable, CalendarEvent, WorkoutEvent } from "../types";

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

describe("getPaceForZone", () => {
  it("returns entry from table when present", () => {
    const table: PaceTable = {
      easy: { zone: "easy", avgPace: 7.0, sampleCount: 5, avgHr: 125 },
      steady: null,
      tempo: null,
      hard: null,
    };
    const result = getPaceForZone(table, "easy");
    expect(result.avgPace).toBe(7.0);
    expect(result.sampleCount).toBe(5);
    expect(result.avgHr).toBe(125);
  });

  it("falls back to FALLBACK_PACE_TABLE when entry is null", () => {
    const table: PaceTable = {
      easy: null,
      steady: null,
      tempo: null,
      hard: null,
    };
    const result = getPaceForZone(table, "easy");
    expect(result.avgPace).toBe(FALLBACK_PACE_TABLE.easy!.avgPace);
    expect(result.sampleCount).toBe(0);
  });

  it("returns correct fallback for each zone", () => {
    const emptyTable: PaceTable = {
      easy: null,
      steady: null,
      tempo: null,
      hard: null,
    };
    expect(getPaceForZone(emptyTable, "steady").avgPace).toBe(5.67);
    expect(getPaceForZone(emptyTable, "tempo").avgPace).toBe(5.21);
    expect(getPaceForZone(emptyTable, "hard").avgPace).toBe(4.75);
  });
});

describe("getZoneLabel", () => {
  it("maps zone names to display labels", () => {
    expect(getZoneLabel("easy")).toBe("Easy");
    expect(getZoneLabel("steady")).toBe("Race Pace");
    expect(getZoneLabel("tempo")).toBe("Interval");
    expect(getZoneLabel("hard")).toBe("Hard");
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

    const zones = parseWorkoutZones(desc);
    // midpoint(66,78)=72 → easy, midpoint(89,99)=94 → tempo
    expect(zones).toEqual(["easy", "tempo"]);
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

    const zones = parseWorkoutZones(desc);
    // midpoint(66,78)=72 → easy, midpoint(99,111)=105 → hard
    expect(zones).toEqual(["easy", "hard"]);
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

    const zones = parseWorkoutZones(desc);
    // midpoint(66,78)=72 → easy, midpoint(78,89)=83.5 → steady
    expect(zones).toEqual(["easy", "steady"]);
  });

  it("returns sorted zones low-to-high", () => {
    const desc = `Main set 5x
- 5m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc);
    // midpoint(66,78)=72 → easy, midpoint(89,99)=94 → tempo
    expect(zones[0]).toBe("easy");
    expect(zones[1]).toBe("tempo");
  });

  it("returns empty array for descriptions without HR zones", () => {
    expect(parseWorkoutZones("Just a note")).toEqual([]);
    expect(parseWorkoutZones("")).toEqual([]);
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

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");       // warmup
    expect(structure[1].steps[0].zone).toBe("tempo");       // interval work
    expect(structure[1].steps[1].zone).toBe("easy");        // walk recovery
    expect(structure[2].steps[0].zone).toBe("easy");        // cooldown

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "tempo"]);
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

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");
    expect(structure[1].steps[0].zone).toBe("hard");        // uphill
    expect(structure[1].steps[1].zone).toBe("easy");        // downhill
    expect(structure[2].steps[0].zone).toBe("easy");

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "hard"]);
  });

  it("Long Run — All Easy: every step = Easy", () => {
    const desc = `Long run at easy pace. This is the most important run of the week.

Warmup
- 1km 66-78% LTHR (112-132 bpm)

Main set
- 6km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const structure = parseWorkoutStructure(desc);
    for (const section of structure) {
      for (const step of section.steps) {
        expect(step.zone).toBe("easy");
      }
    }

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy"]);
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

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");        // warmup
    expect(structure[1].steps[0].zone).toBe("easy");        // easy before RP
    expect(structure[1].steps[1].zone).toBe("steady");      // race pace
    expect(structure[1].steps[2].zone).toBe("easy");        // easy after RP
    expect(structure[2].steps[0].zone).toBe("easy");        // cooldown

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "steady"]);
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

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");        // warmup
    expect(structure[1].steps[0].zone).toBe("easy");        // main easy
    expect(structure[2].steps[0].zone).toBe("hard");        // stride burst
    expect(structure[2].steps[1].zone).toBe("easy");        // stride recovery
    expect(structure[3].steps[0].zone).toBe("easy");        // cooldown

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "hard"]);
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

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");
    expect(structure[1].steps[0].zone).toBe("tempo");       // fast reps
    expect(structure[1].steps[1].zone).toBe("easy");        // walk recovery
    expect(structure[2].steps[0].zone).toBe("easy");

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "tempo"]);
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

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");
    expect(structure[1].steps[0].zone).toBe("steady");      // race pace reps
    expect(structure[1].steps[1].zone).toBe("easy");        // walk recovery
    expect(structure[2].steps[0].zone).toBe("easy");

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "steady"]);
  });

  it("zone boundaries: 50-66% is easy (not sub-easy), 78-89% is steady (not easy or tempo)", () => {
    // Walk recovery at 50-66% should still classify as easy (midpoint 58%)
    // Race pace at 78-89% should classify as steady (midpoint 83.5%), not easy (max < 89) or tempo
    const desc = `Main set
- 5m 50-66% LTHR (85-112 bpm)
- 5m 78-89% LTHR (132-150 bpm)`;

    const structure = parseWorkoutStructure(desc);
    expect(structure[0].steps[0].zone).toBe("easy");
    expect(structure[0].steps[1].zone).toBe("steady");
  });
});

describe("getEstimatedDuration", () => {
  it("estimates long run duration from km in name", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Long (8km) eco16",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(48);
  });

  it("returns 45 for non-long workouts", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Short Intervals eco16",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(45);
  });

  it("returns 45 for easy runs", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Easy eco16",
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
      name: "W03 Easy eco16",
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
      name: "W05 Long (12km) eco16",
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
      name: "W01 Short Intervals eco16",
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
      name: "W01 Easy eco16",
      description: "No structured workout",
      type: "planned",
      category: "easy",
    };
    expect(estimateWorkoutDistance(event)).toBe(0);
  });
});

describe("extractFuelStatus", () => {
  it("extracts fuel rate and total carbs", () => {
    const desc =
      "FUEL PER 10: 5g TOTAL: 25g\n\nWarmup\n- FUEL PER 10: 5g TOTAL: 25g 10m 66-78% LTHR (112-132 bpm)";
    const result = extractFuelStatus(desc);
    expect(result.fuelRate).toBe(30); // 5g/10min × 6 = 30g/h
    expect(result.totalCarbs).toBe(25);
  });

  it("extracts moderate fuel rate", () => {
    const desc =
      "FUEL PER 10: 8g TOTAL: 32g\n\nWarmup\n- FUEL PER 10: 8g TOTAL: 32g 10m 66-78% LTHR (112-132 bpm)";
    const result = extractFuelStatus(desc);
    expect(result.fuelRate).toBe(48); // 8g/10min × 6 = 48g/h
    expect(result.totalCarbs).toBe(32);
  });

  it("extracts high fuel rate", () => {
    const desc =
      "FUEL PER 10: 10g TOTAL: 75g\n\nWarmup\n- FUEL PER 10: 10g TOTAL: 75g 10m 66-78% LTHR (112-132 bpm)";
    const result = extractFuelStatus(desc);
    expect(result.fuelRate).toBe(60); // 10g/10min × 6 = 60g/h
    expect(result.totalCarbs).toBe(75);
  });

  it("returns null for non-standard description", () => {
    const result = extractFuelStatus("Just a regular note");
    expect(result.fuelRate).toBeNull();
    expect(result.totalCarbs).toBeNull();
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

    const sections = parseWorkoutStructure(desc);
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe("Warmup");
    expect(sections[0].steps).toHaveLength(1);
    expect(sections[0].steps[0].duration).toBe("10m");

    expect(sections[1].name).toBe("Main set");
    expect(sections[1].repeats).toBe(6);
    expect(sections[1].steps).toHaveLength(2);
    // midpoint(89,99)=94 → tempo, midpoint(66,78)=72 → easy
    expect(sections[1].steps[0].zone).toBe("tempo");
    expect(sections[1].steps[1].zone).toBe("easy");

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

    const sections = parseWorkoutStructure(desc);
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

    const sections = parseWorkoutStructure(desc);
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

    const sections = parseWorkoutStructure(desc);
    const mainSet = sections[1];
    expect(mainSet.steps).toHaveLength(3);
    // midpoint(66,78)=72 → easy, midpoint(78,89)=83.5 → steady, midpoint(66,78)=72 → easy
    expect(mainSet.steps[0].zone).toBe("easy");
    expect(mainSet.steps[1].zone).toBe("steady");
    expect(mainSet.steps[2].zone).toBe("easy");
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

    const sections = parseWorkoutStructure(desc);
    expect(sections).toHaveLength(4);
    expect(sections[2].name).toBe("Strides");
    expect(sections[2].repeats).toBe(4);
    expect(sections[2].steps[0].duration).toBe("20s");
    expect(sections[2].steps[1].duration).toBe("1m");
  });

  it("returns empty array for non-standard descriptions", () => {
    expect(parseWorkoutStructure("Just a note")).toEqual([]);
    expect(parseWorkoutStructure("")).toEqual([]);
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

    const sections = parseWorkoutStructure(desc);
    expect(sections).toHaveLength(3);
    const mainSet = sections[1];
    expect(mainSet.name).toBe("Main set");
    expect(mainSet.repeats).toBe(8);
    expect(mainSet.steps).toHaveLength(2);
    expect(mainSet.steps[0].duration).toBe("0.8km");
    // midpoint(89,99)=94 → tempo
    expect(mainSet.steps[0].zone).toBe("tempo");
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

    const sections = parseWorkoutStructure(desc);
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
});

// --- CALIBRATED PACE TABLE INTEGRATION ---

// A fast runner's calibrated pace table
const FAST_TABLE: PaceTable = {
  easy: { zone: "easy", avgPace: 6.0, sampleCount: 10 },
  steady: { zone: "steady", avgPace: 5.0, sampleCount: 8 },
  tempo: { zone: "tempo", avgPace: 4.5, sampleCount: 5 },
  hard: { zone: "hard", avgPace: 4.0, sampleCount: 0 },
};

// A slow runner's calibrated pace table
const SLOW_TABLE: PaceTable = {
  easy: { zone: "easy", avgPace: 8.0, sampleCount: 10 },
  steady: { zone: "steady", avgPace: 7.0, sampleCount: 8 },
  tempo: { zone: "tempo", avgPace: 6.0, sampleCount: 5 },
  hard: { zone: "hard", avgPace: 5.5, sampleCount: 0 },
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
    expect(noTable[1].duration).toBeCloseTo(4 * FALLBACK_PACE_TABLE.steady!.avgPace, 0);
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
      id: "2", date: new Date(), name: "W01 Short Intervals eco16",
      description: TIME_WORKOUT, type: "planned", category: "interval",
    };
    const fast = estimateWorkoutDistance(event, FAST_TABLE);
    const slow = estimateWorkoutDistance(event, SLOW_TABLE);
    // Same 39 min workout — faster pace → more km
    expect(fast).toBeGreaterThan(slow);
  });

  it("falls back to FALLBACK_PACE_TABLE without pace table", () => {
    const event: CalendarEvent = {
      id: "3", date: new Date(), name: "W01 Easy eco16",
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
      start_date_local: new Date(), name: "W05 Long (12km) eco16",
      description: "", external_id: "test", type: "Run",
    };
    expect(estimatePlanEventDistance(event)).toBe(12);
    expect(estimatePlanEventDistance(event, FAST_TABLE)).toBe(12);
  });

  it("estimates from description with calibrated paces", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(), name: "W01 Short Intervals eco16",
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
      start_date_local: new Date(), name: "W01 Easy eco16",
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
