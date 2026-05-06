/**
 * Compute UTC offset string (e.g. "+01:00") for a timezone at a given date.
 * Handles DST transitions correctly via Intl.
 */
function tzOffset(tz: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const gmtPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return gmtPart === "GMT" ? "+00:00" : gmtPart.replace("GMT", "");
}

/**
 * Get today's date string (yyyy-MM-dd) in a given timezone.
 * DST-safe: uses Intl.DateTimeFormat to resolve the correct local date.
 */
export function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date());
}

/**
 * Convert a timezone-naive local date string (e.g. "2026-03-29T15:00:00")
 * to UTC milliseconds, using the correct offset for the given timezone.
 * Handles DST transitions: an event at 15:00 in Europe/Stockholm gives
 * 13:00 UTC in summer (CEST, +02:00) and 14:00 UTC in winter (CET, +01:00).
 */
export function localToUtcMs(localDateStr: string, tz: string): number {
  const naive = new Date(localDateStr);
  const offset = tzOffset(tz, naive);
  return new Date(localDateStr + offset).getTime();
}

/** Resolve timezone from user setting. */
export function resolveTimezone(userTimezone?: string): string {
  return userTimezone ?? "Europe/Stockholm";
}
