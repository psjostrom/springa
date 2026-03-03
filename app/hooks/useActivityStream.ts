"use client";

import useSWR from "swr";
import { fetchActivityDetails } from "@/lib/intervalsApi";
import type { StreamData } from "@/lib/types";

export interface ActivityStreamData {
  streamData: StreamData;
  avgHr?: number;
  maxHr?: number;
}

/**
 * Fetches and caches stream data for a completed activity.
 * Uses SWR for deduplication and caching — safe under React Strict Mode.
 */
export function useActivityStream(
  activityId: string | null,
  apiKey: string,
): { data: ActivityStreamData | null; isLoading: boolean; error: Error | null } {
  const { data, error, isLoading } = useSWR<ActivityStreamData, Error>(
    activityId && apiKey ? ["activity-stream", activityId, apiKey] : null,
    async ([, id, key]: readonly [string, string, string]) => {
      const details = await fetchActivityDetails(id, key);
      return {
        streamData: details.streamData ?? {},
        avgHr: details.avgHr,
        maxHr: details.maxHr,
      };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  return {
    data: data ?? null,
    isLoading,
    error: error ?? null,
  };
}
