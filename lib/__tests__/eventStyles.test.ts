import { describe, it, expect } from "vitest";
import { getEventStyle, getEventIcon } from "../eventStyles";
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
