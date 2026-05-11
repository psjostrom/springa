import { renderHook } from "@/lib/__tests__/test-utils";
import { describe, it, expect } from "vitest";
import { useCoachData } from "../useCoachData";
import type { CalendarEvent } from "@/lib/types";
import type { WellnessEntry } from "@/lib/intervalsApi";

describe("useCoachData", () => {
  it("returns context string and isLoading false with minimal valid inputs", () => {
    const events: CalendarEvent[] = [
      {
        id: "1",
        date: new Date("2026-04-01"),
        name: "W01 Easy",
        description: "",
        type: "completed",
        category: "easy",
      },
    ];
    const wellnessEntries: WellnessEntry[] = [
      {
        id: "2026-04-01",
        ctl: 50,
        atl: 30,
      },
    ];
    const { result } = renderHook(() =>
      useCoachData({
        events,
        wellnessEntries,
        phaseInfo: { name: "Base", week: 1, progress: 0.1 },
        bgModel: null,
        hrZones: [120, 140, 160, 180],
      }),
    );
    expect(result.current.isLoading).toBe(false);
    expect(typeof result.current.context).toBe("string");
    expect(result.current.context.length).toBeGreaterThan(0);
  });

  it("returns empty context and isLoading true when events empty", () => {
    const { result } = renderHook(() =>
      useCoachData({
        events: [],
        wellnessEntries: [],
        phaseInfo: { name: "Base", week: 1, progress: 0.1 },
        bgModel: null,
        hrZones: [120, 140, 160, 180],
      }),
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.context).toBe("");
  });

  it("includes race name and derived facts in context when provided", () => {
    const events: CalendarEvent[] = [
      {
        id: "1",
        date: new Date("2026-04-01"),
        name: "W01 Easy",
        description: "",
        type: "completed",
        category: "easy",
      },
    ];
    const wellnessEntries: WellnessEntry[] = [
      {
        id: "2026-04-01",
        ctl: 50,
        atl: 30,
      },
    ];
    const { result } = renderHook(() =>
      useCoachData({
        events,
        wellnessEntries,
        phaseInfo: { name: "Base", week: 1, progress: 0.1 },
        bgModel: null,
        hrZones: [120, 140, 160, 180],
        race: { name: "EcoTrail", distanceKm: 16, date: "2026-06-13" },
        derived: {
          longestRun: { distanceKm: 14, name: "W11 Long", dateISO: "2026-04-22" },
          volume: { runs7d: 3, runs28d: 12 },
          earliestRunDate: "2026-01-01",
        },
      }),
    );
    expect(result.current.context).toContain("EcoTrail");
    expect(result.current.context).toContain("14");
  });
});
