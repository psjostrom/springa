import { describe, it, expect } from "vitest";
import { buildRunAnalysisPrompt } from "../runAnalysisPrompt";
import type { CalendarEvent } from "../types";
import type { RunBGContext } from "../runBGContext";
import type { ReportCard } from "../reportCard";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-1",
    date: new Date("2026-02-15T10:00:00"),
    name: "W05 Tue Easy eco16",
    description: "",
    type: "completed",
    category: "easy",
    distance: 5200,
    duration: 2220,
    pace: 7.12,
    avgHr: 125,
    maxHr: 142,
    load: 45,
    ...overrides,
  };
}

function makeReportCard(overrides: Partial<ReportCard> = {}): ReportCard {
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
    ...overrides,
  };
}

function makeRunBGContext(overrides: Partial<RunBGContext> = {}): RunBGContext {
  return {
    activityId: "a123",
    category: "easy",
    pre: {
      entrySlope30m: -0.1,
      entryStability: 0.3,
      startBG: 10.2,
      readingCount: 6,
    },
    post: {
      recoveryDrop30m: -1.5,
      nadirPostRun: 4.8,
      timeToStable: 25,
      postRunHypo: false,
      endBG: 7.1,
      readingCount: 20,
    },
    totalBGImpact: -3.1,
    ...overrides,
  };
}

describe("buildRunAnalysisPrompt", () => {
  it("returns system and user prompts", () => {
    const result = buildRunAnalysisPrompt({
      event: makeEvent(),
      runBGContext: makeRunBGContext(),
      reportCard: makeReportCard(),
    });

    expect(result.system).toContain("Type 1 Diabetic");
    expect(result.system).toContain("200 words");
    expect(result.user).toContain("W05 Tue Easy eco16");
  });

  it("includes run basics in user prompt", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
    });

    expect(user).toContain("5.20 km");
    expect(user).toContain("7:07 /km");
    expect(user).toContain("Avg HR: 125 bpm");
    expect(user).toContain("Category: easy");
  });

  it("includes BG data when report card provided", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Start BG: 10.2 mmol/L");
    expect(user).toContain("Min BG: 8.5 mmol/L");
    expect(user).toContain("Drop rate: -0.57 mmol/L per 10min");
    expect(user).toContain("Hypo during run: No");
  });

  it("includes fuel data", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Planned: 35g");
    expect(user).toContain("Actual: 32g");
    expect(user).toContain("Adherence: 91%");
  });

  it("includes HR zone compliance", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Target zone: Z2");
    expect(user).toContain("% in target: 72%");
  });

  it("includes pre-run and recovery context", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      runBGContext: makeRunBGContext(),
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Entry slope: -0.10");
    expect(user).toContain("Label: Stable");
    expect(user).toContain("30m recovery drop: -1.5 mmol/L");
    expect(user).toContain("Nadir (lowest in 2h): 4.8 mmol/L");
    expect(user).toContain("Time to stable BG: 25 min");
    expect(user).toContain("Total BG impact (start to 2h post): -3.1 mmol/L");
  });

  it("works with minimal data (no report card, no BG context)", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
    });

    expect(user).toContain("## Run Data");
    expect(user).toContain("Analyze this run.");
    expect(user).not.toContain("## Blood Glucose");
    expect(user).not.toContain("## Fuel");
    expect(user).not.toContain("## Pre-Run BG");
  });

  it("includes glucose curve from stream data", () => {
    const event = makeEvent({
      streamData: {
        glucose: [
          { time: 0, value: 10.0 },
          { time: 300, value: 9.5 },
          { time: 600, value: 8.8 },
          { time: 900, value: 8.2 },
        ],
      },
    });

    const { user } = buildRunAnalysisPrompt({ event });

    expect(user).toContain("## Glucose Curve");
    expect(user).toContain("Start: 10.0");
    expect(user).toContain("Min: 8.2");
    expect(user).toContain("End: 8.2");
    expect(user).toContain("Points: 4");
  });

  it("includes hypo flag when present", () => {
    const reportCard = makeReportCard({
      bg: {
        rating: "bad",
        startBG: 9.0,
        minBG: 3.2,
        hypo: true,
        dropRate: -2.5,
      },
    });

    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard,
    });

    expect(user).toContain("Hypo during run: YES");
    expect(user).toContain("Rating: Bad");
  });

  it("formats duration correctly", () => {
    const { user: short } = buildRunAnalysisPrompt({
      event: makeEvent({ duration: 1800 }),
    });
    expect(short).toContain("Duration: 30m");

    const { user: long } = buildRunAnalysisPrompt({
      event: makeEvent({ duration: 5400 }),
    });
    expect(long).toContain("Duration: 1h30m");

    const { user: exactHour } = buildRunAnalysisPrompt({
      event: makeEvent({ duration: 3600 }),
    });
    expect(exactHour).toContain("Duration: 1h");
  });

  it("handles null report card fields gracefully", () => {
    const reportCard = makeReportCard({
      bg: null,
      fuel: null,
      hrZone: null,
      entryTrend: null,
      recovery: null,
    });

    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      reportCard,
    });

    expect(user).not.toContain("## Blood Glucose");
    expect(user).not.toContain("## Fuel");
    expect(user).not.toContain("## HR Zone Compliance");
  });

  it("system prompt contains pace zones, LTHR, and T1D safety rules", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent() });

    expect(system).toContain("LTHR: 169");
    expect(system).toContain("Easy: 7:00-7:30/km");
    expect(system).toContain("pump-off");
    expect(system).toContain("NEVER suggest \"reducing carbs\"");
    expect(system).toContain("MORE carbs, not fewer");
  });

  it("system prompt explains category-to-zone mapping", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent() });

    expect(system).toContain("\"easy\" or \"long\" → should be in Z2");
    expect(system).toContain("Avg HR above 132 means too hard");
    expect(system).toContain("\"interval\" → main set in Z4");
  });

  it("system prompt connects intensity to BG drop", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent() });

    expect(system).toContain("Higher intensity (higher HR zone) = MORE glucose uptake = FASTER BG drop");
  });

  it("system prompt has fuel adjustment guidance", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent() });

    expect(system).toContain("grams of carbs per 10 minutes");
    expect(system).toContain("+2g per 10min");
  });

  it("system prompt flags low start BG as risk", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent() });

    expect(system).toContain("Starting below 9 is a risk factor");
    expect(system).toContain("Below 8 is a serious concern");
  });
});
