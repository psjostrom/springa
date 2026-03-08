import { describe, it, expect } from "vitest";
import { wellnessToFitnessData, computeInsights } from "../fitness";
import type { CalendarEvent } from "../types";
import type { WellnessEntry } from "../intervalsApi";

function makeWellnessEntry(
  daysAgo: number,
  ctl: number,
  atl: number,
): WellnessEntry {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const id = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { id, ctl, atl };
}

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

describe("wellnessToFitnessData", () => {
  it("returns empty array for no entries", () => {
    expect(wellnessToFitnessData([])).toEqual([]);
  });

  it("filters entries without ctl/atl", () => {
    const entries: WellnessEntry[] = [
      { id: "2026-01-01" },
      { id: "2026-01-02", ctl: 10, atl: 15 },
      { id: "2026-01-03", ctl: null as unknown as number },
    ];
    const result = wellnessToFitnessData(entries);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-01-02");
  });

  it("computes TSB as CTL - ATL", () => {
    const entries = [makeWellnessEntry(1, 30, 40)];
    const result = wellnessToFitnessData(entries);
    expect(result[0].tsb).toBe(-10);
  });

  it("rounds to one decimal place", () => {
    const entries: WellnessEntry[] = [
      { id: "2026-01-01", ctl: 12.345, atl: 7.891 },
    ];
    const result = wellnessToFitnessData(entries);
    expect(result[0].ctl).toBe(12.3);
    expect(result[0].atl).toBe(7.9);
    expect(result[0].tsb).toBe(4.5);
  });

  it("preserves date ordering from input", () => {
    const entries = [
      makeWellnessEntry(3, 10, 15),
      makeWellnessEntry(2, 12, 14),
      makeWellnessEntry(1, 14, 13),
    ];
    const result = wellnessToFitnessData(entries);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe(entries[0].id);
    expect(result[2].date).toBe(entries[2].id);
  });
});

describe("computeInsights", () => {
  it("returns form zone based on TSB", () => {
    // Heavy recent training: ATL >> CTL -> negative TSB
    const entries = Array.from({ length: 30 }, (_, i) =>
      makeWellnessEntry(30 - i, 20, 50),
    );
    const fitnessData = wellnessToFitnessData(entries);
    const events = Array.from({ length: 10 }, (_, i) => makeEvent(i, 120));
    const insights = computeInsights(fitnessData, events);

    expect(insights.currentTsb).toBeLessThan(0);
    expect(["high-risk", "optimal"]).toContain(insights.formZone);
  });

  it("counts activities in last 7 and 28 days", () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      makeWellnessEntry(30 - i, 20 + i, 15 + i),
    );
    const fitnessData = wellnessToFitnessData(entries);
    const events = [
      makeEvent(1, 50),
      makeEvent(3, 50),
      makeEvent(5, 50),
      makeEvent(10, 50),
      makeEvent(20, 50),
    ];
    const insights = computeInsights(fitnessData, events);

    expect(insights.totalActivities7d).toBe(3);
    expect(insights.totalActivities28d).toBe(5);
  });

  it("tracks peak CTL", () => {
    const entries = [
      makeWellnessEntry(3, 30, 20),
      makeWellnessEntry(2, 50, 40), // peak
      makeWellnessEntry(1, 45, 35),
    ];
    const fitnessData = wellnessToFitnessData(entries);
    const insights = computeInsights(fitnessData, []);

    expect(insights.peakCtl).toBe(50);
    expect(insights.peakCtlDate).toBe(entries[1].id);
  });

  it("computes ramp rate from last 7 days of CTL change", () => {
    // CTL increasing over the period
    const entries = Array.from({ length: 14 }, (_, i) =>
      makeWellnessEntry(14 - i, 10 + i * 2, 10 + i),
    );
    const fitnessData = wellnessToFitnessData(entries);
    const insights = computeInsights(fitnessData, []);

    expect(insights.rampRate).toBeGreaterThan(0);
  });
});
