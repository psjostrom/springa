"use client";

import useSWR from "swr";
import { format, subDays } from "date-fns";
import { fetchWellnessData, type WellnessEntry } from "@/lib/intervalsApi";

export interface WellnessData {
  entries: WellnessEntry[];
  isLoading: boolean;
  error: Error | null;
}

const LOOKBACK_DAYS = 35; // 28-day baseline + 7 days for display

export function useWellnessData(apiKey: string): WellnessData {
  const { data, error, isLoading } = useSWR<WellnessEntry[], Error>(
    apiKey ? ["wellness", apiKey] : null,
    async () => {
      const today = new Date();
      const oldest = format(subDays(today, LOOKBACK_DAYS), "yyyy-MM-dd");
      const newest = format(today, "yyyy-MM-dd");
      return fetchWellnessData(apiKey, oldest, newest);
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000, // 1 minute
    }
  );

  return {
    entries: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
