import { describe, it, expect } from "vitest";
import {
  assembleDescription,
  adaptFuelRate,
  shouldSwapToEasy,
  reconstructExternalId,
  applyAdaptations,
} from "../adaptPlan";
import { extractNotes, extractStructure } from "../descriptionParser";
import type { FitnessInsights } from "../fitness";
import type { CalendarEvent } from "../types";
import type { BGResponseModel, TargetFuelResult } from "../bgModel";

// --- Helpers ---

function makeInsights(overrides: Partial<FitnessInsights> = {}): FitnessInsights {
  return {
    currentCtl: 30,
    currentAtl: 40,
    currentTsb: -10,
    ctlTrend: 5,
    peakCtl: 35,
    peakCtlDate: "2026-01-15",
    formZone: "optimal",
    formZoneLabel: "Optimal Training",
    totalActivities7d: 4,
    totalLoad7d: 200,
    totalActivities28d: 16,
    totalLoad28d: 800,
    rampRate: 3,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    date: new Date("2026-03-10"),
    name: "W14 Thu Short-Intervals eco16",
    description:
      "Speed session\nPUMP OFF - FUEL PER 10: 5g TOTAL: 25g\n\nWarmup\n- 10m 112-132 bpm\n\nMain set\n- 6x 2m 150-167 bpm / 2m 112-132 bpm\n\nCooldown\n- 5m 112-132 bpm",
    type: "planned",
    category: "interval",
    fuelRate: 30,
    duration: 2400,
    ...overrides,
  };
}

function makeTarget(category: "easy" | "long" | "interval", rate: number): TargetFuelResult {
  return {
    category,
    targetFuelRate: rate,
    currentAvgFuel: rate - 5,
    method: "regression",
    confidence: "medium",
  };
}

function makeBGModel(targets: TargetFuelResult[] = []): BGResponseModel {
  return {
    categories: {
      easy: { category: "easy", avgRate: -0.3, medianRate: -0.3, sampleCount: 20, confidence: "medium", avgFuelRate: 45, activityCount: 5 },
      long: { category: "long", avgRate: -0.6, medianRate: -0.55, sampleCount: 15, confidence: "medium", avgFuelRate: 58, activityCount: 4 },
      interval: { category: "interval", avgRate: -0.8, medianRate: -0.75, sampleCount: 10, confidence: "low", avgFuelRate: 28, activityCount: 3 },
    },
    observations: [],
    activitiesAnalyzed: 12,
    bgByStartLevel: [],
    bgByEntrySlope: [],
    bgByTime: [],
    targetFuelRates: targets,
  };
}

// --- Tests ---

describe("extractStructure", () => {
  it("extracts structure starting at Warmup", () => {
    const desc = "Speed session\nPUMP OFF - FUEL PER 10: 5g\n\nWarmup\n- 10m easy\n\nMain set\n- 6x 2m fast";
    const structure = extractStructure(desc);

    expect(structure).toContain("Warmup");
    expect(structure).toContain("Main set");
    expect(structure).not.toContain("Speed session");
  });

  it("returns empty when no Warmup section", () => {
    expect(extractStructure("Just a note with no structure")).toBe("");
  });

  it("handles empty description", () => {
    expect(extractStructure("")).toBe("");
  });
});

describe("extractNotes (description splitting)", () => {
  it("extracts notes filtering FUEL/PUMP lines", () => {
    const desc = "Trail run\nFUEL PER 10: 10g TOTAL: 75g\nPUMP OFF\n(Trail)\n\nWarmup\n- 10m easy";
    const notes = extractNotes(desc);

    expect(notes).toBe("Trail run");
  });

  it("returns null when no Warmup section", () => {
    expect(extractNotes("Just a note with no structure")).toBeNull();
  });

  it("handles empty description", () => {
    expect(extractNotes("")).toBeNull();
  });
});

describe("assembleDescription", () => {
  it("joins notes and structure with fuel line", () => {
    const result = assembleDescription(
      "Start at 10+ mmol",
      "Warmup\n- 10m easy\n\nMain set\n- 30m Z2",
      48,
      3600,
    );

    expect(result).toContain("Start at 10+ mmol");
    expect(result).toContain("PUMP OFF - FUEL PER 10: 8g TOTAL: 48g");
    expect(result).toContain("Warmup");
    expect(result).toContain("Main set");
  });

  it("omits fuel line when no fuel rate", () => {
    const result = assembleDescription("Note", "Warmup\n- 10m", null, 3600);
    expect(result).not.toContain("PUMP OFF");
    expect(result).toContain("Note");
    expect(result).toContain("Warmup");
  });

  it("handles empty notes", () => {
    const result = assembleDescription("", "Warmup\n- 10m", 30, 2400);
    expect(result).toContain("PUMP OFF");
    expect(result).toContain("Warmup");
    expect(result).not.toMatch(/^\n/); // should not start with newline
  });

  it("handles empty structure", () => {
    const result = assembleDescription("Just a note", "", null);
    expect(result).toBe("Just a note");
  });
});

