"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useAtomValue } from "jotai";
import { fetchCalendar } from "@/lib/intervalsClient";
import {
  advanceSharedCalendarKey,
  buildSharedCalendarKey,
  msUntilNextSharedCalendarBoundary,
  type SharedCalendarKey,
} from "@/lib/sharedCalendarData";
import { intervalsConnectedAtom } from "../atoms";
import type { CalendarEvent } from "@/lib/types";

/**
 * Single source of truth for calendar events across all screens.
 * Fetches once with the widest range (24 months back, 6 months forward).
 */
export function useSharedCalendarData() {
  const connected = useAtomValue(intervalsConnectedAtom);
  const [windowKey, setWindowKey] = useState<SharedCalendarKey>(() => buildSharedCalendarKey());

  const currentWindowKey = buildSharedCalendarKey();
  const swrKey = connected
    ? (
        windowKey[1] === currentWindowKey[1] && windowKey[2] === currentWindowKey[2]
          ? windowKey
          : currentWindowKey
      )
    : null;
  const swrOldest = swrKey?.[1];
  const swrNewest = swrKey?.[2];

  useEffect(() => {
    if (!connected) return;

    const timeoutId = setTimeout(() => {
      setWindowKey((previousKey) => advanceSharedCalendarKey(previousKey));
    }, msUntilNextSharedCalendarBoundary());

    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, swrOldest, swrNewest]);

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
