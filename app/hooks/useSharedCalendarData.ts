"use client";

import useSWR from "swr";
import { useAtomValue } from "jotai";
import { startOfMonth, subMonths, endOfMonth, addMonths, format } from "date-fns";
import { fetchCalendar } from "@/lib/intervalsClient";
import { CALENDAR_LOOKBACK_MONTHS } from "@/lib/constants";
import { intervalsConnectedAtom } from "../atoms";
import type { CalendarEvent } from "@/lib/types";

/**
 * Single source of truth for calendar events across all screens.
 * Fetches once with the widest range (24 months back, 6 months forward).
 */
export function useSharedCalendarData() {
  const connected = useAtomValue(intervalsConnectedAtom);
  const { data: events, error, isLoading, mutate } = useSWR<CalendarEvent[], Error>(
    connected ? "calendar-data" : null,
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
