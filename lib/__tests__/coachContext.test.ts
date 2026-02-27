import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSystemPrompt, summarizeRecoveryPatterns } from "../coachContext";
import type { CalendarEvent } from "../types";
import type { BGResponseModel, BGObservation } from "../bgModel";
import type { FitnessInsights } from "../fitness";
import type { RunBGContext } from "../runBGContext";
import type { RunFeedbackRecord } from "../feedbackDb";

// --- Helpers ---

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "activity-a1",
    date: new Date(),
    name: "Easy Run eco16",
    description: "",
    type: "completed",
    category: "easy",
    activityId: "a1",
    ...overrides,
  };
}

function makeObs(overrides: Partial<BGObservation> = {}): BGObservation {
  return {
    category: "easy",
    bgRate: -0.8,
    fuelRate: 48,
    activityId: "a1",
    timeMinute: 10,
    startBG: 10.2,
    relativeMinute: 10,
    entrySlope: null,
    ...overrides,
  };
}

function makeBGModel(overrides: Partial<BGResponseModel> = {}): BGResponseModel {
  return {
    categories: { easy: null, long: null, interval: null },
    observations: [],
    activitiesAnalyzed: 0,
    bgByStartLevel: [],
    bgByEntrySlope: [],
    bgByTime: [],
    targetFuelRates: [],
    ...overrides,
  };
}

function makeInsights(overrides: Partial<FitnessInsights> = {}): FitnessInsights {
  return {
    currentCtl: 20,
    currentAtl: 25,
    currentTsb: -5,
    ctlTrend: 2,
    peakCtl: 22,
    peakCtlDate: "2026-02-10",
    formZone: "optimal",
    formZoneLabel: "Optimal",
    totalActivities7d: 3,
    totalLoad7d: 120,
    totalActivities28d: 12,
    totalLoad28d: 480,
    rampRate: 1.5,
    ...overrides,
  };
}

const basePhaseInfo = { name: "Build", week: 5, progress: 28 };

