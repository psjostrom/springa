import { API_BASE } from "./constants";
import { authHeader } from "./intervalsApi";
import { saveUserSettings } from "./settings";
import type { IntervalsActivity } from "./types";

const MS_PER_HOUR = 3_600_000;

// --- Run context (activityId + prescribed carbs) ---

export interface RunContext {
  activityId: string | null;
  prescribedCarbsG: number | null;
}

/** Fetch the latest activity and compute prescribed carbs for a given run date. */
export async function fetchRunContext(
  apiKey: string,
  durationMs: number,
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
  let activityId: string | null = null;
  if (activitiesRes.ok) {
    const activities: IntervalsActivity[] = await activitiesRes.json();
    const runs = activities.filter(
      (a) => a.type === "Run" || a.type === "VirtualRun",
    );
    if (runs.length > 0) {
      const sorted = runs.sort((a, b) =>
        (b.start_date_local ?? b.start_date).localeCompare(
          a.start_date_local ?? a.start_date,
        ),
      );
      activityId = sorted[0].id;
    }
  }

  // Compute prescribed carbs from any WORKOUT event with carbs_per_hour
  let prescribedCarbsG: number | null = null;
  if (eventsRes.ok) {
    const events = await eventsRes.json();
    const planned = events.find(
      (e: { category: string; carbs_per_hour?: number }) =>
        e.category === "WORKOUT" && e.carbs_per_hour != null,
    );
    if (planned?.carbs_per_hour) {
      prescribedCarbsG = Math.round(
        planned.carbs_per_hour * (durationMs / MS_PER_HOUR),
      );
    }
  }

  return { activityId, prescribedCarbsG };
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

  const athlete = await res.json();
  const tz: string = athlete.timezone ?? "UTC";
  await saveUserSettings(email, { timezone: tz });
  return tz;
}
