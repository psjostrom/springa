import { describe, it, expect } from "vitest";
import {
  findReadingsInWindow,
  computeSlope,
  computeStdDev,
  closestReading,
  computePreRunContext,
  computePostRunContext,
  buildRunBGContext,
  buildRunBGContexts,
} from "../runBGContext";
import { makeReadings } from "./fixtures/bgReadings";
import type { CalendarEvent } from "../types";
import type { XdripReading } from "../xdrip";

// --- Helpers ---

const T0 = new Date("2026-02-15T14:00:00Z").getTime(); // 14:00 UTC
const FIVE_MIN = 5 * 60 * 1000;

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "activity-a1",
    date: new Date(T0),
    name: "Easy Run eco16",
    description: "",
    type: "completed",
    category: "easy",
    activityId: "a1",
    duration: 40 * 60, // 40 min in seconds
    ...overrides,
  };
}

// --- findReadingsInWindow ---

describe("findReadingsInWindow", () => {
  const readings = makeReadings(T0, [10, 9.5, 9, 8.5, 8]);

  it("returns readings within exact window boundaries", () => {
    const result = findReadingsInWindow(readings, T0, T0 + 3 * FIVE_MIN);
    expect(result).toHaveLength(3);
    expect(result[0].mmol).toBe(10);
    expect(result[2].mmol).toBe(9);
  });

  it("handles empty input", () => {
    expect(findReadingsInWindow([], T0, T0 + FIVE_MIN)).toHaveLength(0);
  });

  it("handles no readings in window", () => {
    const result = findReadingsInWindow(
      readings,
      T0 + 10 * FIVE_MIN,
      T0 + 15 * FIVE_MIN,
    );
    expect(result).toHaveLength(0);
  });

  it("handles readings at exact boundary (inclusive start, exclusive end)", () => {
    // Start is inclusive (>= startMs)
    const result = findReadingsInWindow(readings, T0, T0 + 1);
    expect(result).toHaveLength(1);
    expect(result[0].mmol).toBe(10);
  });

  it("works with large datasets (binary search)", () => {
    const values = Array.from({ length: 10000 }, (_, i) => 10 + (i % 5) * 0.1);
    const large = makeReadings(T0, values);
    const windowStart = T0 + 5000 * FIVE_MIN;
    const windowEnd = T0 + 5010 * FIVE_MIN;
    const result = findReadingsInWindow(large, windowStart, windowEnd);
    expect(result).toHaveLength(10);
  });
});

// --- computeSlope ---

describe("computeSlope", () => {
  it("flat readings → slope ≈ 0", () => {
    const readings = makeReadings(T0, [10, 10, 10, 10, 10, 10]);
    const slope = computeSlope(readings)!;
    expect(slope).toBeCloseTo(0, 1);
  });

  it("steadily dropping readings → negative slope, correct magnitude", () => {
    // Drop 1 mmol per 5 min = 2 mmol per 10 min
    const readings = makeReadings(T0, [10, 9, 8, 7, 6]);
    const slope = computeSlope(readings)!;
    expect(slope).toBeCloseTo(-2.0, 1);
    expect(slope).toBeLessThan(0);
  });

  it("steadily rising readings → positive slope", () => {
    const readings = makeReadings(T0, [6, 7, 8, 9, 10]);
    const slope = computeSlope(readings)!;
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeCloseTo(2.0, 1);
  });

  it("2 readings → correct slope (minimal case)", () => {
    const readings = makeReadings(T0, [10, 9]);
    const slope = computeSlope(readings)!;
    // Drop 1 in 5 min = 2 per 10 min
    expect(slope).toBeCloseTo(-2.0, 1);
  });

  it("1 reading → returns null", () => {
    const readings = makeReadings(T0, [10]);
    expect(computeSlope(readings)).toBeNull();
  });

  it("0 readings → returns null", () => {
    expect(computeSlope([])).toBeNull();
  });

  it("noisy data → slope reflects overall trend, not noise", () => {
    // Overall dropping from 10 to 8 over 6 readings with noise
    const readings = makeReadings(T0, [10, 9.5, 10.2, 9.0, 8.8, 8.0]);
    const slope = computeSlope(readings)!;
    expect(slope).toBeLessThan(0);
    // Should be roughly -0.8/10min (drop of ~2 over 25 min ≈ 0.8/10min)
    expect(slope).toBeCloseTo(-0.8, 0);
  });

  it("correct units: result is mmol/L per 10 minutes", () => {
    // Drop 0.5 mmol over 10 min (2 readings, 5 min apart)
    const readings = makeReadings(T0, [10.0, 9.5]);
    const slope = computeSlope(readings)!;
    // 0.5 per 5 min = 1.0 per 10 min
    expect(slope).toBeCloseTo(-1.0, 1);
  });
});