// Fix "today" so date-based filtering is deterministic
const FAKE_NOW = new Date("2026-02-19T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Tests ---

describe("buildSystemPrompt", () => {
  it("includes runner profile and pace zones", () => {
    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events: [],
    });

    expect(prompt).toContain("Type 1 Diabetic");
    expect(prompt).toContain("LTHR 168 bpm, Max HR 189 bpm");
    expect(prompt).toContain("~7:15/km");
    expect(prompt).toContain("111-131 bpm");
    expect(prompt).toContain("Build (week 5, 28% through plan)");
  });

  it("shows no BG model message when bgModel is null", () => {
    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events: [],
    });

    expect(prompt).toContain("No BG model data available yet.");
  });

  it("includes BG category data when bgModel is populated", () => {
    const bgModel = makeBGModel({
      activitiesAnalyzed: 5,
      categories: {
        easy: {
          category: "easy",
          avgRate: -0.45,
          medianRate: -0.4,
          sampleCount: 15,
          confidence: "medium",
          avgFuelRate: 48,
          activityCount: 5,
        },
        long: null,
        interval: null,
      },
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events: [],
    });

    expect(prompt).toContain("Activities analyzed: 5");
    expect(prompt).toContain("easy: avg BG change -0.45 mmol/L per 10min");
    expect(prompt).toContain("medium confidence, 5 activities");
    expect(prompt).toContain("avg fuel 48g/h");
  });

  it("includes BG by start level in prompt", () => {
    const bgModel = makeBGModel({
      bgByStartLevel: [
        { band: "8-10", avgRate: -0.6, medianRate: -0.5, sampleCount: 10, activityCount: 3 },
        { band: "10-12", avgRate: -0.3, medianRate: -0.25, sampleCount: 8, activityCount: 2 },
      ],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events: [],
    });

    expect(prompt).toContain("BG response by starting level:");
    expect(prompt).toContain("Start 8-10 mmol/L: avg -0.60 mmol/L per 10min (3 activities)");
    expect(prompt).toContain("Start 10-12 mmol/L: avg -0.30 mmol/L per 10min (2 activities)");
  });

  it("includes BG by time buckets in prompt", () => {
    const bgModel = makeBGModel({
      bgByTime: [
        { bucket: "0-15", avgRate: -0.2, medianRate: -0.15, sampleCount: 20 },
        { bucket: "15-30", avgRate: -0.7, medianRate: -0.65, sampleCount: 18 },
      ],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events: [],
    });

    expect(prompt).toContain("BG response by time into run:");
    expect(prompt).toContain("0-15min: avg -0.20 mmol/L per 10min (20 samples)");
    expect(prompt).toContain("15-30min: avg -0.70 mmol/L per 10min (18 samples)");
  });

  it("includes BG by entry slope in prompt", () => {
    const bgModel = makeBGModel({
      bgByEntrySlope: [
        { slope: "dropping", avgRate: -1.2, medianRate: -1.1, sampleCount: 8, activityCount: 3 },
        { slope: "stable", avgRate: -0.5, medianRate: -0.4, sampleCount: 12, activityCount: 4 },
      ],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events: [],
    });

    expect(prompt).toContain("BG response by entry slope (pre-run trend):");
    expect(prompt).toContain("Entry dropping: avg -1.20 mmol/L per 10min (3 activities)");
    expect(prompt).toContain("Entry stable: avg -0.50 mmol/L per 10min (4 activities)");
  });

  it("includes entry slope in per-workout BG data", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({
        activityId: "run1",
        date: yesterday,
        name: "Easy Run eco16",
      }),
    ];

    const bgModel = makeBGModel({
      observations: [
        makeObs({ activityId: "run1", startBG: 10.5, bgRate: -0.6, entrySlope: -0.8 }),
      ],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events,
    });

    expect(prompt).toContain("startBG 10.5 (entry -0.8/10m)");
  });

  it("includes target fuel rate suggestions", () => {
    const bgModel = makeBGModel({
      targetFuelRates: [
        {
          category: "easy",
          targetFuelRate: 55,
          currentAvgFuel: 48,
          method: "extrapolation",
          confidence: "medium",
        },
      ],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events: [],
    });

    expect(prompt).toContain("Suggested fuel for easy: 55g/h");
    expect(prompt).toContain("current avg: 48g/h");
    expect(prompt).toContain("medium confidence, extrapolation");
  });

  it("includes per-workout BG data from bgModel observations", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({
        id: "activity-run1",
        activityId: "run1",
        date: yesterday,
        name: "Easy Run eco16",
        distance: 7500,
        pace: 7.2,
        avgHr: 125,
      }),
    ];

    const bgModel = makeBGModel({
      observations: [
        makeObs({ activityId: "run1", startBG: 10.5, bgRate: -0.6 }),
        makeObs({ activityId: "run1", startBG: 10.5, bgRate: -0.8 }),
        makeObs({ activityId: "run1", startBG: 10.5, bgRate: -0.4 }),
      ],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events,
    });

    expect(prompt).toContain("startBG 10.5");
    expect(prompt).toContain("BG rate -0.60/10min");
  });

  it("does not include BG data for workouts without matching observations", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({
        id: "activity-run1",
        activityId: "run1",
        date: yesterday,
        name: "Easy Run eco16",
      }),
    ];

    // Observations for a different activity
    const bgModel = makeBGModel({
      observations: [makeObs({ activityId: "run999", startBG: 9.0 })],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events,
    });

    expect(prompt).not.toContain("startBG");
    expect(prompt).not.toContain("BG rate");
  });

  it("falls back to id-based activityId extraction when activityId is missing", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({
        id: "activity-run1",
        activityId: undefined,
        date: yesterday,
        name: "Easy Run eco16",
      }),
    ];

    const bgModel = makeBGModel({
      observations: [makeObs({ activityId: "run1", startBG: 11.0, bgRate: -0.5 })],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events,
    });

    expect(prompt).toContain("startBG 11.0");
  });

  it("shows positive sign for rising BG rate", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday }),
    ];

    const bgModel = makeBGModel({
      observations: [makeObs({ activityId: "run1", bgRate: 0.3 })],
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel,
      events,
    });

    expect(prompt).toContain("BG rate +0.30/10min");
  });

  it("includes fitness load data when insights provided", () => {
    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: makeInsights({ currentCtl: 20, currentAtl: 25, currentTsb: -5 }),
      bgModel: null,
      events: [],
    });

    expect(prompt).toContain("CTL (fitness): 20");
    expect(prompt).toContain("ATL (fatigue): 25");
    expect(prompt).toContain("TSB (form): -5");
  });

  it("shows fallback when no insights", () => {
    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events: [],
    });

    expect(prompt).toContain("Fitness data not loaded.");
  });

  it("includes completed workout details", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({
        date: yesterday,
        name: "Easy + Strides eco16",
        distance: 7900,
        pace: 7.35,
        avgHr: 128,
        load: 42,
        carbsIngested: 32,
      }),
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
    });

    expect(prompt).toContain("Easy + Strides eco16");
    expect(prompt).toContain("7.9km");
    expect(prompt).toContain("avgHR 128");
    expect(prompt).toContain("load 42");
    expect(prompt).toContain("carbs 32g");
  });

  it("includes upcoming planned workouts", () => {
    const tomorrow = new Date("2026-02-20T10:00:00Z");

    const events: CalendarEvent[] = [
      makeEvent({
        date: tomorrow,
        name: "Thu Short Intervals eco16",
        type: "planned",
        category: "interval",
        fuelRate: 30,
      }),
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
    });

    expect(prompt).toContain("Thu Short Intervals eco16");
    expect(prompt).toContain("(interval)");
    expect(prompt).toContain("fuel 30g/h");
  });

  it("excludes workouts older than 14 days from completed section", () => {
    const oldEvent = makeEvent({
      date: new Date("2026-02-01T10:00:00Z"),
      name: "Old Run eco16",
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events: [oldEvent],
    });

    expect(prompt).not.toContain("Old Run eco16");
    expect(prompt).toContain("No completed workouts in the last 14 days.");
  });

  it("limits completed workouts to 10", () => {
    const events: CalendarEvent[] = Array.from({ length: 15 }, (_, i) => {
      const d = new Date("2026-02-18T10:00:00Z");
      d.setHours(d.getHours() - i);
      return makeEvent({ id: `activity-r${i}`, activityId: `r${i}`, date: d, name: `Run ${i}` });
    });

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
    });

    // Should include 10, exclude 5
    expect(prompt).toContain("Run 0");
    expect(prompt).toContain("Run 9");
    expect(prompt).not.toContain("Run 10");
  });

  it("includes entry/recovery context when runBGContexts provided", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({
        activityId: "run1",
        date: yesterday,
        name: "Easy Run eco16",
      }),
    ];

    const runBGContexts = new Map<string, RunBGContext>([
      ["run1", {
        activityId: "run1",
        category: "easy",
        pre: { entrySlope30m: -0.3, entryStability: 0.2, startBG: 10, readingCount: 6 },
        post: { recoveryDrop30m: -1.5, nadirPostRun: 4.8, timeToStable: 25, postRunHypo: false, endBG: 7.5, readingCount: 8 },
        totalBGImpact: -5,
      }],
    ]);

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
      runBGContexts,
    });

    expect(prompt).toContain("entry: -0.3/10m (stable)");
    expect(prompt).toContain("recovery 30m: -1.5, lowest post-run 4.8");
  });

  it("appends HYPO! flag when post-run hypo", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday }),
    ];

    const runBGContexts = new Map<string, RunBGContext>([
      ["run1", {
        activityId: "run1",
        category: "easy",
        pre: null,
        post: { recoveryDrop30m: -2.5, nadirPostRun: 3.5, timeToStable: null, postRunHypo: true, endBG: 6.0, readingCount: 8 },
        totalBGImpact: null,
      }],
    ]);

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
      runBGContexts,
    });

    expect(prompt).toContain("HYPO!");
  });

  it("no entry/recovery text when runBGContexts is empty", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday }),
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
    });

    expect(prompt).not.toContain("entry:");
    expect(prompt).not.toContain("recovery 30m:");
  });

  it("includes Post-Run Recovery Patterns section when data exists", () => {
    const runBGContexts = new Map<string, RunBGContext>([
      ["r1", {
        activityId: "r1",
        category: "easy",
        pre: null,
        post: { recoveryDrop30m: -0.5, nadirPostRun: 5.8, timeToStable: 10, postRunHypo: false, endBG: 7, readingCount: 5 },
        totalBGImpact: null,
      }],
      ["r2", {
        activityId: "r2",
        category: "long",
        pre: null,
        post: { recoveryDrop30m: -1.8, nadirPostRun: 4.2, timeToStable: null, postRunHypo: true, endBG: 6, readingCount: 8 },
        totalBGImpact: null,
      }],
    ]);

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events: [],
      runBGContexts,
    });

    expect(prompt).toContain("## Post-Run Recovery Patterns");
    expect(prompt).toContain("easy: avg 30m recovery -0.5 mmol/L, avg lowest post-run 5.8, 0/1 post-hypos");
    expect(prompt).toContain("long: avg 30m recovery -1.8 mmol/L, avg lowest post-run 4.2, 1/1 post-hypos (!)");
  });

  it("omits recovery section when runBGContexts is undefined", () => {
    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events: [],
    });

    expect(prompt).not.toContain("Post-Run Recovery Patterns");
  });
});

