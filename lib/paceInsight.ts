import type { CalendarEvent } from "./types";

type EventCategory = CalendarEvent["category"];

const EXTERNAL_ID_CATEGORY_MAP: Record<string, EventCategory> = {
  speed: "interval",
  club: "interval",
  easy: "easy",
  free: "easy",
  long: "long",
  race: "race",
  ondemand: "other",
};

export function categoryFromExternalId(
  externalId: string | undefined,
): EventCategory | null {
  if (!externalId) return null;
  const prefix = externalId.split("-")[0];
  return EXTERNAL_ID_CATEGORY_MAP[prefix] ?? null;
}
