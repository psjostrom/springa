import { describe, it, expect, vi, afterEach } from "vitest";
import { getEventStyle, getEventIcon, isMissedEvent, getEventStatusBadge } from "../eventStyles";
import type { CalendarEvent } from "../types";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-1",
    date: new Date("2026-03-01"),
    name: "Test Event",
    description: "",
    type: "planned",
    category: "easy",
    ...overrides,
  };
}

describe("getEventStyle", () => {
  it("returns race style for race events", () => {
    expect(getEventStyle(makeEvent({ type: "race" }))).toContain("ff2d95");
  });

  it("returns completed long style", () => {
    expect(getEventStyle(makeEvent({ type: "completed", category: "long" }))).toContain("39ff14");
  });

  it("returns completed interval style", () => {
    expect(getEventStyle(makeEvent({ type: "completed", category: "interval" }))).toContain("4a2080");
  });

  it("returns completed default style", () => {
    expect(getEventStyle(makeEvent({ type: "completed", category: "easy" }))).toContain("39ff14");
  });

  it("returns planned long style", () => {
    expect(getEventStyle(makeEvent({ type: "planned", category: "long" }))).toContain("00ffff");
  });

  it("returns planned interval style", () => {
    expect(getEventStyle(makeEvent({ type: "planned", category: "interval" }))).toContain("e0d0ff");
  });

  it("returns planned default style", () => {
    expect(getEventStyle(makeEvent({ type: "planned", category: "easy" }))).toContain("00ffff");
  });
});

describe("getEventIcon", () => {
  it("returns flag for race", () => {
    expect(getEventIcon(makeEvent({ type: "race" }))).toBe("🏁");
  });

  it("returns runner for long run", () => {
    expect(getEventIcon(makeEvent({ category: "long" }))).toBe("🏃");
  });

  it("returns lightning for intervals", () => {
    expect(getEventIcon(makeEvent({ category: "interval" }))).toBe("⚡");
  });

  it("returns checkmark for other", () => {
    expect(getEventIcon(makeEvent({ category: "easy" }))).toBe("✓");
  });
});

describe("isMissedEvent", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("planned event in the past is missed", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    expect(isMissedEvent(makeEvent({ type: "planned", date: new Date("2026-03-09") }))).toBe(true);
  });

  it("planned event today is NOT missed", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    expect(isMissedEvent(makeEvent({ type: "planned", date: new Date("2026-03-10") }))).toBe(false);
  });

  it("planned event in the future is NOT missed", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    expect(isMissedEvent(makeEvent({ type: "planned", date: new Date("2026-03-15") }))).toBe(false);
  });

  it("completed event in the past is NOT missed", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    expect(isMissedEvent(makeEvent({ type: "completed", date: new Date("2026-03-05") }))).toBe(false);
  });

  it("race event in the past is NOT missed", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    expect(isMissedEvent(makeEvent({ type: "race", date: new Date("2026-03-05") }))).toBe(false);
  });
});

describe("getEventStatusBadge", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("returns Missed badge for past planned event", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    const badge = getEventStatusBadge(makeEvent({ type: "planned", date: new Date("2026-03-08") }));
    expect(badge.label).toBe("Missed");
  });

  it("returns Planned badge for future planned event", () => {
    vi.useFakeTimers({ now: new Date("2026-03-10T12:00:00") });
    const badge = getEventStatusBadge(makeEvent({ type: "planned", date: new Date("2026-03-15") }));
    expect(badge.label).toBe("Planned");
  });

  it("returns Completed badge for completed event", () => {
    const badge = getEventStatusBadge(makeEvent({ type: "completed" }));
    expect(badge.label).toBe("Completed");
  });

  it("returns Race badge for race event", () => {
    const badge = getEventStatusBadge(makeEvent({ type: "race" }));
    expect(badge.label).toBe("Race");
  });
});
