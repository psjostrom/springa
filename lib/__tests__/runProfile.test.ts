import { describe, it, expect } from "vitest";
import { getLongestRun, getRunVolumeStats, getEarliestRunDate } from "../runProfile";
import type { CalendarEvent } from "../types";

function event(date: string, distanceKm: number, name: string, completed = true): CalendarEvent {
  return {
    id: `e-${date}`,
    date: new Date(date),
    type: completed ? "completed" : "planned",
    name,
    description: "",
    distance: distanceKm * 1000,
    duration: 60 * 60,
    category: "easy",
  } as CalendarEvent;
}

describe("runProfile", () => {
  it("getLongestRun returns the longest completed event by distance", () => {
    const longest = getLongestRun([
      event("2026-04-22", 14, "W11 Long (14km)"),
      event("2026-04-19", 13, "W10 Long (13km)"),
      event("2026-05-04", 6, "W13 Easy"),
    ]);
    expect(longest?.distanceKm).toBeCloseTo(14, 0);
    expect(longest?.name).toContain("14km");
    expect(longest?.dateISO).toBe("2026-04-22");
  });

  it("getLongestRun returns null when no completed events with distance", () => {
    expect(getLongestRun([event("2026-04-22", 14, "Planned", false)])).toBeNull();
    expect(getLongestRun([])).toBeNull();
  });

  it("getLongestRun skips events without distance", () => {
    const longest = getLongestRun([
      { ...event("2026-04-22", 14, "Long"), distance: undefined },
      event("2026-04-19", 10, "Easy"),
    ]);
    expect(longest?.distanceKm).toBeCloseTo(10, 0);
  });

  it("getRunVolumeStats counts completed runs in last N days from reference", () => {
    const ref = new Date("2026-05-10T12:00:00Z");
    const stats = getRunVolumeStats([
      event("2026-05-09", 6, "Easy"),       // 1d ago — in 7d window
      event("2026-05-04", 6, "Easy"),       // 6d ago — in 7d window
      event("2026-04-22", 14, "Long"),      // 18d ago — in 28d only
      event("2026-04-19", 13, "Long"),      // 21d ago — in 28d only
      event("2026-04-01", 6, "Easy"),       // 39d ago — outside both
    ], ref);
    expect(stats.runs7d).toBe(2);
    expect(stats.runs28d).toBe(4);
  });

  it("getRunVolumeStats excludes future events", () => {
    const ref = new Date("2026-05-10T12:00:00Z");
    const stats = getRunVolumeStats([
      event("2026-05-09", 6, "Easy"),       // 1d ago — counts
      event("2026-05-11", 6, "Future"),     // 1d future — excluded
    ], ref);
    expect(stats.runs7d).toBe(1);
    expect(stats.runs28d).toBe(1);
  });

  it("getRunVolumeStats excludes planned events", () => {
    const ref = new Date("2026-05-10T12:00:00Z");
    const stats = getRunVolumeStats([
      event("2026-05-09", 6, "Easy"),       // completed — counts
      event("2026-05-08", 6, "Planned", false), // planned — excluded
    ], ref);
    expect(stats.runs7d).toBe(1);
    expect(stats.runs28d).toBe(1);
  });

  it("getEarliestRunDate returns ISO date of earliest completed event", () => {
    const date = getEarliestRunDate([
      event("2026-05-04", 6, "Easy"),
      event("2025-09-12", 5, "Easy"),
      event("2026-01-15", 8, "Long"),
    ]);
    expect(date).toBe("2025-09-12");
  });

  it("getEarliestRunDate returns null when no completed events", () => {
    expect(getEarliestRunDate([])).toBeNull();
    expect(getEarliestRunDate([event("2026-05-04", 6, "Planned", false)])).toBeNull();
  });
});
