"use client";

import { useState, useEffect, useCallback } from "react";
import { startOfMonth, subMonths, endOfMonth, addMonths } from "date-fns";
import { fetchCalendarData } from "@/lib/intervalsApi";
import { CALENDAR_LOOKBACK_MONTHS } from "@/lib/constants";
import type { CalendarEvent } from "@/lib/types";

/**
 * Single source of truth for calendar events across all screens.
 * Fetches once with the widest range (24 months back, 6 months forward).
 * Paired events (planned workouts linked to completed activities) are
 * automatically deduplicated by fetchCalendarData.
 */
export function useSharedCalendarData(apiKey: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const start = startOfMonth(subMonths(new Date(), CALENDAR_LOOKBACK_MONTHS));
      const end = endOfMonth(addMonths(new Date(), 6));
      const data = await fetchCalendarData(apiKey, start, end);
      setEvents(data);
    } catch (err) {
      console.error("useSharedCalendarData: failed", err);
      setError("Failed to load calendar data. Check your API key and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    void load();
  }, [apiKey, load]);

  return { events, isLoading, error, reload: load };
}
