"use client";

import useSWR from "swr";
import { fetchPaceCurves } from "@/lib/intervalsApi";
import type { PaceCurveData } from "@/lib/types";

export interface PaceCurvesHookResult {
  data: PaceCurveData | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePaceCurves(apiKey: string, curveId = "all"): PaceCurvesHookResult {
  const { data, error, isLoading } = useSWR<PaceCurveData | null, Error>(
    apiKey ? ["pace-curves", apiKey, curveId] : null,
    () => fetchPaceCurves(apiKey, curveId),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  );

  return {
    data: data ?? null,
    isLoading,
    error: error ?? null,
  };
}
