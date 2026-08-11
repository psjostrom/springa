const CALENDAR_EVENT_ID = /^(?:event-)?([1-9]\d*)$/;
const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

function isValidEventId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseCalendarEventId(value: unknown): number | null {
  if (typeof value === "number") return isValidEventId(value) ? value : null;
  if (typeof value !== "string") return null;

  const match = CALENDAR_EVENT_ID.exec(value);
  if (!match) return null;

  const eventId = Number(match[1]);
  return isValidEventId(eventId) ? eventId : null;
}

export function formatCalendarEventId(eventId: number): `event-${number}` {
  if (!isValidEventId(eventId)) throw new RangeError("Invalid calendar event ID");
  return `event-${eventId}`;
}

export function isLocalDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}