describe("adaptFuelRate", () => {
  it("returns target fuel when available for category", () => {
    const bgModel = makeBGModel([makeTarget("interval", 36)]);
    const { rate, change } = adaptFuelRate(30, "interval", bgModel);

    expect(rate).toBe(36);
    expect(change).not.toBeNull();
    expect(change!.detail).toContain("30 → 36");
  });

  it("returns original when target matches current", () => {
    const bgModel = makeBGModel([makeTarget("easy", 48)]);
    const { rate, change } = adaptFuelRate(48, "easy", bgModel);

    expect(rate).toBe(48);
    expect(change).toBeNull();
  });

  it("falls back to category average when no target exists", () => {
    const bgModel = makeBGModel(); // has avgFuelRate 28 for interval
    const { rate, change } = adaptFuelRate(30, "interval", bgModel);

    // getCurrentFuelRate resolves to Math.round(28) = 28
    expect(rate).toBe(28);
    expect(change).not.toBeNull();
    expect(change!.detail).toContain("30 → 28");
  });

  it("sets fuel when current is null", () => {
    const bgModel = makeBGModel();
    const { rate, change } = adaptFuelRate(null, "easy", bgModel);

    // getCurrentFuelRate resolves to Math.round(45) = 45
    expect(rate).toBe(45);
    expect(change).not.toBeNull();
    expect(change!.detail).toContain("set to 45");
  });

  it("ignores race category", () => {
    const bgModel = makeBGModel([makeTarget("easy", 50)]);
    const { rate, change } = adaptFuelRate(30, "race", bgModel);

    expect(rate).toBe(30);
    expect(change).toBeNull();
  });
});

describe("shouldSwapToEasy", () => {
  it("triggers swap when TSB < -20", () => {
    const insights = makeInsights({ currentTsb: -24 });
    const result = shouldSwapToEasy("interval", insights);

    expect(result.swap).toBe(true);
    expect(result.reason).toContain("TSB at -24");
  });

  it("triggers swap when ramp rate > 8", () => {
    const insights = makeInsights({ rampRate: 9.5, currentTsb: -5 });
    const result = shouldSwapToEasy("interval", insights);

    expect(result.swap).toBe(true);
    expect(result.reason).toContain("ramp rate");
  });

  it("does not swap easy runs", () => {
    const insights = makeInsights({ currentTsb: -30 });
    const result = shouldSwapToEasy("easy", insights);

    expect(result.swap).toBe(false);
  });

  it("does not swap long runs", () => {
    const insights = makeInsights({ currentTsb: -25 });
    const result = shouldSwapToEasy("long", insights);

    expect(result.swap).toBe(false);
  });

  it("does not swap when fitness is fine", () => {
    const insights = makeInsights({ currentTsb: -10, rampRate: 4 });
    const result = shouldSwapToEasy("interval", insights);

    expect(result.swap).toBe(false);
  });

  it("TSB check takes priority over ramp rate", () => {
    const insights = makeInsights({ currentTsb: -25, rampRate: 10 });
    const result = shouldSwapToEasy("interval", insights);

    expect(result.swap).toBe(true);
    expect(result.reason).toContain("TSB");
  });
});

describe("reconstructExternalId", () => {
  it("parses W{n} {Day} pattern", () => {
    expect(reconstructExternalId("W12 Thu Short-Intervals eco16", "eco16")).toBe("eco16-thu-12");
  });

  it("parses different days", () => {
    expect(reconstructExternalId("W5 Sat Long Run eco16", "eco16")).toBe("eco16-sat-5");
    expect(reconstructExternalId("W1 Tue Easy eco16", "eco16")).toBe("eco16-tue-1");
  });

  it("parses RACE DAY with week number", () => {
    expect(reconstructExternalId("W18 Sat RACE DAY eco16", "eco16")).toBe("eco16-race-18");
  });

  it("parses RACE DAY without week number", () => {
    expect(reconstructExternalId("RACE DAY eco16", "eco16")).toBe("eco16-race");
  });

  it("returns null for unrecognized patterns", () => {
    expect(reconstructExternalId("Random event name", "eco16")).toBeNull();
  });

  it("is case-insensitive for day names", () => {
    expect(reconstructExternalId("W3 tue Easy eco16", "eco16")).toBe("eco16-tue-3");
  });
});

