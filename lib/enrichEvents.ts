import type { CalendarEvent, StreamData, DataPoint } from "@/lib/types";
import type { EnrichedActivity } from "@/lib/activityStreamsDb";
import type { ActivityStreamData } from "@/app/hooks/useActivityStream";
import type { XdripReading } from "@/lib/xdrip";
import { xdripToGlucosePoints } from "@/lib/bgAlignment";

/** Merge cached activity data (HR, pace, cadence, altitude, glucose) into calendar events. */
export function enrichEvents(
  events: CalendarEvent[],
  cachedActivities: EnrichedActivity[],
): CalendarEvent[] {
  if (cachedActivities.length === 0) return events;
  const cacheMap = new Map<string, EnrichedActivity>(
    cachedActivities.map((a) => [a.activityId, a]),
  );
  return events.map((event) => {
    if (event.type !== "completed" || event.streamData || !event.activityId) return event;
    const cached = cacheMap.get(event.activityId);
    if (!cached) return event;
    const streamData: StreamData = {};
    if (cached.hr.length > 0) streamData.heartrate = cached.hr;
    if (cached.pace && cached.pace.length > 0) streamData.pace = cached.pace;
    if (cached.cadence && cached.cadence.length > 0) streamData.cadence = cached.cadence;
    if (cached.altitude && cached.altitude.length > 0) streamData.altitude = cached.altitude;
    if (cached.distance && cached.distance.length > 0) streamData.distance = cached.distance;
    if (cached.rawTime && cached.rawTime.length > 0) streamData.rawTime = cached.rawTime;
    const hasStream = Object.keys(streamData).length > 0;
    if (!cached.glucose && !hasStream) return event;
    return {
      ...event,
      ...(hasStream && { streamData }),
      ...(cached.glucose && { glucose: cached.glucose }),
    };
  });
}

/** Merge fresh stream data + reconstruct glucose for a selected event (modal display). */
export function mergeStreamData(
  event: CalendarEvent,
  freshStream: ActivityStreamData,
  xdripReadings: XdripReading[],
): CalendarEvent {
  const mergedStreamData: StreamData = {
    ...event.streamData,
    ...freshStream.streamData,
  };
  let glucose: DataPoint[] | undefined = event.glucose;
  if (!glucose && mergedStreamData.heartrate?.length && xdripReadings.length > 0) {
    const runStartMs = event.date.getTime();
    const lastMin = mergedStreamData.heartrate[mergedStreamData.heartrate.length - 1].time;
    const runEndMs = runStartMs + lastMin * 60 * 1000;
    const reconstructed = xdripToGlucosePoints(xdripReadings, runStartMs, runEndMs);
    if (reconstructed.length >= 2) glucose = reconstructed;
  }
  return {
    ...event,
    streamData: mergedStreamData,
    glucose,
    avgHr: freshStream.avgHr ?? event.avgHr,
    maxHr: freshStream.maxHr ?? event.maxHr,
  };
}
