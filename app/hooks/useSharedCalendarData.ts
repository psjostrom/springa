"use client";

import useSWR from "swr";
import { startOfMonth, subMonths, endOfMonth, addMonths, format } from "date-fns";
import { fetchCalendar } from "@/lib/intervalsClient";
import { CALENDAR_LOOKBACK_MONTHS } from "@/lib/constants";
import type { CalendarEvent } from "@/lib/types";

/**
 * Single source of truth for calendar events across all screens.
 * Fetches once with the widest range (24 months back, 6 months forward).
 * Paired events (planned workouts linked to completed activities) are
 * automatically deduplicated by the proxy route.
 */
export function useSharedCalendarData() {
  const { data: events, error, isLoading, mutate } = useSWR<CalendarEvent[], Error>(
    "calendar-data",
    async () => {
      const start = startOfMonth(subMonths(new Date(), CALENDAR_LOOKBACK_MONTHS));
      const end = endOfMonth(addMonths(new Date(), 6));
      return fetchCalendar(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  return {
    events: events ?? [],
    isLoading,
    error: error?.message ?? null,
    reload: () => { void mutate(); },
  };
}
