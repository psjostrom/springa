import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CalendarEvent } from "@/lib/types";
import { useUnratedRun } from "../useUnratedRun";

function makeCompletedRun(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "activity-1",
    date: new Date("2026-04-23T09:00:00Z"),
    name: "W04 Easy",
    description: "",
    type: "completed",
    category: "easy",
    activityId: "activity-1",
    rating: null,
    ...overrides,
  };
}

describe("useUnratedRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops runs that are older than seven days at call time", () => {
    vi.setSystemTime(new Date("2026-04-23T12:00:00Z"));

    const run = makeCompletedRun({
      date: new Date("2026-04-17T09:00:00Z"),
      activityId: "activity-older",
      name: "W03 Easy",
    });

    expect(useUnratedRun([run])).toEqual({
      activityId: "activity-older",
      name: "W03 Easy",
    });

    vi.setSystemTime(new Date("2026-04-25T12:00:00Z"));

    expect(useUnratedRun([run])).toBeNull();
  });
});