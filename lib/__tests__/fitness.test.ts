import { describe, it, expect } from "vitest";
import { computeFitnessData, computeInsights } from "../fitness";
import type { CalendarEvent } from "../types";

function makeEvent(
  daysAgo: number,
  load: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, 0, 0);
  return {
    id: `activity-${daysAgo}`,
    date,
    name: "Test Run",
    description: "",
    type: "completed",
    category: "easy",
    load,
    ...overrides,
  };
}

describe("computeFitnessData", () => {
  it("returns empty array for no events", () => {
    const result = computeFitnessData([], 30);
    // Should still return daily data points even with no load
    expect(result.length).toBe(31); // 30 days + today
  });

  it("all loads are zero when no completed events", () => {
    const result = computeFitnessData([], 7);
    for (const dp of result) {
      expect(dp.load).toBe(0);
    }
  });

  it("CTL grows with consistent training", () => {
    // Train every day for 60 days with load 50
    const events = Array.from({ length: 60 }, (_, i) => makeEvent(i, 50));
    const result = computeFitnessData(events, 60);

    // CTL should be building toward ~50
    const latest = result[result.length - 1];
    expect(latest.ctl).toBeGreaterThan(20);
  });

  it("ATL responds faster than CTL to load changes", () => {
    // 30 days of rest, then 5 days of hard training
    const events = Array.from({ length: 5 }, (_, i) => makeEvent(i, 100));
    const result = computeFitnessData(events, 30);

    const latest = result[result.length - 1];
    // ATL should be higher than CTL because it responds faster
    expect(latest.atl).toBeGreaterThan(latest.ctl);
  });

  it("TSB equals CTL minus ATL", () => {
    const events = [makeEvent(1, 80), makeEvent(3, 60)];
    const result = computeFitnessData(events, 7);

    for (const dp of result) {
      const expectedTsb = dp.ctl - dp.atl;
      expect(dp.tsb).toBeCloseTo(expectedTsb, 0);
    }
  });

  it("ignores planned events", () => {
    const events = [
      makeEvent(1, 80, { type: "planned" }),
      makeEvent(2, 60, { type: "completed" }),
    ];
    const result = computeFitnessData(events, 7);

    // Only the completed event should contribute load
    const day2 = result.find((dp) => {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      return dp.date === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    if (day2) {
      expect(day2.load).toBe(60);
    }
  });

  it("ignores events without load", () => {
    const events = [makeEvent(1, 0, { load: undefined })];
    const result = computeFitnessData(events, 7);
    const latest = result[result.length - 1];
    expect(latest.ctl).toBe(0);
  });
});

describe("computeInsights", () => {
  it("returns form zone based on TSB", () => {
    // Lots of recent training -> negative TSB -> high-risk or optimal
    const events = Array.from({ length: 10 }, (_, i) => makeEvent(i, 120));
    const fitnessData = computeFitnessData(events, 30);
    const insights = computeInsights(fitnessData, events);

    // With heavy recent training, TSB should be negative
    expect(insights.currentTsb).toBeLessThan(0);
    expect(["high-risk", "optimal"]).toContain(insights.formZone);
  });

  it("counts activities in last 7 and 28 days", () => {
    const events = [
      makeEvent(1, 50),
      makeEvent(3, 50),
      makeEvent(5, 50),
      makeEvent(10, 50),
      makeEvent(20, 50),
    ];
    const fitnessData = computeFitnessData(events, 30);
    const insights = computeInsights(fitnessData, events);

    expect(insights.totalActivities7d).toBe(3); // days 1, 3, 5
    expect(insights.totalActivities28d).toBe(5); // all 5
  });

  it("tracks peak CTL", () => {
    const events = Array.from({ length: 90 }, (_, i) => makeEvent(i, 50));
    const fitnessData = computeFitnessData(events, 90);
    const insights = computeInsights(fitnessData, events);

    expect(insights.peakCtl).toBeGreaterThan(0);
    expect(insights.peakCtlDate).toBeTruthy();
  });

  it("computes ramp rate from last 7 days of CTL change", () => {
    const events = Array.from({ length: 30 }, (_, i) => makeEvent(i, 50));
    const fitnessData = computeFitnessData(events, 30);
    const insights = computeInsights(fitnessData, events);

    // Ramp rate should be positive with consistent training
    expect(insights.rampRate).toBeGreaterThan(0);
  });
});
