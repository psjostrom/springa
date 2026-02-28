import { describe, it, expect } from "vitest";
import { buildRunAnalysisPrompt } from "../runAnalysisPrompt";
import { buildEnrichedRunTable, formatRunTable } from "../bgPatterns";
import { buildInsulinContext, type InsulinContext } from "../insulinContext";
import type { CalendarEvent } from "../types";
import type { RunBGContext } from "../runBGContext";
import type { ReportCard } from "../reportCard";
import type { GlookoData } from "../glooko";

// --- Helpers ---

const T0 = new Date("2026-02-15T14:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-1",
    date: new Date(T0),
    name: "W05 Easy eco16",
    description: "",
    type: "completed",
    category: "easy",
    activityId: "a1",
    distance: 5200,
    duration: 2220,
    pace: 7.12,
    avgHr: 125,
    maxHr: 142,
    load: 45,
    streamData: {
      glucose: [
        { time: 0, value: 10.0 },
        { time: 300, value: 9.5 },
        { time: 600, value: 9.0 },
        { time: 900, value: 8.5 },
      ],
    },
    ...overrides,
  };
}

function makeReportCard(): ReportCard {
  return {
    bg: {
      rating: "good",
      startBG: 10.2,
      minBG: 8.5,
      hypo: false,
      dropRate: -0.57,
    },
    hrZone: {
      rating: "good",
      targetZone: "Z2",
      pctInTarget: 72,
    },
    fuel: {
      rating: "good",
      actual: 32,
      planned: 35,
      pct: 91,
    },
    entryTrend: {
      rating: "good",
      slope30m: -0.1,
      stability: 0.3,
      label: "Stable",
    },
    recovery: {
      rating: "ok",
      drop30m: -1.5,
      nadir: 4.8,
      postHypo: false,
      label: "Dipping",
    },
  };
}

function makeInsulinContext(overrides: Partial<InsulinContext> = {}): InsulinContext {
  return {
    lastBolusTime: new Date(T0 - 3 * HOUR).toISOString(),
    lastBolusUnits: 4.5,
    lastMealTime: new Date(T0 - 3 * HOUR).toISOString(),
    lastMealCarbs: 65,
    iobAtStart: 1.13,
    expectedBGImpact: 3.5,
    timeSinceLastMeal: 180,
    timeSinceLastBolus: 180,
    ...overrides,
  };
}

// --- Prompt integration ---

describe("runAnalysisPrompt with insulinContext", () => {
  it("includes insulin context section when provided", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard: makeReportCard(),
      insulinContext: makeInsulinContext(),
    });

    expect(user).toContain("## Insulin & Meal Context");
    expect(user).toContain("IOB at run start: 1.13 u");
    expect(user).toContain("Time since last bolus: 180 min");
    expect(user).toContain("Last bolus: 4.5 u");
    expect(user).toContain("Time since last meal: 180 min");
    expect(user).toContain("Last meal: 65g carbs");
  });

  it("omits insulin section when null", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      insulinContext: null,
    });

    expect(user).not.toContain("## Insulin & Meal Context");
    expect(user).not.toContain("IOB");
  });

  it("omits insulin section when undefined", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
    });

    expect(user).not.toContain("## Insulin & Meal Context");
  });

  it("omits last meal carbs line when zero", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      insulinContext: makeInsulinContext({ lastMealCarbs: 0 }),
    });

    expect(user).toContain("## Insulin & Meal Context");
    expect(user).not.toContain("Last meal:");
  });

  it("places insulin section before post-run recovery", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard: makeReportCard(),
      insulinContext: makeInsulinContext(),
    });

    const insulinIdx = user.indexOf("## Insulin & Meal Context");
    const recoveryIdx = user.indexOf("## Post-Run Recovery");
    expect(insulinIdx).toBeGreaterThan(-1);
    expect(recoveryIdx).toBeGreaterThan(-1);
    expect(insulinIdx).toBeLessThan(recoveryIdx);
  });

  it("system prompt mentions IOB physiology", () => {
    const { system } = buildRunAnalysisPrompt({
      event: makeEvent(),
      insulinContext: makeInsulinContext(),
    });

    expect(system).toContain("Insulin on board (IOB)");
    expect(system).toContain("Time since last meal affects entrySlope");
  });
});

// --- bgPatterns integration ---

