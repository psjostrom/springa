import { getUserCredentials } from "./credentials";
import { fetchBGFromNS } from "./nightscout";
import { enrichWithGlucose } from "./bgAlignment";
import type { CachedActivity, EnrichedActivity } from "./activityStreamsDb";

/**
 * Enrich cached activities with glucose data from Nightscout (server-side).
 * Fetches CGM readings for the full date range of activities and aligns.
 */
export async function enrichActivitiesWithGlucose(
  email: string,
  activities: CachedActivity[],
): Promise<EnrichedActivity[]> {
  if (activities.length === 0) return [];

  const startMsValues = activities
    .map((a) => a.runStartMs)
    .filter((ms): ms is number => ms != null);
  if (startMsValues.length === 0) return activities;

  const minMs = Math.min(...startMsValues);
  // Estimate end time from HR stream duration (only activities with runStartMs)
  const maxMs = Math.max(
    ...activities
      .flatMap((a) => {
        if (a.runStartMs == null) return [];
        const dur =
          a.hr.length > 0 ? a.hr[a.hr.length - 1].time * 60 * 1000 : 0;
        return [a.runStartMs + dur];
      }),
  );

  const creds = await getUserCredentials(email);
  if (!creds?.nightscoutUrl || !creds.nightscoutSecret) {
    // No Nightscout configured — return activities without glucose enrichment
    return activities;
  }

  try {
    // Add padding for interpolation at boundaries
    const PADDING_MS = 10 * 60 * 1000;
    const readings = await fetchBGFromNS(creds.nightscoutUrl, creds.nightscoutSecret, {
      since: minMs - PADDING_MS,
      until: maxMs + PADDING_MS,
      count: 1000,
    });

    // NS returns readings sorted DESC (newest first).
    // Consumers (interpolateBG, alignHRWithBG) expect ASC (oldest first).
    readings.sort((a, b) => a.ts - b.ts);

    return enrichWithGlucose(activities, readings);
  } catch (err) {
    console.error("[activityStreamsEnrich] Failed to fetch from Nightscout:", err);
    // Return activities without glucose enrichment on error
    return activities;
  }
}
