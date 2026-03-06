"use client";

import useSWR from "swr";
import { startOfMonth, subMonths, endOfMonth, addMonths } from "date-fns";
import { fetchCalendarData } from "@/lib/intervalsApi";
import { CALENDAR_LOOKBACK_MONTHS } from "@/lib/constants";
import type { CalendarEvent } from "@/lib/types";

const EMPTY_EVENTS: CalendarEvent[] = [];

/**
 * Single source of truth for calendar events across all screens.
 * Fetches once with the widest range (24 months back, 6 months forward).
 * Paired events (planned workouts linked to completed activities) are
 * automatically deduplicated by fetchCalendarData.
 */
export function useSharedCalendarData(apiKey: string) {
  const { data: events, error, isLoading, mutate } = useSWR<CalendarEvent[], Error>(
    apiKey ? ["calendar-data", apiKey] : null,
    async ([, key]: readonly [string, string]) => {
      const start = startOfMonth(subMonths(new Date(), CALENDAR_LOOKBACK_MONTHS));
      const end = endOfMonth(addMonths(new Date(), 6));
      return fetchCalendarData(key, start, end);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  return {
    events: events ?? EMPTY_EVENTS,
    isLoading,
    error: error?.message ?? null,
    reload: () => { void mutate(); },
  };
}