// --- summarizeRecoveryPatterns ---

describe("summarizeRecoveryPatterns", () => {
  it("groups by category correctly", () => {
    const contexts = new Map<string, RunBGContext>([
      ["r1", { activityId: "r1", category: "easy", pre: null, post: { recoveryDrop30m: -0.5, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7, readingCount: 5 }, totalBGImpact: null }],
      ["r2", { activityId: "r2", category: "easy", pre: null, post: { recoveryDrop30m: -0.7, nadirPostRun: 5.5, timeToStable: 15, postRunHypo: false, endBG: 6.5, readingCount: 5 }, totalBGImpact: null }],
      ["r3", { activityId: "r3", category: "long", pre: null, post: { recoveryDrop30m: -2.0, nadirPostRun: 4.0, timeToStable: null, postRunHypo: true, endBG: 5, readingCount: 8 }, totalBGImpact: null }],
    ]);

    const result = summarizeRecoveryPatterns(contexts);
    expect(result).toContain("easy:");
    expect(result).toContain("long:");
    expect(result).not.toContain("interval:");
  });

  it("calculates correct averages per category", () => {
    const contexts = new Map<string, RunBGContext>([
      ["r1", { activityId: "r1", category: "easy", pre: null, post: { recoveryDrop30m: -0.4, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7, readingCount: 5 }, totalBGImpact: null }],
      ["r2", { activityId: "r2", category: "easy", pre: null, post: { recoveryDrop30m: -0.6, nadirPostRun: 5.0, timeToStable: 15, postRunHypo: false, endBG: 6, readingCount: 5 }, totalBGImpact: null }],
    ]);

    const result = summarizeRecoveryPatterns(contexts);
    // avg drop: (-0.4 + -0.6) / 2 = -0.5
    expect(result).toContain("avg 30m recovery -0.5 mmol/L");
    // avg lowest post-run: (6.0 + 5.0) / 2 = 5.5
    expect(result).toContain("avg lowest post-run 5.5");
  });

  it("shows hypo counts as fraction", () => {
    const contexts = new Map<string, RunBGContext>([
      ["r1", { activityId: "r1", category: "long", pre: null, post: { recoveryDrop30m: -1.5, nadirPostRun: 3.5, timeToStable: null, postRunHypo: true, endBG: 5, readingCount: 8 }, totalBGImpact: null }],
      ["r2", { activityId: "r2", category: "long", pre: null, post: { recoveryDrop30m: -1.0, nadirPostRun: 5.0, timeToStable: 20, postRunHypo: false, endBG: 6, readingCount: 8 }, totalBGImpact: null }],
      ["r3", { activityId: "r3", category: "long", pre: null, post: { recoveryDrop30m: -2.0, nadirPostRun: 3.8, timeToStable: null, postRunHypo: true, endBG: 4, readingCount: 8 }, totalBGImpact: null }],
    ]);

    const result = summarizeRecoveryPatterns(contexts);
    expect(result).toContain("2/3 post-hypos (!)");
  });

  it("returns empty message when no contexts", () => {
    expect(summarizeRecoveryPatterns(undefined)).toBe("No post-run recovery data available yet.");
    expect(summarizeRecoveryPatterns(new Map())).toBe("No post-run recovery data available yet.");
  });

  it("returns empty message when all contexts have no post data", () => {
    const contexts = new Map<string, RunBGContext>([
      ["r1", { activityId: "r1", category: "easy", pre: { entrySlope30m: 0, entryStability: 0.2, startBG: 10, readingCount: 6 }, post: null, totalBGImpact: null }],
    ]);

    const result = summarizeRecoveryPatterns(contexts);
    expect(result).toBe("No post-run recovery data available yet.");
  });
});

