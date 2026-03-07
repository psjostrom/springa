"use client";

import useSWR from "swr";
import { fetchPaceCurves } from "@/lib/intervalsApi";
import type { PaceCurveData } from "@/lib/types";

export interface PaceCurvesHookResult {
  data: PaceCurveData | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePaceCurves(apiKey: string): PaceCurvesHookResult {
  const { data, error, isLoading } = useSWR<PaceCurveData | null, Error>(
    apiKey ? ["pace-curves", apiKey] : null,
    () => fetchPaceCurves(apiKey),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  );

  return {
    data: data ?? null,
    isLoading,
    error: error ?? null,
  };
}
