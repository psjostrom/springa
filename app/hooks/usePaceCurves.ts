"use client";

import useSWR from "swr";
import { useAtomValue } from "jotai";
import { fetchPaceCurves } from "@/lib/intervalsClient";
import { intervalsConnectedAtom } from "../atoms";
import type { PaceCurveData } from "@/lib/types";

export interface PaceCurvesHookResult {
  data: PaceCurveData | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePaceCurves(curveId = "all"): PaceCurvesHookResult {
  const connected = useAtomValue(intervalsConnectedAtom);
  const { data, error, isLoading } = useSWR<PaceCurveData | null, Error>(
    connected ? ["pace-curves", curveId] : null,
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
