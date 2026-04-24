import { describe, it, expect } from "vitest";
import {
  advanceSharedCalendarKey,
  buildSharedCalendarKey,
  getSharedCalendarTimeoutDelay,
  MAX_TIMEOUT_MS,
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

  it("chunks long timeout delays to stay below browser timeout limits", () => {
    const nowMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const boundaryAtMs = nowMs + 31 * 24 * 60 * 60 * 1000;

    expect(getSharedCalendarTimeoutDelay(boundaryAtMs, nowMs)).toBe(MAX_TIMEOUT_MS);
  });

  it("returns exact delay when remaining time is within timeout limit", () => {
    const nowMs = Date.UTC(2026, 0, 1, 0, 0, 0);
    const boundaryAtMs = nowMs + 5 * 60 * 1000;

    expect(getSharedCalendarTimeoutDelay(boundaryAtMs, nowMs)).toBe(5 * 60 * 1000);
  });

  it("returns null when boundary has passed", () => {
    const nowMs = Date.UTC(2026, 0, 1, 0, 10, 0);
    const boundaryAtMs = nowMs - 1;

    expect(getSharedCalendarTimeoutDelay(boundaryAtMs, nowMs)).toBeNull();
  });
});