// --- Feedback in completed workouts ---

describe("buildSystemPrompt with feedback", () => {
  it("includes feedback rating and comment inline with completed workout", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday, name: "Easy Run eco16" }),
    ];

    const recentFeedback: RunFeedbackRecord[] = [
      { email: "test@test.com", createdAt: yesterday.getTime(), activityId: "run1", rating: "bad", comment: "BG crashed hard" },
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
      recentFeedback,
    });

    expect(prompt).toContain("feedback: bad");
    expect(prompt).toContain('"BG crashed hard"');
  });

  it("includes feedback carbs inline with completed workout", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday, name: "Easy Run eco16" }),
    ];

    const recentFeedback: RunFeedbackRecord[] = [
      { email: "test@test.com", createdAt: yesterday.getTime(), activityId: "run1", rating: "good", carbsG: 45 },
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
      recentFeedback,
    });

    expect(prompt).toContain("feedback: good, 45g reported");
  });

  it("shows unmatched feedback in separate section", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday, name: "Easy Run eco16" }),
    ];

    const recentFeedback: RunFeedbackRecord[] = [
      { email: "test@test.com", createdAt: yesterday.getTime(), activityId: "run999", rating: "bad", comment: "BG crashed" },
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
      recentFeedback,
    });

    // Not inline with the run (different activityId)
    expect(prompt).not.toContain("feedback:");
    // But shown in "Other recent run feedback"
    expect(prompt).toContain("Other recent run feedback");
    expect(prompt).toContain("BG crashed");
  });

  it("works without feedback (undefined)", () => {
    const yesterday = new Date("2026-02-18T10:00:00Z");
    const events: CalendarEvent[] = [
      makeEvent({ activityId: "run1", date: yesterday, name: "Easy Run eco16" }),
    ];

    const prompt = buildSystemPrompt({
      phaseInfo: basePhaseInfo,
      insights: null,
      bgModel: null,
      events,
    });

    expect(prompt).not.toContain("feedback:");
    expect(prompt).toContain("Easy Run eco16");
  });
});
