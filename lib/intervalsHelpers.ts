import { API_BASE } from "./constants";
import { authHeader } from "./intervalsApi";
import { saveUserSettings } from "./settings";
import type { IntervalsActivity } from "./types";

const MS_PER_HOUR = 3_600_000;

// --- Run context (activityId + activity stats + prescribed carbs) ---

export interface RunContext {
  activityId: string | null;
  prescribedCarbsG: number | null;
  /** Distance in meters (from Intervals.icu activity). */
  distance: number | null;
  /** Duration in milliseconds (from Intervals.icu activity moving_time). */
  movingTimeMs: number | null;
  /** Average heart rate in bpm (from Intervals.icu activity). */
  avgHr: number | null;
}

/** Fetch the latest activity and compute prescribed carbs for a given run date. */
export async function fetchRunContext(
  apiKey: string,
  runDate: Date,
): Promise<RunContext> {
  const dateStr = runDate.toISOString().slice(0, 10);
  const auth = authHeader(apiKey);

  const [activitiesRes, eventsRes] = await Promise.all([
    fetch(
      `${API_BASE}/athlete/0/activities?oldest=${dateStr}&newest=${dateStr}`,
      { headers: { Authorization: auth } },
    ),
    fetch(
      `${API_BASE}/athlete/0/events?oldest=${dateStr}T00:00:00&newest=${dateStr}T23:59:59`,
      { headers: { Authorization: auth } },
    ),
  ]);

  // Find the most recent running activity by start_date_local
  const activities: IntervalsActivity[] = activitiesRes.ok
    ? ((await activitiesRes.json()) as IntervalsActivity[])
    : [];
  const activity =
    activities
      .filter((a) => a.type === "Run" || a.type === "VirtualRun")
      .sort((a, b) =>
        (b.start_date_local ?? b.start_date).localeCompare(
          a.start_date_local ?? a.start_date,
        ),
      ).at(0) ?? null;

  const activityId = activity?.id ?? null;
  const distance = activity?.distance ?? null;
  const movingTimeMs =
    activity?.moving_time != null ? activity.moving_time * 1000 : null;
  const avgHr =
    activity?.average_hr ?? activity?.average_heartrate ?? null;

  // Compute prescribed carbs from any WORKOUT event with carbs_per_hour
  const events: { category: string; carbs_per_hour?: number }[] =
    eventsRes.ok ? ((await eventsRes.json()) as { category: string; carbs_per_hour?: number }[]) : [];
  const planned = events.find(
    (e) => e.category === "WORKOUT" && e.carbs_per_hour != null,
  );
  const prescribedCarbsG =
    planned?.carbs_per_hour && movingTimeMs != null
      ? Math.round(planned.carbs_per_hour * (movingTimeMs / MS_PER_HOUR))
      : null;

  return { activityId, prescribedCarbsG, distance, movingTimeMs, avgHr };
}

// --- Timezone ---

/**
 * Get current time expressed in a given IANA timezone.
 * Both this and `new Date(start_date_local)` go through the same
 * server-local parse, so the difference between them is correct.
 */
export function nowInTimezone(tz: string): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

/** Resolve timezone: use cached value or fetch from Intervals.icu and cache it. */
export async function resolveTimezone(
  email: string,
  cached: string | undefined,
  apiKey: string,
): Promise<string | null> {
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/athlete/0`, {
    headers: { Authorization: authHeader(apiKey) },
  });
  if (!res.ok) return null;

  const athlete = (await res.json()) as { timezone?: string };
  const tz: string = athlete.timezone ?? "UTC";
  await saveUserSettings(email, { timezone: tz });
  return tz;
}
