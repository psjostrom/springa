import { getXdripReadingsForRange } from "./xdripDb";
import { enrichWithGlucose } from "./bgAlignment";
import type { CachedActivity } from "./activityStreamsDb";

/**
 * Enrich cached activities with glucose data from xdrip_readings (server-side).
 * Fetches xDrip readings for the full date range of activities and aligns.
 */
export async function enrichActivitiesWithGlucose(
  email: string,
  activities: CachedActivity[],
): Promise<CachedActivity[]> {
  if (activities.length === 0) return activities;

  const startMsValues = activities
    .map((a) => a.runStartMs)
    .filter((ms): ms is number => ms != null);
  if (startMsValues.length === 0) return activities;

  const minMs = Math.min(...startMsValues);
  // Estimate end time from HR stream duration
  const maxMs = Math.max(
    ...activities.map((a) => {
      const base = a.runStartMs ?? 0;
      const dur =
        a.hr.length > 0 ? a.hr[a.hr.length - 1].time * 60 * 1000 : 0;
      return base + dur;
    }),
  );

  const readings = await getXdripReadingsForRange(email, minMs, maxMs);
  return enrichWithGlucose(activities, readings);
}
