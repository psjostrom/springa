import { startOfMonth, subMonths, endOfMonth, addMonths, format } from "date-fns";
import { CALENDAR_LOOKBACK_MONTHS } from "./constants";

export interface SharedCalendarWindow {
  oldest: string;
  newest: string;
}

export type SharedCalendarKey = readonly ["calendar-data", string, string];

export function getSharedCalendarWindow(now = new Date()): SharedCalendarWindow {
  const start = startOfMonth(subMonths(now, CALENDAR_LOOKBACK_MONTHS));
  const end = endOfMonth(addMonths(now, 6));

  return {
    oldest: format(start, "yyyy-MM-dd"),
    newest: format(end, "yyyy-MM-dd"),
  };
}

export function buildSharedCalendarKey(now = new Date()): SharedCalendarKey {
  const { oldest, newest } = getSharedCalendarWindow(now);
  return ["calendar-data", oldest, newest];
}

export function advanceSharedCalendarKey(key: SharedCalendarKey): SharedCalendarKey {
  const oldest = addMonths(new Date(`${key[1]}T00:00:00`), 1);
  const newest = endOfMonth(addMonths(new Date(`${key[2]}T00:00:00`), 1));

  return [
    "calendar-data",
    format(oldest, "yyyy-MM-dd"),
    format(newest, "yyyy-MM-dd"),
  ];
}

export function msUntilNextSharedCalendarBoundary(now = new Date()): number {
  const nextBoundary = startOfMonth(addMonths(now, 1));
  return nextBoundary.getTime() - now.getTime();
}

export function isSharedCalendarKey(key: unknown): key is SharedCalendarKey {
  return Array.isArray(key)
    && key.length === 3
    && key[0] === "calendar-data"
    && typeof key[1] === "string"
    && typeof key[2] === "string";
}