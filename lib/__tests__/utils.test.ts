import { describe, it, expect } from "vitest";
import {
  formatPace,
  getPaceForZone,
  getZoneLabel,
  parseWorkoutZones,
  getEstimatedDuration,
  buildEasyPaceFromHistory,
  parseWorkoutSegments,
  estimateWorkoutDuration,
  estimateWorkoutDistance,
  extractPumpStatus,
  extractNotes,
  parseWorkoutStructure,
} from "../utils";
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
    const table: PaceTable = { easy: null, steady: null, tempo: null, hard: null };
    const result = getPaceForZone(table, "easy");
    expect(result.avgPace).toBe(FALLBACK_PACE_TABLE.easy!.avgPace);
    expect(result.sampleCount).toBe(0);
  });

  it("returns correct fallback for each zone", () => {
    const emptyTable: PaceTable = { easy: null, steady: null, tempo: null, hard: null };
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
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "tempo"]);
  });

  it("extracts HR zones from a hills description", () => {
    const desc = `Warmup
- PUMP OFF 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- Uphill 2m 99-111% LTHR (167-188 bpm)
- Downhill 3m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "hard"]);
  });

  it("extracts all zones from race pace sandwich long run", () => {
    const desc = `Warmup
- PUMP OFF 1km 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 4km 78-89% LTHR (132-150 bpm)
- 4km 66-78% LTHR (112-132 bpm)

Cooldown
- 1km 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc);
    expect(zones).toEqual(["easy", "steady"]);
  });

  it("returns sorted zones low-to-high", () => {
    const desc = `Main set 5x
- 5m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const zones = parseWorkoutZones(desc);
    expect(zones[0]).toBe("easy");
    expect(zones[1]).toBe("tempo");
  });

  it("returns empty array for descriptions without HR zones", () => {
    expect(parseWorkoutZones("Just a note")).toEqual([]);
    expect(parseWorkoutZones("")).toEqual([]);
  });
});

describe("getEstimatedDuration", () => {
  it("estimates long run duration from km in name", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Sun Long (8km) eco16",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(48);
  });

  it("returns 45 for non-long workouts", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Tue Short Intervals eco16",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(45);
  });

  it("returns 45 for easy runs", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date(),
      name: "W01 Thu Easy eco16",
      description: "",
      external_id: "test",
      type: "Run",
    };
    expect(getEstimatedDuration(event)).toBe(45);
  });
});

describe("buildEasyPaceFromHistory", () => {
  it("calculates average pace from completed easy/long runs", () => {
    const events: CalendarEvent[] = [
      {
        id: "1", date: new Date(), name: "Easy Run", description: "",
        type: "completed", category: "easy", distance: 5000, duration: 2025, avgHr: 125,
      },
      {
        id: "2", date: new Date(), name: "Long Run", description: "",
        type: "completed", category: "long", distance: 8000, duration: 3360, avgHr: 128,
      },
    ];

    const result = buildEasyPaceFromHistory(events);
    expect(result).not.toBeNull();
    expect(result!.zone).toBe("easy");
    expect(result!.sampleCount).toBe(2);
    expect(result!.avgPace).toBeCloseTo(6.875, 1);
    expect(result!.avgHr).toBe(127);
  });

  it("excludes strides runs", () => {
    const events: CalendarEvent[] = [
      {
        id: "1", date: new Date(), name: "Easy + Strides", description: "",
        type: "completed", category: "easy", distance: 5000, duration: 2025, avgHr: 125,
      },
    ];
    expect(buildEasyPaceFromHistory(events)).toBeNull();
  });

  it("returns null when no matching runs", () => {
    const events: CalendarEvent[] = [
      {
        id: "1", date: new Date(), name: "Intervals", description: "",
        type: "completed", category: "interval", distance: 5000, duration: 1500, avgHr: 160,
      },
    ];
    expect(buildEasyPaceFromHistory(events)).toBeNull();
  });

  it("excludes planned events", () => {
    const events: CalendarEvent[] = [
      {
        id: "1", date: new Date(), name: "Easy Run", description: "",
        type: "planned", category: "easy", distance: 5000, duration: 2025, avgHr: 125,
      },
    ];
    expect(buildEasyPaceFromHistory(events)).toBeNull();
  });

  it("filters out unrealistic paces", () => {
    const events: CalendarEvent[] = [
      {
        id: "1", date: new Date(), name: "Easy Run", description: "",
        type: "completed", category: "easy", distance: 100, duration: 60, avgHr: 120,
      },
    ];
    expect(buildEasyPaceFromHistory(events)).toBeNull();
  });
});

describe("parseWorkoutSegments", () => {
  it("parses a short intervals workout", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

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
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

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
    const desc = `PUMP OFF - FUEL PER 10: 10g TOTAL: 75g

Warmup
- PUMP OFF - FUEL PER 10: 10g 1km 66-78% LTHR (112-132 bpm)

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
    const desc = `PUMP ON (EASE OFF) - FUEL PER 10: 8g TOTAL: 32g

Warmup
- PUMP ON (EASE OFF) - FUEL PER 10: 8g 10m 66-78% LTHR (112-132 bpm)

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
});

describe("estimateWorkoutDuration", () => {
  it("estimates total duration from a structured description", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const duration = estimateWorkoutDuration(desc);
    // 10 + 6*(2+2) + 5 = 39
    expect(duration).toBe(39);
  });

  it("returns null for unstructured descriptions", () => {
    expect(estimateWorkoutDuration("No workout here")).toBeNull();
  });
});

describe("estimateWorkoutDistance", () => {
  it("returns actual distance in km for completed events", () => {
    const event: CalendarEvent = {
      id: "1", date: new Date(), name: "W03 Tue Easy eco16",
      description: "", type: "completed", category: "easy",
      distance: 5500, duration: 2200, avgHr: 125,
    };
    expect(estimateWorkoutDistance(event)).toBe(5.5);
  });

  it("extracts km from name for long runs", () => {
    const event: CalendarEvent = {
      id: "2", date: new Date(), name: "W05 Sun Long (12km) eco16",
      description: "", type: "planned", category: "long",
    };
    expect(estimateWorkoutDistance(event)).toBe(12);
  });

  it("estimates from workout duration for structured descriptions", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

Main set 6x
- 2m 89-99% LTHR (150-167 bpm)
- 2m 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const event: CalendarEvent = {
      id: "3", date: new Date(), name: "W01 Thu Short Intervals eco16",
      description: desc, type: "planned", category: "interval",
    };
    // 39 min / 5.15 min/km (tempo pace for intervals) ≈ 7.6 km
    const result = estimateWorkoutDistance(event);
    expect(result).toBeGreaterThan(7);
    expect(result).toBeLessThan(8);
  });

  it("returns 0 for events with no data", () => {
    const event: CalendarEvent = {
      id: "4", date: new Date(), name: "W01 Tue Easy eco16",
      description: "No structured workout", type: "planned", category: "easy",
    };
    expect(estimateWorkoutDistance(event)).toBe(0);
  });
});

describe("extractPumpStatus", () => {
  it("extracts PUMP OFF with fuel rate and total carbs", () => {
    const desc = "PUMP OFF - FUEL PER 10: 5g TOTAL: 25g\n\nWarmup\n- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)";
    const result = extractPumpStatus(desc);
    expect(result.pump).toBe("PUMP OFF");
    expect(result.fuelRate).toBe(5);
    expect(result.totalCarbs).toBe(25);
  });

  it("extracts PUMP ON (EASE OFF)", () => {
    const desc = "PUMP ON (EASE OFF) - FUEL PER 10: 8g TOTAL: 32g\n\nWarmup\n- PUMP ON (EASE OFF) - FUEL PER 10: 8g 10m 66-78% LTHR (112-132 bpm)";
    const result = extractPumpStatus(desc);
    expect(result.pump).toBe("PUMP ON (EASE OFF)");
    expect(result.fuelRate).toBe(8);
    expect(result.totalCarbs).toBe(32);
  });

  it("extracts PUMP OFF with high fuel rate", () => {
    const desc = "PUMP OFF - FUEL PER 10: 10g TOTAL: 75g\n\nWarmup\n- PUMP OFF - FUEL PER 10: 10g 10m 66-78% LTHR (112-132 bpm)";
    const result = extractPumpStatus(desc);
    expect(result.pump).toBe("PUMP OFF");
    expect(result.fuelRate).toBe(10);
    expect(result.totalCarbs).toBe(75);
  });

  it("returns empty pump string for non-standard description", () => {
    const result = extractPumpStatus("Just a regular note");
    expect(result.pump).toBe("");
    expect(result.fuelRate).toBeNull();
    expect(result.totalCarbs).toBeNull();
  });
});

describe("parseWorkoutStructure", () => {
  it("parses a short intervals workout", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

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
    expect(sections[1].steps[0].zone).toBe("tempo");
    expect(sections[1].steps[1].zone).toBe("easy");

    expect(sections[2].name).toBe("Cooldown");
    expect(sections[2].steps[0].duration).toBe("5m");
  });

  it("parses a hills workout with Uphill/Downhill labels", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)

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
    const desc = `PUMP OFF - FUEL PER 10: 10g TOTAL: 75g

Warmup
- PUMP OFF - FUEL PER 10: 10g 10m 66-78% LTHR (112-132 bpm)

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
    const desc = `PUMP OFF - FUEL PER 10: 10g TOTAL: 75g

Warmup
- PUMP OFF - FUEL PER 10: 10g 10m 66-78% LTHR (112-132 bpm)

Main set
- 4km 66-78% LTHR (112-132 bpm)
- 4km 78-89% LTHR (132-150 bpm)
- 4km 66-78% LTHR (112-132 bpm)

Cooldown
- 5m 66-78% LTHR (112-132 bpm)`;

    const sections = parseWorkoutStructure(desc);
    const mainSet = sections[1];
    expect(mainSet.steps).toHaveLength(3);
    expect(mainSet.steps[0].zone).toBe("easy");
    expect(mainSet.steps[1].zone).toBe("steady");
    expect(mainSet.steps[2].zone).toBe("easy");
  });

  it("parses an easy + strides workout", () => {
    const desc = `PUMP ON (EASE OFF) - FUEL PER 10: 8g TOTAL: 32g

Warmup
- PUMP ON (EASE OFF) - FUEL PER 10: 8g 10m 66-78% LTHR (112-132 bpm)

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
});

describe("extractNotes", () => {
  it("extracts notes from between strategy header and first section", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Short, punchy efforts to build leg speed and running economy.

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)`;

    expect(extractNotes(desc)).toBe("Short, punchy efforts to build leg speed and running economy.");
  });

  it("returns null when no notes present", () => {
    const desc = `PUMP OFF - FUEL PER 10: 5g TOTAL: 25g

Warmup
- PUMP OFF - FUEL PER 10: 5g 10m 66-78% LTHR (112-132 bpm)`;

    expect(extractNotes(desc)).toBeNull();
  });

  it("returns null for empty description", () => {
    expect(extractNotes("")).toBeNull();
  });

  it("returns null for description without sections", () => {
    expect(extractNotes("Just a note")).toBeNull();
  });
});
