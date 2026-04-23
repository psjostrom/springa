import { describe, it, expect } from "vitest";
import {
  advanceSharedCalendarKey,
  buildSharedCalendarKey,
  msUntilNextSharedCalendarBoundary,
} from "../sharedCalendarData";

describe("sharedCalendarData helpers", () => {
  it("advances the shared calendar key by one month", () => {
    const februaryWindow = buildSharedCalendarKey(new Date(2026, 1, 15, 12, 0, 0));

    expect(advanceSharedCalendarKey(februaryWindow)).toEqual([
      "calendar-data",
      "2024-03-01",
      "2026-09-30",
    ]);
  });

  it("computes the time until the next month boundary", () => {
    expect(msUntilNextSharedCalendarBoundary(new Date(2026, 1, 28, 23, 55, 0))).toBe(
      5 * 60 * 1000,
    );
  });
});