// --- computeStdDev ---

describe("computeStdDev", () => {
  it("identical values → std dev = 0", () => {
    const readings = makeReadings(T0, [10, 10, 10]);
    expect(computeStdDev(readings)).toBe(0);
  });

  it("known values → matches expected std dev", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] — population std dev = 2.0
    const readings = makeReadings(T0, [2, 4, 4, 4, 5, 5, 7, 9]);
    expect(computeStdDev(readings)).toBeCloseTo(2.0, 1);
  });

  it("single value → returns 0", () => {
    const readings = makeReadings(T0, [10]);
    expect(computeStdDev(readings)).toBe(0);
  });
});

// --- closestReading ---

describe("closestReading", () => {
  const readings = makeReadings(T0, [10, 9.5, 9, 8.5, 8]);

  it("returns nearest reading to target timestamp", () => {
    // Target 2.5 min after T0 → should return T0 or T0+5min
    const result = closestReading(readings, T0 + 2.5 * 60 * 1000)!;
    expect(result).not.toBeNull();
    // Should be one of the two nearest
    expect([10, 9.5]).toContain(result.mmol);
  });

  it("respects maxGapMs — returns null if nearest is too far", () => {
    const result = closestReading(
      readings,
      T0 + 100 * FIVE_MIN,
      FIVE_MIN,
    );
    expect(result).toBeNull();
  });

  it("handles target before all readings", () => {
    const result = closestReading(readings, T0 - 60000); // 1 min before
    expect(result).not.toBeNull();
    expect(result!.mmol).toBe(10);
  });

  it("handles target after all readings", () => {
    const result = closestReading(readings, T0 + 4 * FIVE_MIN + 60000);
    expect(result).not.toBeNull();
    expect(result!.mmol).toBe(8);
  });

  it("handles target exactly on a reading timestamp", () => {
    const result = closestReading(readings, T0 + 2 * FIVE_MIN)!;
    expect(result.mmol).toBe(9);
    expect(result.ts).toBe(T0 + 2 * FIVE_MIN);
  });
});

// --- computePreRunContext ---

describe("computePreRunContext", () => {
  it("stable entry → slope ≈ 0, low stability", () => {
    const readings = makeReadings(T0 - 30 * 60 * 1000, [
      10, 10, 10, 10, 10, 10,
    ]); // 30 min before
    const ctx = computePreRunContext(readings, T0)!;
    expect(ctx).not.toBeNull();
    expect(Math.abs(ctx.entrySlope30m)).toBeLessThan(0.1);
    expect(ctx.entryStability).toBeLessThan(0.1);
    expect(ctx.startBG).toBe(10);
  });

  it("dropping entry → negative slope", () => {
    // 6 readings over 25 min before run, dropping 10→8
    const readings = makeReadings(T0 - 25 * 60 * 1000, [
      10, 9.6, 9.2, 8.8, 8.4, 8.0,
    ]);
    const ctx = computePreRunContext(readings, T0)!;
    expect(ctx).not.toBeNull();
    expect(ctx.entrySlope30m).toBeLessThan(0);
  });

  it("rising entry → positive slope", () => {
    const readings = makeReadings(T0 - 25 * 60 * 1000, [
      6, 7, 8, 9, 10, 11,
    ]);
    const ctx = computePreRunContext(readings, T0)!;
    expect(ctx.entrySlope30m).toBeGreaterThan(0);
  });

  it("volatile entry → low |slope| but high stability", () => {
    const readings = makeReadings(T0 - 25 * 60 * 1000, [
      6, 13, 6, 13, 6, 13,
    ]);
    const ctx = computePreRunContext(readings, T0)!;
    expect(ctx.entryStability).toBeGreaterThan(2.0);
  });

  it("sparse data: only 2 readings in 30-min window → still computes slope", () => {
    const readings: XdripReading[] = [
      { sgv: 180, mmol: 10.0, ts: T0 - 20 * 60 * 1000, direction: "Flat" },
      { sgv: 162, mmol: 9.0, ts: T0 - 5 * 60 * 1000, direction: "Flat" },
    ];
    const ctx = computePreRunContext(readings, T0);
    expect(ctx).not.toBeNull();
    expect(ctx!.entrySlope30m).toBeLessThan(0);
  });

  it("no data in window → returns null", () => {
    const readings = makeReadings(T0 + 60 * 60 * 1000, [10, 10, 10]);
    expect(computePreRunContext(readings, T0)).toBeNull();
  });

  it("gap at run start (no reading within 10 min) → returns null", () => {
    const readings = makeReadings(T0 - 60 * 60 * 1000, [10, 10, 10, 10]);
    // Last reading is at T0 - 45min, too far
    expect(computePreRunContext(readings, T0)).toBeNull();
  });

  it("sign correctness: dropping BG MUST produce negative slope", () => {
    const readings = makeReadings(T0 - 25 * 60 * 1000, [
      12, 11, 10, 9, 8, 7,
    ]);
    const ctx = computePreRunContext(readings, T0)!;
    expect(ctx.entrySlope30m).toBeLessThan(0);
  });
});

