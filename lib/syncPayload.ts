import type { AdaptedEvent } from "./adaptPlan";

export interface SyncPayloadItem {
  eventId: number;
  description: string;
  fuelRate: number | null;
}

export function hasLowConfidenceFuel(event: AdaptedEvent): boolean {
  return event.changes.some((c) => c.type === "fuel" && c.confidence === "low");
}

/**
 * Build the sync payload from adapted events, respecting confidence gating.
 *
 * - Events with only low-confidence fuel changes are excluded unless opted in.
 * - Events with a swap + low-confidence fuel sync the swap but revert to the
 *   original fuel rate (preserving whatever Intervals.icu already has if the
 *   original had no fuel rate set).
 */
export function buildSyncPayload(
  events: AdaptedEvent[],
  optedIn: Record<string, boolean>,
): SyncPayloadItem[] {
  return events
    .filter((e) => {
      const isLowFuel = hasLowConfidenceFuel(e);
      const isOptedIn = optedIn[e.original.id] ?? false;
      const hasSwap = e.changes.some((c) => c.type === "swap");
      return !(isLowFuel && !isOptedIn && !hasSwap);
    })
    .map((e) => {
      const eventId = Number(e.original.id.replace("event-", ""));
      const isLowFuel = hasLowConfidenceFuel(e);
      const isOptedIn = optedIn[e.original.id] ?? false;
      // Revert to original fuel if low-confidence and not opted in (swap-only sync).
      // If the original had no fuel rate, fuelRate will be undefined/null —
      // the caller skips carbs_per_hour, preserving whatever Intervals.icu has.
      const fuelRate = isLowFuel && !isOptedIn ? (e.original.fuelRate ?? null) : e.fuelRate;

      return { eventId, description: e.description, fuelRate };
    });
}
