import type { CalendarEvent, StreamData } from "@/lib/types";
import type { CachedActivity } from "@/lib/bgCacheDb";

/** Merge cached stream data (glucose, HR, pace, cadence, altitude) into calendar events. */
export function enrichEvents(
  events: CalendarEvent[],
  cachedActivities: CachedActivity[],
): CalendarEvent[] {
  if (cachedActivities.length === 0) return events;
  const cacheMap = new Map<string, CachedActivity>(
    cachedActivities.map((a) => [a.activityId, a]),
  );
  return events.map((event) => {
    if (event.type !== "completed" || event.streamData || !event.activityId) return event;
    const cached = cacheMap.get(event.activityId);
    if (!cached) return event;
    const streamData: StreamData = {};
    if (cached.glucose.length > 0) streamData.glucose = cached.glucose;
    if (cached.hr.length > 0) streamData.heartrate = cached.hr;
    if (cached.pace && cached.pace.length > 0) streamData.pace = cached.pace;
    if (cached.cadence && cached.cadence.length > 0) streamData.cadence = cached.cadence;
    if (cached.altitude && cached.altitude.length > 0) streamData.altitude = cached.altitude;
    if (Object.keys(streamData).length === 0) return event;
    return { ...event, streamData };
  });
}
