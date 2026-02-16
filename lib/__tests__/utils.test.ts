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
