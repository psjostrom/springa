import { describe, it, expect } from "vitest";
import {
  scoreBG,
  scoreHRZone,
  scoreEntryTrend,
  scoreRecovery,
  buildReportCard,
  parseExpectedRepTime,
  kovatchevLowRisk,
  computeLBGI,
  computeWorstRate,
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

function glucoseStream(values: number[], intervalMin = 5) {
  return values.map((value, i) => ({ time: i * intervalMin, value }));
}

// --- Kovatchev Risk Function ---

describe("kovatchevLowRisk", () => {
  it("returns 0 for glucose well above 6.25 mmol/L", () => {
    expect(kovatchevLowRisk(10.0)).toBe(0);
    expect(kovatchevLowRisk(8.0)).toBe(0);
  });

  it("returns increasing risk as glucose approaches hypo", () => {
    const risk6 = kovatchevLowRisk(6.0);
    const risk5 = kovatchevLowRisk(5.0);
    const risk4 = kovatchevLowRisk(4.0);
    const risk3 = kovatchevLowRisk(3.5);

    expect(risk5).toBeGreaterThan(risk6);
    expect(risk4).toBeGreaterThan(risk5);
    expect(risk3).toBeGreaterThan(risk4);
  });

  it("returns high risk at clinical hypo (3.9 mmol/L)", () => {
    expect(kovatchevLowRisk(3.9)).toBeGreaterThan(5);
  });

  it("returns very high risk at severe hypo (3.0 mmol/L)", () => {
    expect(kovatchevLowRisk(3.0)).toBeGreaterThan(15);
  });

  it("handles edge case of 0 or negative", () => {
    expect(kovatchevLowRisk(0)).toBe(0);
    expect(kovatchevLowRisk(-1)).toBe(0);
  });
});

describe("computeLBGI", () => {
  it("returns 0 for empty array", () => {
    expect(computeLBGI([])).toBe(0);
  });

  it("returns 0 for readings all above 7 mmol/L", () => {
    const glucose = glucoseStream([10, 9.5, 9, 8.5, 8]);
    expect(computeLBGI(glucose)).toBe(0);
  });

  it("returns higher LBGI when readings dip near hypo", () => {
    const safe = glucoseStream([8, 7.5, 7, 7.5, 8]);
    const danger = glucoseStream([8, 6, 4.5, 5, 6]);
    expect(computeLBGI(danger)).toBeGreaterThan(computeLBGI(safe));
  });
});

// --- Worst Rate ---

describe("computeWorstRate", () => {
  it("returns 0 for fewer than 2 points", () => {
    expect(computeWorstRate([])).toBe(0);
    expect(computeWorstRate([{ time: 0, value: 10 }])).toBe(0);
  });

  it("finds steepest drop in a 5-min window", () => {
    // Gentle start, then crash
    const glucose = [
      { time: 0, value: 10 },
      { time: 5, value: 9.5 },  // -0.1/min
      { time: 10, value: 8.0 }, // -0.3/min (steepest)
      { time: 15, value: 7.5 }, // -0.1/min
      { time: 20, value: 7.5 }, // flat
    ];
    expect(computeWorstRate(glucose)).toBeCloseTo(-0.3, 1);
  });

  it("returns 0 when glucose only rises", () => {
    const glucose = glucoseStream([6, 7, 8, 9, 10]);
    expect(computeWorstRate(glucose)).toBeGreaterThanOrEqual(0);
  });

  it("falls back to overall rate for very short traces", () => {
    // 2 points only 1 min apart (below 3-min window)
    const glucose = [
      { time: 0, value: 10 },
      { time: 1, value: 8 },
    ];
    const rate = computeWorstRate(glucose);
    expect(rate).toBeCloseTo(-2.0, 1);
  });

  it("works with per-minute readings (Libre 3)", () => {
    // Accelerating drop — worst 3-min window is steeper than full 5-min average
    const glucose = [
      { time: 0, value: 10 },
      { time: 1, value: 9.8 },
      { time: 2, value: 9.5 },
      { time: 3, value: 9.0 },
      { time: 4, value: 8.3 },
      { time: 5, value: 7.5 },
    ];
    // Steepest 3-min window: time 2→5 = (7.5-9.5)/3 = -0.667
    expect(computeWorstRate(glucose)).toBeCloseTo(-0.667, 1);
  });
});

// --- BG Scoring ---

describe("scoreBG", () => {
  it("returns null when no glucose data", () => {
    expect(scoreBG(makeEvent())).toBeNull();
  });

  it("returns null when only one glucose point", () => {
    const event = makeEvent({
      glucose: [{ time: 0, value: 8.0 }],
    });
    expect(scoreBG(event)).toBeNull();
  });

  it("rates good when BG is stable and above 6", () => {
    // 10.0 → 9.5 over 25 min, gentle drift
    const event = makeEvent({
      glucose: glucoseStream([10.0, 9.9, 9.8, 9.7, 9.6, 9.5]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("good");
    expect(result.startBG).toBe(10.0);
    expect(result.minBG).toBe(9.5);
    expect(result.hypo).toBe(false);
    expect(result.lbgi).toBe(0);
  });

  it("rates good when BG rises", () => {
    const event = makeEvent({
      glucose: glucoseStream([8.0, 9.0, 10.0]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("good");
    expect(result.worstRate).toBeGreaterThanOrEqual(0);
  });

  it("rates good for slow drift 14→8 over long run (Per's 'I am fine with that')", () => {
    // -6 mmol over 60 min = -0.1/min per window (just below dropping threshold)
    const event = makeEvent({
      glucose: glucoseStream([14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9, 8.5, 8]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("good");
    expect(result.minBG).toBe(8);
  });

  it("rates ok when steep drop from high to high (16→12 fast)", () => {
    // -4 mmol over 10 min = -0.4/min (crashing), but nadir is safe
    const event = makeEvent({
      glucose: glucoseStream([16, 14, 12], 5),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("ok");
    expect(result.minBG).toBe(12);
  });

  it("rates ok when dropping rate at safe levels (good→ok only)", () => {
    // -0.12/min (dropping) but nadir 8.8 (safe) → only downgrades good→ok
    const event = makeEvent({
      glucose: glucoseStream([9.4, 8.8], 5),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("ok");
    expect(result.minBG).toBe(8.8);
  });

  it("rates ok when nadir is below 6 but rate is mild", () => {
    // Slow drift to 5.5 — below comfort zone but not crashing
    const event = makeEvent({
      glucose: glucoseStream([8, 7.5, 7, 6.5, 6, 5.5]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("ok");
    expect(result.minBG).toBe(5.5);
  });

  it("rates bad when fast crash to low zone (9→5 fast)", () => {
    // -4 over 20 min = -0.2/min (crashing) + nadir in ok zone → bad
    const event = makeEvent({
      glucose: glucoseStream([9, 8, 7, 6, 5]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
    expect(result.minBG).toBe(5);
  });

  it("rates bad when minBG is hypo-adjacent (< 4.5)", () => {
    // Nadir below 4.5 = bad regardless of rate
    const event = makeEvent({
      glucose: glucoseStream([8, 7, 6, 5, 4.3]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
    expect(result.minBG).toBe(4.3);
  });

  it("rates bad on hypo even with mild drop rate", () => {
    const event = makeEvent({
      glucose: glucoseStream([4.0, 3.9, 3.8, 3.9, 4.0]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
    expect(result.hypo).toBe(true);
    expect(result.minBG).toBe(3.8);
  });

  it("rates bad for crash-and-recover (10→4→9) — the original bug", () => {
    // Endpoint-to-endpoint would say -0.02/min = "good"
    // New scoring: minBG 4.0 < 4.5 = bad
    const event = makeEvent({
      glucose: glucoseStream([10, 8, 6, 4, 5, 7, 9]),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
    expect(result.minBG).toBe(4);
    expect(result.lbgi).toBeGreaterThan(0);
  });

  it("rates bad for dropping rate + low nadir combo", () => {
    // -0.12/min (dropping, not crashing) + minBG 5.4 (below 6) → ok downgraded to bad
    const event = makeEvent({
      glucose: glucoseStream([6, 5.4], 5),
    });
    const result = scoreBG(event)!;
    expect(result.rating).toBe("bad");
  });

  it("detects hypo at exactly 3.9 as false", () => {
    const event = makeEvent({
      glucose: glucoseStream([5.0, 4.5, 4.0, 3.9, 4.0]),
    });
    const result = scoreBG(event)!;
    expect(result.hypo).toBe(false);
  });

  it("includes LBGI in the score", () => {
    const event = makeEvent({
      glucose: glucoseStream([10, 9.5, 9, 8.5, 8]),
    });
    const result = scoreBG(event)!;
    expect(result.lbgi).toBe(0); // all readings above ~6.25
  });

  it("LBGI increases with low readings", () => {
    const safe = makeEvent({ glucose: glucoseStream([10, 9, 8, 7, 7]) });
    const danger = makeEvent({ glucose: glucoseStream([8, 6, 4, 5, 6]) });
    expect(scoreBG(danger)!.lbgi).toBeGreaterThan(scoreBG(safe)!.lbgi);
  });

  it("14→10 different from 9→5 at same rate", () => {
    // Both drop 4 mmol over 20 min = -0.2/min
    const high = makeEvent({ glucose: glucoseStream([14, 13, 12, 11, 10]) });
    const low = makeEvent({ glucose: glucoseStream([9, 8, 7, 6, 5]) });

    const highScore = scoreBG(high)!;
    const lowScore = scoreBG(low)!;

    // High→high with crashing rate: ok (rate downgrades good→ok)
    expect(highScore.rating).toBe("ok");
    // Low→lower with crashing rate: bad (rate downgrades ok→bad)
    expect(lowScore.rating).toBe("bad");

    // LBGI should be much higher for the low run
    expect(lowScore.lbgi).toBeGreaterThan(highScore.lbgi);
  });
});

// --- HR Zone Scoring ---

describe("scoreHRZone", () => {
  it("returns null when no HR zone data", () => {
    expect(scoreHRZone(makeEvent())).toBeNull();
  });

  it("returns null when all zones are zero", () => {
    const event = makeEvent({ zoneTimes: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 } });
    expect(scoreHRZone(event)).toBeNull();
  });

  it("targets Z2 for easy runs", () => {
    const event = makeEvent({
      category: "easy",
      zoneTimes: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z2");
    expect(result.pctInTarget).toBeCloseTo((1800 / 2160) * 100);
    expect(result.rating).toBe("good");
  });

  it("targets Z2 for long runs", () => {
    const event = makeEvent({
      category: "long",
      zoneTimes: { z1: 100, z2: 2000, z3: 500, z4: 0, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z2");
  });

  it("returns null for interval without parseable description", () => {
    const event = makeEvent({
      category: "interval",
      zoneTimes: { z1: 100, z2: 300, z3: 200, z4: 800, z5: 100 },
    });
    expect(scoreHRZone(event)).toBeNull();
  });

  it("scores interval by rep compliance (actual Z4 vs expected rep time)", () => {
    // 4x4m = 960s expected. 600s actual Z4 = 62.5% → good
    const event = makeEvent({
      category: "interval",
      description: "Warmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set 4x\n- 4m 89-99% LTHR (150-167 bpm)\n- Walk 2m 50-66% LTHR (85-112 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)",
      zoneTimes: { z1: 360, z2: 900, z3: 480, z4: 600, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z4");
    expect(result.expectedRepSec).toBe(960);
    expect(result.pctInTarget).toBeCloseTo(62.5);
    expect(result.rating).toBe("good");
  });

  it("scores hills by rep compliance against Z5", () => {
    // 6x2m uphill = 720s expected Z5. 400s actual = 55.6% → ok
    const event = makeEvent({
      category: "interval",
      description: "Warmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set 6x\n- Uphill 2m 99-111% LTHR (167-188 bpm)\n- Downhill 3m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)",
      zoneTimes: { z1: 200, z2: 1200, z3: 300, z4: 200, z5: 400 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z5");
    expect(result.expectedRepSec).toBe(720);
    expect(result.pctInTarget).toBeCloseTo((400 / 720) * 100);
    expect(result.rating).toBe("ok");
  });

  it("rates bad when reps barely reached target zone", () => {
    // 4x4m = 960s expected. 120s actual Z4 = 12.5% → bad
    const event = makeEvent({
      category: "interval",
      description: "Main set 4x\n- 4m 89-99% LTHR (150-167 bpm)\n- Walk 2m 50-66% LTHR (85-112 bpm)",
      zoneTimes: { z1: 500, z2: 900, z3: 800, z4: 120, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.pctInTarget).toBeCloseTo(12.5);
    expect(result.rating).toBe("bad");
  });

  it("rates good when >= 60% in target", () => {
    const event = makeEvent({
      category: "easy",
      zoneTimes: { z1: 0, z2: 600, z3: 300, z4: 100, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.rating).toBe("good");
  });

  it("rates ok when 40-60% in target", () => {
    const event = makeEvent({
      category: "easy",
      zoneTimes: { z1: 100, z2: 500, z3: 300, z4: 100, z5: 0 },
    });
    const result = scoreHRZone(event)!;
    expect(result.rating).toBe("ok");
  });

  it("rates bad when < 40% in target", () => {
    const event = makeEvent({
      category: "easy",
      zoneTimes: { z1: 100, z2: 200, z3: 400, z4: 200, z5: 100 },
    });
    const result = scoreHRZone(event)!;
    expect(result.rating).toBe("bad");
  });

  it("uses Z2+Z3 for race category", () => {
    const event = makeEvent({
      category: "race",
      zoneTimes: { z1: 50, z2: 400, z3: 300, z4: 200, z5: 50 },
    });
    const result = scoreHRZone(event)!;
    expect(result.targetZone).toBe("Z2–3");
    expect(result.pctInTarget).toBeCloseTo((700 / 1000) * 100);
    expect(result.rating).toBe("good");
  });
});

// --- buildReportCard ---

describe("buildReportCard", () => {
  it("returns all null for planned event with no data", () => {
    const report = buildReportCard(makeEvent({ type: "completed" }));
    expect(report.bg).toBeNull();
    expect(report.hrZone).toBeNull();
  });

  it("populates bg and hrZone when data is available", () => {
    const event = makeEvent({
      glucose: glucoseStream([10, 9.8, 9.6, 9.4, 9.2]),
      zoneTimes: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
    });
    const report = buildReportCard(event);
    expect(report.bg).not.toBeNull();
    expect(report.hrZone).not.toBeNull();
  });

  it("handles partial data gracefully", () => {
    const event = makeEvent({
      zoneTimes: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
    });
    const report = buildReportCard(event);
    expect(report.bg).toBeNull();
    expect(report.hrZone).not.toBeNull();
  });

  it("populates entryTrend and recovery when RunBGContext provided", () => {
    const event = makeEvent({
      glucose: glucoseStream([10, 9.8, 9.6, 9.4, 9.2]),
      zoneTimes: { z1: 60, z2: 1800, z3: 300, z4: 0, z5: 0 },
    });
    const ctx: RunBGContext = {
      activityId: "test-1",
      category: "easy",
      pre: { entrySlope30m: -0.1, entryStability: 0.3, startBG: 10, readingCount: 6 },
      post: { recoveryDrop30m: -0.25, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8, peak30m: 7.5, spike30m: 0 },
      totalBGImpact: -4,
    };
    const report = buildReportCard(event, ctx);
    expect(report.bg).not.toBeNull();
    expect(report.hrZone).not.toBeNull();
    expect(report.entryTrend).not.toBeNull();
    expect(report.recovery).not.toBeNull();
  });

  it("entryTrend and recovery are null when no RunBGContext", () => {
    const event = makeEvent({
      glucose: glucoseStream([10, 9.8, 9.6, 9.4, 9.2]),
    });
    const report = buildReportCard(event);
    expect(report.entryTrend).toBeNull();
    expect(report.recovery).toBeNull();
  });

  it("handles partial RunBGContext (pre only)", () => {
    const ctx: RunBGContext = {
      activityId: "test-1",
      category: "easy",
      pre: { entrySlope30m: -0.1, entryStability: 0.3, startBG: 10, readingCount: 6 },
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
      post: { recoveryDrop30m: -0.25, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8, peak30m: 7.5, spike30m: 0 },
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

  it("mild drop (slope -0.05, stability 0.3) → ok, Dropping", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -0.05, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("ok");
    expect(score.label).toBe("Dropping");
  });

  it("mild rise (slope +0.05, stability 0.3) → ok, Rising", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: 0.05, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("ok");
    expect(score.label).toBe("Rising");
  });

  it("crashing entry (slope -0.15) → bad, Crashing", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -0.15, entryStability: 0.3, startBG: 10, readingCount: 6 });
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

  it("boundary: slope exactly -0.1 → ok (not bad)", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -0.1, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("ok");
  });

  it("boundary: slope exactly -0.03 → good (not ok)", () => {
    const ctx = makeCtxWithPre({ entrySlope30m: -0.03, entryStability: 0.3, startBG: 10, readingCount: 6 });
    const score = scoreEntryTrend(ctx)!;
    expect(score.rating).toBe("good");
  });
});

// --- Recovery Scoring ---

describe("scoreRecovery", () => {
  it("clean recovery (drop -0.25, nadir 6.0, no hypo) → good, Clean", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.25, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8, peak30m: 7.5, spike30m: 0 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("good");
    expect(score.label).toBe("Clean");
  });

  it("dipping (drop -0.75, nadir 4.3) → ok, Dipping", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.75, nadirPostRun: 4.3, timeToStable: 20, postRunHypo: false, endBG: 7.0, readingCount: 8, peak30m: 7.0, spike30m: 0 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("ok");
    expect(score.label).toBe("Dipping");
  });

  it("crashed (drop -1.25, nadir 3.5, hypo) → bad, Crashed", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -1.25, nadirPostRun: 3.5, timeToStable: null, postRunHypo: true, endBG: 6.0, readingCount: 8, peak30m: 6.0, spike30m: 0 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("bad");
    expect(score.label).toBe("Crashed");
  });

  it("post-hypo alone triggers bad even with mild drop", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.25, nadirPostRun: 3.8, timeToStable: null, postRunHypo: true, endBG: 7.0, readingCount: 8, peak30m: 7.0, spike30m: 0 });
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

  it("boundary: drop exactly -0.5 → good (not ok)", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.5, nadirPostRun: 6.0, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8, peak30m: 7.5, spike30m: 0 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("good");
  });

  it("boundary: nadir exactly 3.9 → bad", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.5, nadirPostRun: 3.9, timeToStable: 10, postRunHypo: false, endBG: 7.5, readingCount: 8, peak30m: 7.5, spike30m: 0 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("bad");
  });

  it("boundary: nadir 4.5 → ok (not good)", () => {
    const ctx = makeCtxWithPost({ recoveryDrop30m: -0.75, nadirPostRun: 4.5, timeToStable: 15, postRunHypo: false, endBG: 7.0, readingCount: 8, peak30m: 7.0, spike30m: 0 });
    const score = scoreRecovery(ctx)!;
    expect(score.rating).toBe("ok");
  });
});

// --- parseExpectedRepTime ---

describe("parseExpectedRepTime", () => {
  it("parses short intervals (6x 2m at Z4)", () => {
    const desc = "Short intervals.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set 6x\n- 2m 89-99% LTHR (150-167 bpm)\n- Walk 2m 50-66% LTHR (85-112 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)";
    const result = parseExpectedRepTime(desc)!;
    expect(result.repCount).toBe(6);
    expect(result.repDurationSec).toBe(120);
    expect(result.totalRepSec).toBe(720);
    expect(result.targetZone).toBe("Z4");
  });

  it("parses long intervals (4x 5m at Z4)", () => {
    const desc = "Main set 4x\n- 5m 89-99% LTHR (150-167 bpm)\n- Walk 2m 50-66% LTHR (85-112 bpm)";
    const result = parseExpectedRepTime(desc)!;
    expect(result.repCount).toBe(4);
    expect(result.repDurationSec).toBe(300);
    expect(result.totalRepSec).toBe(1200);
    expect(result.targetZone).toBe("Z4");
  });

  it("parses hills (6x 2m uphill at Z5)", () => {
    const desc = "Main set 6x\n- Uphill 2m 99-111% LTHR (167-188 bpm)\n- Downhill 3m 66-78% LTHR (112-132 bpm)";
    const result = parseExpectedRepTime(desc)!;
    expect(result.repCount).toBe(6);
    expect(result.repDurationSec).toBe(120);
    expect(result.totalRepSec).toBe(720);
    expect(result.targetZone).toBe("Z5");
  });

  it("parses strides (4x 20s at Z5)", () => {
    const desc = "Easy run with strides.\n\nStrides 4x\n- 20s 99-111% LTHR (167-188 bpm)\n- 1m 66-78% LTHR (112-132 bpm)";
    const result = parseExpectedRepTime(desc)!;
    expect(result.repCount).toBe(4);
    expect(result.repDurationSec).toBe(20);
    expect(result.totalRepSec).toBe(80);
    expect(result.targetZone).toBe("Z5");
  });

  it("returns null for easy run (no main set)", () => {
    const desc = "Easy run at easy pace.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 20m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)";
    expect(parseExpectedRepTime(desc)).toBeNull();
  });

  it("returns null for empty description", () => {
    expect(parseExpectedRepTime("")).toBeNull();
  });
});
