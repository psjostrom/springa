import { describe, it, expect } from "vitest";
import { buildRunAnalysisPrompt } from "../runAnalysisPrompt";
import type { CalendarEvent } from "../types";
import type { RunBGContext } from "../runBGContext";
import type { ReportCard } from "../reportCard";
import { TEST_HR_ZONES } from "./testConstants";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-1",
    date: new Date("2026-02-15T10:00:00"),
    name: "W05 Easy",
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
      worstRate: -0.285,
      lbgi: 0,
    },
    hrZone: {
      rating: "good",
      targetZone: "Z2",
      pctInTarget: 72,
    },
    entryTrend: {
      rating: "good",
      slope30m: -0.05,
      stability: 0.3,
      label: "Stable",
    },
    recovery: {
      rating: "ok",
      drop30m: -0.75,
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
      entrySlope30m: -0.05,
      entryStability: 0.3,
      startBG: 10.2,
      readingCount: 6,
    },
    post: {
      recoveryDrop30m: -0.75,
      nadirPostRun: 4.8,
      timeToStable: 25,
      postRunHypo: false,
      endBG: 7.1,
      readingCount: 20,
      peak30m: 7.1,
      spike30m: 0,
      peak60mAboveEnd: 0,
    },
    totalBGImpact: -3.1,
    ...overrides,
  };
}

const defaultHrZones = [...TEST_HR_ZONES];

