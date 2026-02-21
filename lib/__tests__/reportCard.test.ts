import { describe, it, expect } from "vitest";
import {
  scoreBG,
  scoreHRZone,
  scoreFuel,
  scoreEntryTrend,
  scoreRecovery,
  buildReportCard,
} from "../reportCard";
import type { CalendarEvent } from "../types";
import type { RunBGContext, PreRunContext, PostRunContext } from "../runBGContext";

// --- Helpers ---

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-1",
    date: new Date("2026-02-15"),
    name: "Test Run",
    description: "",
    type: "completed",
    category: "easy",
    ...overrides,
  };
}

function glucoseStream(values: number[], intervalSec = 300) {
  return values.map((value, i) => ({ time: i * intervalSec, value }));
}

// --- BG Scoring ---

describe("scoreBG", () => {
  it("returns null when no glucose data", () => {
    expect(scoreBG(makeEvent())).toBeNull();
  });

  it("returns null when only one glucose point", () => {
    const event = makeEvent({
      streamData: { glucose: [{ time: 0, value: 8.0 }] },
    });
    expect(scoreBG(event)).toBeNull();
  });

  it("rates good when BG is stable", () => {
    // 10.0 → 9.5 over 30 min (6 points, 5 min apart) = -0.5 / 3 units of 10m = -0.167/10m
    const event = makeEvent({
      streamData: { glucose: glucoseStream([10.0, 9.9, 9.8, 9.7, 9.6, 9.5]) },
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("good");
    expect(result.startBG).toBe(10.0);
    expect(result.minBG).toBe(9.5);
    expect(result.hypo).toBe(false);
  });

  it("rates good when BG rises", () => {
    const event = makeEvent({
      streamData: { glucose: glucoseStream([8.0, 9.0, 10.0]) },
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("good");
    expect(result.dropRate).toBeGreaterThan(0);
  });

  it("rates ok when drop rate is between -1.0 and -2.0", () => {
    // Drop 3.0 over 20 min (5 points, 5 min apart = 20 min = 2 units of 10m)
    // rate = -3.0 / 2 = -1.5/10m
    const event = makeEvent({
      streamData: { glucose: glucoseStream([10.0, 9.25, 8.5, 7.75, 7.0]) },
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("ok");
    expect(result.dropRate).toBeCloseTo(-1.5);
  });

  it("rates bad when drop rate exceeds -2.0", () => {
    // Drop 5.0 over 20 min = -2.5/10m
    const event = makeEvent({
      streamData: { glucose: glucoseStream([12.0, 10.75, 9.5, 8.25, 7.0]) },
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
  });

  it("rates bad on hypo even with mild drop rate", () => {
    // Barely any drop but hits 3.8
    const event = makeEvent({
      streamData: { glucose: glucoseStream([4.0, 3.9, 3.8, 3.9, 4.0]) },
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
    expect(result.hypo).toBe(true);
    expect(result.minBG).toBe(3.8);
  });

  it("detects hypo at exactly 3.9 as false", () => {
    // 3.9 is NOT hypo (< 3.9 is hypo)
    const event = makeEvent({
      streamData: { glucose: glucoseStream([5.0, 4.5, 4.0, 3.9, 4.0]) },
    });
    const result = scoreBG(event)!;
    expect(result.hypo).toBe(false);
  });

  it("calculates dropRate correctly with non-standard intervals", () => {
    // 2 points, 600 sec apart (10 min), drop of 2.0
    const event = makeEvent({
      streamData: {
        glucose: [
          { time: 0, value: 10.0 },
          { time: 600, value: 8.0 },
        ],
      },
    });
    const result = scoreBG(event)!;
    expect(result.dropRate).toBeCloseTo(-2.0);
    expect(result.rating).toBe("ok"); // exactly -2.0 is boundary — "bad" requires < -2.0
  });

  it("handles zero-duration edge case", () => {
    const event = makeEvent({
      streamData: {
        glucose: [
          { time: 0, value: 10.0 },
          { time: 0, value: 9.0 },
        ],
      },
    });
    const result = scoreBG(event)!;
    expect(result.dropRate).toBe(0);
  });
});

// --- HR Zone Scoring ---

describe("scoreHRZone", () => {
  it("returns null when no HR zone data", () => {
    expect(scoreHRZone(makeEvent())).toBeNull();
  });

  it("returns null when all zones are zero", () => {
    const event = makeEvent({ hrZones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 } });
    expect(scoreHRZone(event)).toBeNull();
  });

  it("targets Z2 for easy runs", () => {
    const event = makeEvent({
      category: "easy",
      hrZones: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z2");
    expect(result.pctInTarget).toBeCloseTo((1800 / 2160) * 100);
    expect(result.rating).toBe("good");
  });

  it("targets Z2 for long runs", () => {
    const event = makeEvent({
      category: "long",
      hrZones: { z1: 100, z2: 2000, z3: 500, z4: 0, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z2");
  });

  it("targets Z4 for interval sessions", () => {
    const event = makeEvent({
      category: "interval",
      hrZones: { z1: 100, z2: 300, z3: 200, z4: 800, z5: 100 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z4");
    expect(result.pctInTarget).toBeCloseTo((800 / 1500) * 100);
  });

  it("rates good when >= 60% in target", () => {
    const event = makeEvent({
      category: "easy",
      hrZones: { z1: 0, z2: 600, z3: 300, z4: 100, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.rating).toBe("good");
  });

  it("rates ok when 40-60% in target", () => {
    const event = makeEvent({
      category: "easy",
      hrZones: { z1: 100, z2: 500, z3: 300, z4: 100, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.rating).toBe("ok");
  });

  it("rates bad when < 40% in target", () => {
    const event = makeEvent({
      category: "easy",
      hrZones: { z1: 100, z2: 200, z3: 400, z4: 200, z5: 100 },
    });
    const result = scoreHRZone(event)!;
    expect(result.rating).toBe("bad");
  });

  it("uses Z2+Z3 for race category", () => {
    const event = makeEvent({
      category: "race",
      hrZones: { z1: 50, z2: 400, z3: 300, z4: 200, z5: 50 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z2–3");
    expect(result.pctInTarget).toBeCloseTo((700 / 1000) * 100);
    expect(result.rating).toBe("good");
  });
});

// --- Fuel Scoring ---

describe("scoreFuel", () => {
  it("returns null when no actual carbs", () => {
    const event = makeEvent({ totalCarbs: 60, carbsIngested: null });
    expect(scoreFuel(event)).toBeNull();
  });

  it("returns null when no planned carbs", () => {
    const event = makeEvent({ totalCarbs: null, carbsIngested: 45 });
    expect(scoreFuel(event)).toBeNull();
  });

  it("returns null when planned carbs is zero", () => {
    const event = makeEvent({ totalCarbs: 0, carbsIngested: 30 });
    expect(scoreFuel(event)).toBeNull();
  });

  it("rates good at 100%", () => {
    const event = makeEvent({ totalCarbs: 60, carbsIngested: 60 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("good");
    expect(result.pct).toBeCloseTo(100);
  });

  it("rates good at 80% boundary", () => {
    const event = makeEvent({ totalCarbs: 50, carbsIngested: 40 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("good");
  });

  it("rates good at 120% boundary", () => {
    const event = makeEvent({ totalCarbs: 50, carbsIngested: 60 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("good");
  });

  it("rates ok at 70%", () => {
    const event = makeEvent({ totalCarbs: 100, carbsIngested: 70 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("ok");
  });

  it("rates ok at 140%", () => {
    const event = makeEvent({ totalCarbs: 50, carbsIngested: 70 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("ok");
  });

  it("rates bad below 60%", () => {
    const event = makeEvent({ totalCarbs: 100, carbsIngested: 50 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("bad");
    expect(result.pct).toBeCloseTo(50);
  });

  it("rates bad above 150%", () => {
    const event = makeEvent({ totalCarbs: 40, carbsIngested: 65 });
    const result = scoreFuel(event)!;
    expect(result.rating).toBe("bad");
  });
});

// --- buildReportCard ---

describe("buildReportCard", () => {
  it("returns all null for planned event with no data", () => {
    const report = buildReportCard(makeEvent({ type: "completed" }));
    expect(report.bg).toBeNull();
    expect(report.hrZone).toBeNull();
    expect(report.fuel).toBeNull();
  });

  it("populates all three scores when data is available", () => {
    const event = makeEvent({
      streamData: { glucose: glucoseStream([10, 9.8, 9.6, 9.4, 9.2]) },
      hrZones: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
      totalCarbs: 60,
      carbsIngested: 55,
    });
    const report = buildReportCard(event);
    expect(report.bg).not.toBeNull();
    expect(report.hrZone).not.toBeNull();
    expect(report.fuel).not.toBeNull();
  });

  it("handles partial data gracefully", () => {
    const event = makeEvent({
      hrZones: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
    });
    const report = buildReportCard(event);
    expect(report.bg).toBeNull();
    expect(report.hrZone).not.toBeNull();
    expect(report.fuel).toBeNull();
  });

  it("populates entryTrend and recovery when RunBGContext provided", () => {
    const event = makeEvent({
      streamData: { glucose: glucoseStream([10, 9.8, 9.6, 9.4, 9.2]) },
      hrZones: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
      totalCarbs: 60,
      carbsIngested: 55,
    });
    const ctx: RunBGContext = {
      activityId: "test-1",
      category: "easy",
      pre: { entrySlope30m: -0.2, entryStability: 0.3, startBG: 10, readingCount: 6 },
      post: { recoveryDrop30m: -0.5, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8 },
      totalBGImpact: -4,
    };
    const report = buildReportCard(event, ctx);
    expect(report.bg).not.toBeNull();
    expect(report.hrZone).not.toBeNull();
    expect(report.fuel).not.toBeNull();
    expect(report.entryTrend).not.toBeNull();
    expect(report.recovery).not.toBeNull();
  });

  it("entryTrend and recovery are null when no RunBGContext", () => {
    const event = makeEvent({
      streamData: { glucose: glucoseStream([10, 9.8, 9.6, 9.4, 9.2]) },
    });
    const report = buildReportCard(event);
    expect(report.entryTrend).toBeNull();
    expect(report.recovery).toBeNull();
  });

  it("handles partial RunBGContext (pre only)", () => {
    const ctx: RunBGContext = {
      activityId: "test-1",
      category: "easy",
      pre: { entrySlope30m: -0.2, entryStability: 0.3, startBG: 10, readingCount: 6 },
      post: null,
      totalBGImpact: null,
    };
    const report = buildReportCard(makeEvent(), ctx);
    expect(report.entryTrend).not.toBeNull();
    expect(report.recovery).toBeNull();
  });

  it("handles partial RunBGContext (post only)", () => {
    const ctx: RunBGContext = {
      activityId: "test-1",
      category: "easy",
      pre: null,
      post: { recoveryDrop30m: -0.5, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8 },
      totalBGImpact: null,
    };
    const report = buildReportCard(makeEvent(), ctx);
    expect(report.entryTrend).toBeNull();
    expect(report.recovery).not.toBeNull();
  });
});

// --- Entry Trend Scoring ---

function makeCtxWithPre(pre: PreRunContext): RunBGContext {
  return {
    activityId: "test",
    category: "easy",
    pre,
    post: null,
    totalBGImpact: null,
  };
}

function makeCtxWithPost(post: PostRunContext): RunBGContext {
  return {
    activityId: "test",
    category: "easy",
    pre: null,
    post,
    totalBGImpact: null,
  };
}

describe("scoreEntryTrend", () => {
  it("stable entry (slope 0, stability 0.2) → good, Stable", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: 0, entryStability: 0.2, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("good");
    expect(score.label).toBe("Stable");
  });

  it("mild drop (slope -0.5, stability 0.3) → ok, Dropping", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -0.5, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("ok");
    expect(score.label).toBe("Dropping");
  });

  it("mild rise (slope +0.5, stability 0.3) → ok, Rising", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: 0.5, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("ok");
    expect(score.label).toBe("Rising");
  });

  it("crashing entry (slope -1.5) → bad, Crashing", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -1.5, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("bad");
    expect(score.label).toBe("Crashing");
  });

  it("volatile entry (stability 2.0) → bad, Volatile", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: 0, entryStability: 2.0, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("bad");
    expect(score.label).toBe("Volatile");
  });

  it("null pre context → returns null", () => {
    const ctx: RunBGContext = { activityId: "test", category: "easy", pre: null, post: null, totalBGImpact: null };
    expect(scoreEntryTrend(ctx)).toBeNull();
  });

  it("null ctx → returns null", () => {
    expect(scoreEntryTrend(null)).toBeNull();
    expect(scoreEntryTrend(undefined)).toBeNull();
  });

  it("boundary: slope exactly -1.0 → ok (not bad)", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -1.0, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("ok");
  });

  it("boundary: slope exactly -0.3 → good (not ok)", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -0.3, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("good");
  });
});

// --- Recovery Scoring ---

describe("scoreRecovery", () => {
  it("clean recovery (drop -0.5, nadir 6.0, no hypo) → good, Clean", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.5, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("good");
    expect(score.label).toBe("Clean");
  });

  it("dipping (drop -1.5, nadir 4.3) → ok, Dipping", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -1.5, nadirPostRun: 4.3, timeToStable: 20, postRunHypo: false, endBG: 7.0, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("ok");
    expect(score.label).toBe("Dipping");
  });

  it("crashed (drop -2.5, nadir 3.5, hypo) → bad, Crashed", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -2.5, nadirPostRun: 3.5, timeToStable: null, postRunHypo: true, endBG: 6.0, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("bad");
    expect(score.label).toBe("Crashed");
  });

  it("post-hypo alone triggers bad even with mild drop", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.5, nadirPostRun: 3.8, timeToStable: null, postRunHypo: true, endBG: 7.0, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("bad");
    expect(score.label).toBe("Crashed");
  });

  it("null post context → returns null", () => {
    const ctx: RunBGContext = { activityId: "test", category: "easy", pre: null, post: null, totalBGImpact: null };
    expect(scoreRecovery(ctx)).toBeNull();
  });

  it("null ctx → returns null", () => {
    expect(scoreRecovery(null)).toBeNull();
    expect(scoreRecovery(undefined)).toBeNull();
  });

  it("boundary: drop exactly -1.0 → good (not ok)", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -1.0, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("good");
  });

  it("boundary: nadir exactly 3.9 → bad", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.5, nadirPostRun: 3.9, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("bad");
  });

  it("boundary: nadir 4.5 → ok (not good)", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -1.5, nadirPostRun: 4.5, timeToStable: 15, postRunHypo: false, endBG: 7.0, readingCount: 8 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("ok");
  });
});
