"use client";

import useSWR from "swr";
import { useAtomValue } from "jotai";
import { fetchCalendar } from "@/lib/intervalsClient";
import { buildSharedCalendarKey, type SharedCalendarKey } from "@/lib/sharedCalendarData";
import { intervalsConnectedAtom } from "../atoms";
import type { CalendarEvent } from "@/lib/types";

/**
 * Single source of truth for calendar events across all screens.
 * Fetches once with the widest range (24 months back, 6 months forward).
 */
export function useSharedCalendarData() {
  const connected = useAtomValue(intervalsConnectedAtom);
  const swrKey = connected ? buildSharedCalendarKey() : null;
  const { data: events, error, isLoading, mutate } = useSWR<CalendarEvent[], Error>(
    swrKey,
    ([, oldest, newest]: SharedCalendarKey) => fetchCalendar(oldest, newest),
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
