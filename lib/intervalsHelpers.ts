import { API_BASE } from "./constants";
import { authHeader } from "./intervalsApi";
import { saveUserSettings } from "./settings";

const MS_PER_HOUR = 3_600_000;

// --- Prescribed carbs ---

/** Look up today's planned WORKOUT event and compute prescribed carbs from carbs_per_hour × duration. */
export async function computePrescribedCarbs(
  apiKey: string,
  durationMs: number,
  runDate: Date,
): Promise<number | null> {
  const dateStr = runDate.toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${dateStr}T00:00:00&newest=${dateStr}T23:59:59`,
      { headers: { Authorization: authHeader(apiKey) } },
    );
    if (!res.ok) return null;
    const events = await res.json();
    const planned = events.find(
      (e: { category: string; carbs_per_hour?: number }) =>
        e.category === "WORKOUT" && e.carbs_per_hour != null,
    );
    if (!planned?.carbs_per_hour) return null;
    return Math.round(planned.carbs_per_hour * (durationMs / MS_PER_HOUR));
  } catch {
    return null;
  }
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