describe("applyAdaptations", () => {
  it("adjusts fuel and tracks change", () => {
    const events = [makeEvent({ fuelRate: 30 })];
    const bgModel = makeBGModel([makeTarget("interval", 36)]);
    const insights = makeInsights();

    const result = applyAdaptations({
      upcomingEvents: events,
      bgModel,
      insights,
      runBGContexts: {},
      prefix: "eco16",
    });

    expect(result).toHaveLength(1);
    expect(result[0].fuelRate).toBe(36);
    expect(result[0].changes).toHaveLength(1);
    expect(result[0].changes[0].type).toBe("fuel");
  });

  it("swaps interval to easy when TSB is critical", () => {
    const events = [makeEvent()];
    const bgModel = makeBGModel();
    const insights = makeInsights({ currentTsb: -25 });

    const result = applyAdaptations({
      upcomingEvents: events,
      bgModel,
      insights,
      runBGContexts: {},
      prefix: "eco16",
    });

    expect(result[0].swapped).toBe(true);
    expect(result[0].structure).toContain("66-78% LTHR");
    expect(result[0].changes.some((c) => c.type === "swap")).toBe(true);
  });

  it("applies both fuel and swap changes", () => {
    const events = [makeEvent({ fuelRate: 30 })];
    const bgModel = makeBGModel([makeTarget("interval", 36)]);
    const insights = makeInsights({ currentTsb: -22 });

    const result = applyAdaptations({
      upcomingEvents: events,
      bgModel,
      insights,
      runBGContexts: {},
      prefix: "eco16",
    });

    expect(result[0].fuelRate).toBe(36);
    expect(result[0].swapped).toBe(true);
    expect(result[0].changes).toHaveLength(2);
  });

  it("reconstructs external_id from name", () => {
    const events = [makeEvent({ name: "W14 Thu Short-Intervals eco16" })];
    const bgModel = makeBGModel();
    const insights = makeInsights();

    const result = applyAdaptations({
      upcomingEvents: events,
      bgModel,
      insights,
      runBGContexts: {},
      prefix: "eco16",
    });

    expect(result[0].externalId).toBe("eco16-thu-14");
  });

  it("leaves easy runs unchanged when resolved rate matches current", () => {
    const events = [
      makeEvent({
        name: "W14 Tue Easy eco16",
        category: "easy",
        fuelRate: 45, // matches bgModel avgFuelRate for easy
        description: "Easy run\n\nWarmup\n- 10m easy\n\nMain set\n- 30m Z2\n\nCooldown\n- 5m easy",
      }),
    ];
    const bgModel = makeBGModel();
    const insights = makeInsights();

    const result = applyAdaptations({
      upcomingEvents: events,
      bgModel,
      insights,
      runBGContexts: {},
      prefix: "eco16",
    });

    expect(result[0].fuelRate).toBe(45);
    expect(result[0].swapped).toBe(false);
    expect(result[0].changes).toHaveLength(0);
  });

  it("handles multiple events", () => {
    const events = [
      makeEvent({ id: "ev-1", name: "W14 Tue Easy eco16", category: "easy", fuelRate: 45 }), // matches avgFuelRate
      makeEvent({ id: "ev-2", name: "W14 Thu Short-Intervals eco16", category: "interval", fuelRate: 30 }),
      makeEvent({ id: "ev-3", name: "W14 Sat Long Run eco16", category: "long", fuelRate: 60 }),
    ];
    const bgModel = makeBGModel([makeTarget("interval", 36), makeTarget("long", 65)]);
    const insights = makeInsights();

    const result = applyAdaptations({
      upcomingEvents: events,
      bgModel,
      insights,
      runBGContexts: {},
      prefix: "eco16",
    });

    expect(result).toHaveLength(3);
    // Easy: no change (45 matches avgFuelRate)
    expect(result[0].changes).toHaveLength(0);
    // Interval: fuel change
    expect(result[1].fuelRate).toBe(36);
    // Long: fuel change
    expect(result[2].fuelRate).toBe(65);
  });
});
