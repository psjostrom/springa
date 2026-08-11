import { describe, expect, it } from "vitest";
import {
  formatCalendarEventId,
  isLocalDateTime,
  parseCalendarEventId,
} from "@/lib/calendarEventId";

describe("calendar event identity", () => {
  it.each([
    ["event-123", 123],
    ["123", 123],
    [123, 123],
  ])("normalizes %p", (input, expected) => {
    expect(parseCalendarEventId(input)).toBe(expected);
  });

  it.each([
    "activity-123",
    "event-0",
    "-1",
    "1.5",
    "01",
    "event-01",
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid event identity %p", (input) => {
    expect(parseCalendarEventId(input)).toBeNull();
  });

  it("formats canonical event identity", () => {
    expect(formatCalendarEventId(123)).toBe("event-123");
  });
});

describe("local date-time", () => {
  it.each(["2026-08-14T12:00:00", "2026-03-29T15:00:00"])(
    "accepts local timestamp %s",
    (value) => {
      expect(isLocalDateTime(value)).toBe(true);
    },
  );

  it.each([
    "2026-02-30T12:00:00",
    "2026-08-14",
    "2026-08-14T12:00:00Z",
    "2026-08-14T25:00:00",
  ])("rejects invalid local timestamp %s", (value) => {
    expect(isLocalDateTime(value)).toBe(false);
  });
});