describe("buildRunAnalysisPrompt", () => {
  it("returns system and user prompts", () => {
    const result = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
      runBGContext: makeRunBGContext(),
      reportCard: makeReportCard(),
    });

    expect(result.system).toContain("Type 1 Diabetic");
    expect(result.system).toContain("150 words");
    expect(result.user).toContain("W05 Easy");
  });

  it("includes run basics in user prompt", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
    });

    expect(user).toContain("5.20 km");
    expect(user).toContain("7:07 /km");
    expect(user).toContain("Avg HR: 125 bpm");
    expect(user).toContain("Category: easy");
  });

  it("includes BG data when report card provided", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Start BG: 10.2 mmol/L");
    expect(user).toContain("Min BG: 8.5 mmol/L");
    expect(user).toContain("Worst drop rate: -0.285 mmol/L per min");
    expect(user).toContain("Hypo during run: No");
  });

  it("includes HR zone compliance", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Target zone: Z2");
    expect(user).toContain("% in target: 72%");
  });

  it("includes pre-run and recovery context", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
      runBGContext: makeRunBGContext(),
      reportCard: makeReportCard(),
    });

    expect(user).toContain("Entry slope: -0.05");
    expect(user).toContain("Label: Stable");
    expect(user).toContain("30m recovery drop: -0.8 mmol/L");
    expect(user).toContain("Nadir (lowest in 2h): 4.8 mmol/L");
    expect(user).toContain("Time to stable BG: 25 min");
    expect(user).toContain("Total BG impact (start to 2h post): -3.1 mmol/L");
  });

  it("works with minimal data (no report card, no BG context)", () => {
    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
    });

    expect(user).toContain("## Run Data");
    expect(user).toContain("Analyze this run.");
    expect(user).not.toContain("## Blood Glucose");
    expect(user).not.toContain("## Fuel");
    expect(user).not.toContain("## Pre-Run BG");
  });

  it("includes glucose curve from stream data", () => {
    const event = makeEvent({
      glucose: [
        { time: 0, value: 10.0 },
        { time: 300, value: 9.5 },
        { time: 600, value: 8.8 },
        { time: 900, value: 8.2 },
      ],
    });

    const { user } = buildRunAnalysisPrompt({ event, hrZones: defaultHrZones });

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
        worstRate: -1.25,
        lbgi: 20,
      },
    });

    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
      reportCard,
    });

    expect(user).toContain("Hypo during run: YES");
    expect(user).toContain("Rating: Bad");
  });

  it("formats duration correctly", () => {
    const { user: short } = buildRunAnalysisPrompt({
      event: makeEvent({ duration: 1800 }),
      hrZones: defaultHrZones,
    });
    expect(short).toContain("Duration: 30m");

    const { user: long } = buildRunAnalysisPrompt({
      event: makeEvent({ duration: 5400 }),
      hrZones: defaultHrZones,
    });
    expect(long).toContain("Duration: 1h 30m");

    const { user: exactHour } = buildRunAnalysisPrompt({
      event: makeEvent({ duration: 3600 }),
      hrZones: defaultHrZones,
    });
    expect(exactHour).toContain("Duration: 1h");
  });

  it("handles null report card fields gracefully", () => {
    const reportCard = makeReportCard({
      bg: null,
      hrZone: null,
      entryTrend: null,
      recovery: null,
    });

    const { user } = buildRunAnalysisPrompt({
      event: makeEvent(),
      hrZones: defaultHrZones,
      reportCard,
    });

    expect(user).not.toContain("## Blood Glucose");
    expect(user).not.toContain("## Fuel");
    expect(user).not.toContain("## HR Zone Compliance");
  });

  describe("pump status in system prompt", () => {
    it("states pump OFF when pumpDuringRuns is off", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
        lthr: 168,
        maxHr: 189,
        pumpDuringRuns: "off"
      });

      expect(system).toContain("Insulin pump OFF for all runs (zero insulin delivery)");
      expect(system).toContain("Pump OFF = zero insulin");
    });

    it("states pump ON when pumpDuringRuns is on", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
        pumpDuringRuns: "on"
      });

      expect(system).toContain("Insulin pump remains ON during runs (basal still active)");
      expect(system).toContain("Pump ON = basal insulin still working");
      expect(system).toContain("BG drop comes from BOTH exercise glucose uptake AND insulin action");
    });

    it("states pump varies when pumpDuringRuns is mixed", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
        pumpDuringRuns: "mixed"
      });

      expect(system).toContain("Pump usage during runs varies (sometimes ON, sometimes OFF)");
      expect(system).toContain("Pump status varies between runs");
      expect(system).toContain("Check IOB and pump state per-run");
    });

    it("omits pump claim when pumpDuringRuns is unset", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones
      });

      expect(system).toContain("Type 1 Diabetic.");
      expect(system).not.toContain("pump OFF");
      expect(system).not.toContain("pump ON");
      expect(system).not.toContain("Pump status varies");
    });

    it("includes other T1D safety rules regardless of pump status", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
        lthr: 168,
        maxHr: 189
      });

      expect(system).toContain("NEVER suggest reducing carbs");
      expect(system).toContain("More carbs = slower drop");
      expect(system).toContain("Higher intensity = more glucose uptake = faster BG drop");
    });
  });

  it("system prompt explains category-to-zone mapping", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent(), hrZones: defaultHrZones, lthr: 168, maxHr: 189 });

    expect(system).toContain("\"easy\"/\"long\" → Z2 entire time");
    expect(system).toContain("Avg HR >140 = too hard");
    expect(system).toContain("\"interval\" → reps target Z4");
  });

  it("system prompt connects intensity to BG drop", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent(), hrZones: defaultHrZones });

    expect(system).toContain("Higher intensity = more glucose uptake = faster BG drop");
  });

  it("system prompt has fuel adjustment guidance", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent(), hrZones: defaultHrZones });

    expect(system).toContain("Carbs are the ONLY tool to slow/reverse BG drops");
    expect(system).toContain("fuel rate");
  });

  it("system prompt flags low start BG as risk", () => {
    const { system } = buildRunAnalysisPrompt({ event: makeEvent(), hrZones: defaultHrZones });

    expect(system).toContain("Starting below 9 is a risk factor");
    expect(system).toContain("Below 8 is a serious concern");
  });

  describe("omit-on-missing HR", () => {
    it("does not include LTHR or MaxHR text when not provided", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
      });

      expect(system).not.toMatch(/168/);
      expect(system).not.toMatch(/189/);
      expect(system).toContain("HR zones not provided");
    });

    it("includes HR-band text when LTHR and MaxHR provided", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
        lthr: 170,
        maxHr: 195,
      });

      expect(system).not.toContain("HR zones not provided");
      expect(system).toContain("170");
      expect(system).toContain("195");
    });
  });

  describe("pre-exercise BG references", () => {
    it("always includes the international consensus line", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
      });
      expect(system).toContain("Pre-exercise BG target: 7-10 mmol/L");
      expect(system).toContain("Riddell 2017");
    });

    it("does not include the removed targetStartBG line", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
      });
      expect(system).not.toMatch(/Target start BG/i);
    });

    it("does not include personal hypo signal line when pastRuns omitted", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
      });
      expect(system).not.toMatch(/Personal hypo signal/);
    });

    it("includes personal hypo signal line when pastRuns produces a floor", () => {
      const { system } = buildRunAnalysisPrompt({
        event: makeEvent(),
        hrZones: defaultHrZones,
        pastRuns: [
          { startBG: 7.0, wentHypo: true },
          { startBG: 7.1, wentHypo: true },
          { startBG: 7.2, wentHypo: true },
          { startBG: 8.5, wentHypo: false },
          { startBG: 8.6, wentHypo: false },
          { startBG: 8.7, wentHypo: false },
          { startBG: 9.0, wentHypo: false },
          { startBG: 9.5, wentHypo: false },
          { startBG: 10.0, wentHypo: false },
          { startBG: 10.5, wentHypo: false },
          { startBG: 11.0, wentHypo: false },
        ],
      });
      expect(system).toMatch(/Personal hypo signal/);
    });
  });
});
