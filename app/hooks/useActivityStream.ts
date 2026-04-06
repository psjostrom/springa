"use client";

import useSWR from "swr";
import { useAtomValue } from "jotai";
import { fetchActivityStreams } from "@/lib/intervalsClient";
import { intervalsConnectedAtom } from "../atoms";
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
): { data: ActivityStreamData | null; isLoading: boolean; error: Error | null } {
  const connected = useAtomValue(intervalsConnectedAtom);
  const { data, error, isLoading } = useSWR<ActivityStreamData, Error>(
    activityId && connected ? ["activity-stream", activityId] : null,
    async ([, id]: readonly [string, string]) => {
      const details = await fetchActivityStreams(id);
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