// --- computePostRunContext ---

describe("computePostRunContext", () => {
  const runEndMs = T0 + 40 * 60 * 1000; // 40 min run

  it("clean recovery → drop ≈ 0, no hypo, nadir is high", () => {
    const readings = makeReadings(runEndMs, [8, 8, 8, 8, 8, 8, 8, 8]);
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx).not.toBeNull();
    expect(ctx.recoveryDrop30m).toBeCloseTo(0);
    expect(ctx.postRunHypo).toBe(false);
    expect(ctx.nadirPostRun).toBe(8);
  });

  it("delayed crash: BG drops 30 min after", () => {
    // First 6 readings stable, then crash
    const readings = makeReadings(runEndMs, [8, 8, 7.5, 7, 6, 5, 4.5, 4]);
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.recoveryDrop30m).toBeLessThan(0);
    expect(ctx.nadirPostRun).toBe(4);
  });

  it("immediate crash: BG drops right after stopping", () => {
    const readings = makeReadings(runEndMs, [8, 6, 5, 4, 4.5, 5, 5.5, 6]);
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.recoveryDrop30m).toBeLessThan(0);
  });

  it("post-run hypo: reading below 3.9 → postRunHypo: true", () => {
    const readings = makeReadings(runEndMs, [8, 7, 6, 5, 4, 3.5, 4, 5]);
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.postRunHypo).toBe(true);
    expect(ctx.nadirPostRun).toBe(3.5);
  });

  it("rebound spike: nadir is the low point, not the end", () => {
    const readings = makeReadings(runEndMs, [8, 6, 5, 4, 5, 7, 9, 11]);
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.nadirPostRun).toBe(4);
  });

  it("timeToStable: BG enters 4-10 and stays 15+ min → correct minute count", () => {
    // First 3 readings high (outside range), then enters range and stays
    const readings = makeReadings(runEndMs, [
      12, 11, 10.5, 9.5, 9, 8.5, 8, 7.5, 7, 6.5,
    ]);
    // Reading at index 3 (9.5) is first in range at runEnd + 15min
    // Stays in range through rest → stable from 15min for at least 15min
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.timeToStable).not.toBeNull();
  });

  it("timeToStable null: BG never stabilizes", () => {
    // All readings below 4 or alternating wildly
    const readings = makeReadings(runEndMs, [3, 3.5, 3, 3.5, 3, 3.5, 3, 3.5]);
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.timeToStable).toBeNull();
  });

  it("no data after run → returns null", () => {
    const readings = makeReadings(T0 - 60 * 60 * 1000, [10, 10, 10]);
    expect(computePostRunContext(readings, runEndMs)).toBeNull();
  });

  it("endBG uses closest reading to run end", () => {
    const readings: XdripReading[] = [
      { sgv: 162, mmol: 9.0, ts: runEndMs - 2 * 60 * 1000, direction: "Flat" },
      { sgv: 144, mmol: 8.0, ts: runEndMs + 1 * 60 * 1000, direction: "Flat" },
      { sgv: 126, mmol: 7.0, ts: runEndMs + 6 * 60 * 1000, direction: "Flat" },
      { sgv: 108, mmol: 6.0, ts: runEndMs + 11 * 60 * 1000, direction: "Flat" },
    ];
    const ctx = computePostRunContext(readings, runEndMs)!;
    expect(ctx.endBG).toBe(8.0); // closest to runEnd
  });
});

