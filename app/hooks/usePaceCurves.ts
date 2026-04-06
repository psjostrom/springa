"use client";

import useSWR from "swr";
import { fetchPaceCurves } from "@/lib/intervalsClient";
import type { PaceCurveData } from "@/lib/types";

export interface PaceCurvesHookResult {
  data: PaceCurveData | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePaceCurves(curveId = "all"): PaceCurvesHookResult {
  const { data, error, isLoading } = useSWR<PaceCurveData | null, Error>(
    ["pace-curves", curveId],
    () => fetchPaceCurves(curveId),
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
