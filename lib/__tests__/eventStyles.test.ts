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
    expect(getEventStyle(makeEvent({ type: "race" }))).toContain("red");
  });

  it("returns completed long style", () => {
    expect(getEventStyle(makeEvent({ type: "completed", category: "long" }))).toContain("green-600");
  });

  it("returns completed interval style", () => {
    expect(getEventStyle(makeEvent({ type: "completed", category: "interval" }))).toContain("purple-600");
  });

  it("returns completed default style", () => {
    expect(getEventStyle(makeEvent({ type: "completed", category: "easy" }))).toContain("green-500");
  });

  it("returns planned long style", () => {
    expect(getEventStyle(makeEvent({ type: "planned", category: "long" }))).toContain("green-200");
  });

  it("returns planned interval style", () => {
    expect(getEventStyle(makeEvent({ type: "planned", category: "interval" }))).toContain("purple-200");
  });

  it("returns planned default style", () => {
    expect(getEventStyle(makeEvent({ type: "planned", category: "easy" }))).toContain("blue-200");
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