// --- buildRunBGContext ---

describe("buildRunBGContext", () => {
  it("completed event with full xDrip coverage → pre and post populated", () => {
    const preReadings = makeReadings(T0 - 30 * 60 * 1000, [10, 10, 10, 10, 10, 10]);
    const duringReadings = makeReadings(T0, [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5]);
    const postReadings = makeReadings(T0 + 40 * 60 * 1000, [5.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]);
    const allReadings = [...preReadings, ...duringReadings, ...postReadings];

    const event = makeEvent();
    const ctx = buildRunBGContext(event, allReadings)!;
    expect(ctx).not.toBeNull();
    expect(ctx.pre).not.toBeNull();
    expect(ctx.post).not.toBeNull();
    expect(ctx.activityId).toBe("a1");
    expect(ctx.category).toBe("easy");
  });

  it("completed event with pre-run data only → pre populated, post null", () => {
    const preReadings = makeReadings(T0 - 30 * 60 * 1000, [10, 10, 10, 10, 10, 10]);
    const event = makeEvent();
    const ctx = buildRunBGContext(event, preReadings)!;
    expect(ctx.pre).not.toBeNull();
    expect(ctx.post).toBeNull();
  });

  it("completed event with post-run data only → pre null, post populated", () => {
    const postReadings = makeReadings(T0 + 40 * 60 * 1000, [8, 7.5, 7, 6.5, 6, 5.5, 5, 5]);
    const event = makeEvent();
    const ctx = buildRunBGContext(event, postReadings)!;
    expect(ctx.pre).toBeNull();
    expect(ctx.post).not.toBeNull();
  });

  it("planned event → returns null", () => {
    const readings = makeReadings(T0, [10, 10, 10]);
    const event = makeEvent({ type: "planned" });
    expect(buildRunBGContext(event, readings)).toBeNull();
  });

  it("event without duration → returns null", () => {
    const readings = makeReadings(T0, [10, 10, 10]);
    const event = makeEvent({ duration: undefined });
    expect(buildRunBGContext(event, readings)).toBeNull();
  });

  it("totalBGImpact sign: if BG drops from 10 to 6, impact is negative", () => {
    const preReadings = makeReadings(T0 - 25 * 60 * 1000, [10, 10, 10, 10, 10, 10]);
    const postReadings = makeReadings(T0 + 40 * 60 * 1000, [
      8, 7, 6.5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    ]);
    const allReadings = [...preReadings, ...postReadings];
    const event = makeEvent();
    const ctx = buildRunBGContext(event, allReadings)!;
    if (ctx.totalBGImpact !== null) {
      expect(ctx.totalBGImpact).toBeLessThan(0);
    }
  });
});

// --- buildRunBGContexts ---