describe("buildEnrichedRunTable with insulinContexts", () => {
  const events = [
    makeEvent({ activityId: "a1", date: new Date("2026-02-10T14:00:00Z") }),
    makeEvent({ activityId: "a2", date: new Date("2026-02-12T14:00:00Z"), name: "W05 Long eco16", category: "long" }),
  ];

  const bgContexts: Record<string, RunBGContext> = {
    a1: {
      activityId: "a1",
      category: "easy",
      pre: { entrySlope30m: -0.2, entryStability: 0.4, startBG: 10.0, readingCount: 6 },
      post: null,
      totalBGImpact: null,
    },
  };

  it("includes insulin columns when insulinContexts provided", () => {
    const insulinContexts: Record<string, InsulinContext> = {
      a1: makeInsulinContext({ iobAtStart: 1.5, timeSinceLastMeal: 150, timeSinceLastBolus: 150 }),
    };

    const runs = buildEnrichedRunTable(events, [], [], bgContexts, insulinContexts);
    expect(runs.length).toBeGreaterThanOrEqual(1);

    const run1 = runs.find((r) => r.date === "2026-02-10");
    expect(run1).toBeDefined();
    expect(run1!.iobAtStart).toBe(1.5);
    expect(run1!.timeSinceLastMeal).toBe(150);
    expect(run1!.timeSinceLastBolus).toBe(150);

    // Second event has no insulin context
    const run2 = runs.find((r) => r.date === "2026-02-12");
    expect(run2).toBeDefined();
    expect(run2!.iobAtStart).toBeNull();
    expect(run2!.timeSinceLastMeal).toBeNull();
  });

  it("sets insulin fields to null when no insulinContexts provided", () => {
    const runs = buildEnrichedRunTable(events, [], [], bgContexts);
    const run = runs[0];
    expect(run.iobAtStart).toBeNull();
    expect(run.timeSinceLastMeal).toBeNull();
    expect(run.timeSinceLastBolus).toBeNull();
  });
});

describe("formatRunTable with insulin columns", () => {
  it("includes insulin column headers in TSV", () => {
    const events = [makeEvent()];
    const bgContexts: Record<string, RunBGContext> = {};
    const runs = buildEnrichedRunTable(events, [], [], bgContexts);
    const tsv = formatRunTable(runs);
    const header = tsv.split("\n")[0];

    expect(header).toContain("IOB_u");
    expect(header).toContain("mealMin");
    expect(header).toContain("bolusMin");
  });

  it("outputs ? for missing insulin data", () => {
    const events = [makeEvent()];
    const runs = buildEnrichedRunTable(events, [], [], {});
    const tsv = formatRunTable(runs);
    const dataRow = tsv.split("\n")[1];

    // Last 3 columns should be ? (null → "?")
    const cols = dataRow.split("\t");
    const insulinCols = cols.slice(-3);
    expect(insulinCols).toEqual(["?", "?", "?"]);
  });

  it("outputs values for present insulin data", () => {
    const events = [makeEvent()];
    const insulinContexts: Record<string, InsulinContext> = {
      a1: makeInsulinContext({ iobAtStart: 2.5, timeSinceLastMeal: 120, timeSinceLastBolus: 90 }),
    };
    const runs = buildEnrichedRunTable(events, [], [], {}, insulinContexts);
    const tsv = formatRunTable(runs);
    const dataRow = tsv.split("\n")[1];
    const cols = dataRow.split("\t");
    const insulinCols = cols.slice(-3);
    expect(insulinCols).toEqual(["2.5", "120", "90"]);
  });
});

// --- End-to-end: Glooko data → InsulinContext → prompt ---

describe("end-to-end: GlookoData → InsulinContext → prompt", () => {
  it("full pipeline from raw Glooko data to prompt output", () => {
    const runStartMs = T0;

    // Simulate Glooko data: meal+bolus 3h before run
    const glookoData: GlookoData = {
      boluses: [
        {
          pumpTimestamp: new Date(runStartMs - 3 * HOUR).toISOString(),
          insulinDelivered: 5.0,
          carbsInput: 70,
        },
      ],
    };

    // Step 1: Build InsulinContext
    const ctx = buildInsulinContext(glookoData, runStartMs);
    expect(ctx).not.toBeNull();
    // Fiasp: 5 * (1 + 180/55) * exp(-180/55) ≈ 0.81
    expect(ctx!.iobAtStart).toBe(0.81);
    expect(ctx!.timeSinceLastMeal).toBe(180);
    expect(ctx!.lastMealCarbs).toBe(70);

    // Step 2: Build prompt with InsulinContext
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      insulinContext: ctx!,
    });

    expect(user).toContain("IOB at run start: 0.81 u");
    expect(user).toContain("Time since last meal: 180 min");
    expect(user).toContain("Last meal: 70g carbs");
  });
});