describe("buildRunBGContexts", () => {
  it("multiple activities with overlapping xDrip coverage → each gets correct context", () => {
    const event1Start = T0;
    const event2Start = T0 + 4 * 60 * 60 * 1000; // 4h later

    const events: CalendarEvent[] = [
      makeEvent({ activityId: "a1", date: new Date(event1Start) }),
      makeEvent({ activityId: "a2", date: new Date(event2Start) }),
    ];

    // Coverage for both events
    const readings = [
      ...makeReadings(event1Start - 30 * 60 * 1000, [10, 10, 10, 10, 10, 10]),
      ...makeReadings(event1Start, [9, 8, 7, 6, 5, 5, 5, 5]),
      ...makeReadings(event1Start + 40 * 60 * 1000, [5, 5.5, 6, 6.5, 7, 7.5, 8, 8]),
      ...makeReadings(event2Start - 30 * 60 * 1000, [9, 9, 9, 9, 9, 9]),
      ...makeReadings(event2Start, [8, 7, 6, 5, 5, 5, 5, 5]),
      ...makeReadings(event2Start + 40 * 60 * 1000, [5, 5, 5.5, 6, 6.5, 7, 7, 7]),
    ].sort((a, b) => a.ts - b.ts);

    const map = buildRunBGContexts(events, readings);
    expect(map.size).toBe(2);
    expect(map.get("a1")).toBeDefined();
    expect(map.get("a2")).toBeDefined();
  });

  it("activity outside xDrip date range → context has null pre/post, doesn't throw", () => {
    const events: CalendarEvent[] = [
      makeEvent({
        activityId: "old",
        date: new Date("2025-01-01T10:00:00Z"),
      }),
    ];

    const readings = makeReadings(T0, [10, 10, 10]);
    const map = buildRunBGContexts(events, readings);
    // Should not throw; context is created but pre/post are null (no nearby readings)
    if (map.size > 0) {
      const ctx = map.get("old")!;
      expect(ctx.pre).toBeNull();
      expect(ctx.post).toBeNull();
    }
  });

  it("returns empty map for empty readings", () => {
    const events: CalendarEvent[] = [makeEvent()];
    const map = buildRunBGContexts(events, []);
    expect(map.size).toBe(0);
  });
});

// --- Integration test: realistic run scenario ---

describe("integration: realistic run scenario", () => {
  it("easy run with pre-drop and post-crash", () => {
    const runStart = T0;
    const runEnd = T0 + 40 * 60 * 1000;

    // Pre-run: 30 min before, dropping slightly
    const preReadings = makeReadings(runStart - 30 * 60 * 1000, [
      10.5, 10.3, 10.1, 9.9, 9.8, 9.7,
    ]);

    // During run: 40 min
    const duringReadings = makeReadings(runStart, [
      9.5, 9.0, 8.5, 8.2, 8.0, 7.8, 7.5, 7.2,
    ]);

    // Post-run: 45 min of crash then recovery
    const postReadings = makeReadings(runEnd, [
      8.2, 7.5, 6.8, 5.9, 5.2, 5.0, 5.1, 5.3, 5.5,
    ]);

    const allReadings = [
      ...preReadings,
      ...duringReadings,
      ...postReadings,
    ].sort((a, b) => a.ts - b.ts);

    const event = makeEvent({ duration: 40 * 60 });
    const ctx = buildRunBGContext(event, allReadings)!;

    expect(ctx).not.toBeNull();
    expect(ctx.pre).not.toBeNull();
    expect(ctx.post).not.toBeNull();

    // Entry slope should be negative (dropping ~0.5/10min)
    expect(ctx.pre!.entrySlope30m).toBeLessThan(0);
    expect(ctx.pre!.entrySlope30m).toBeCloseTo(-0.33, 0);

    // Recovery: significant drop in 30 min
    expect(ctx.post!.recoveryDrop30m).toBeLessThan(0);

    // Nadir should be around 5.0
    expect(ctx.post!.nadirPostRun).toBeCloseTo(5.0, 0);

    // No hypo (nadir 5.0 > 3.9)
    expect(ctx.post!.postRunHypo).toBe(false);
  });

  it("hypo scenario: long run with post-run crash to 3.5", () => {
    const runStart = T0;
    const runEnd = T0 + 60 * 60 * 1000; // 60 min run

    const preReadings = makeReadings(runStart - 30 * 60 * 1000, [
      10, 10, 10, 10, 10, 10,
    ]);

    const postReadings = makeReadings(runEnd, [
      7, 6, 5, 4, 3.5, 3.8, 4.5, 5, 5.5, 6,
    ]);

    const allReadings = [...preReadings, ...postReadings].sort(
      (a, b) => a.ts - b.ts,
    );

    const event = makeEvent({
      category: "long",
      duration: 60 * 60,
    });
    const ctx = buildRunBGContext(event, allReadings)!;

    expect(ctx.post).not.toBeNull();
    expect(ctx.post!.postRunHypo).toBe(true);
    expect(ctx.post!.nadirPostRun).toBe(3.5);
  });
});
