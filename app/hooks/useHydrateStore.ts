"use client";

import { useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import useSWR from "swr";
import {
  settingsAtom,
  settingsLoadingAtom,
  apiKeyAtom,
  calendarEventsAtom,
  calendarLoadingAtom,
  calendarErrorAtom,
  currentBGAtom,
  trendAtom,
  trendSlopeAtom,
  lastBGUpdateAtom,
  readingsAtom,
  bgModelAtom,
  bgModelLoadingAtom,
  bgModelProgressAtom,
  bgActivityNamesAtom,
  runBGContextsAtom,
  cachedActivitiesAtom,
  wellnessEntriesAtom,
  wellnessLoadingAtom,
  paceCurveDataAtom,
  paceCurveLoadingAtom,
  phaseInfoAtom,
} from "../atoms";
import { useSharedCalendarData } from "./useSharedCalendarData";
import { useCurrentBG } from "./useCurrentBG";
import { useRunData } from "./useRunData";
import { usePaceCurves } from "./usePaceCurves";
import { computePhaseInfo } from "./usePhaseInfo";
import type { UserSettings } from "@/lib/settings";
import type { WellnessEntry } from "@/lib/intervalsApi";

/**
 * Bridge hook: calls existing data-fetching hooks and syncs their outputs
 * into Jotai atoms so screens can consume data without prop drilling.
 *
 * Must be called exactly once, in the root layout component.
 */
export function useHydrateStore() {
  // ─── Settings ──────────────────────────────────────────
  const setSettings = useSetAtom(settingsAtom);
  const setSettingsLoading = useSetAtom(settingsLoadingAtom);
  const setPhaseInfo = useSetAtom(phaseInfoAtom);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserSettings) => {
        setSettings(data);
        setPhaseInfo(computePhaseInfo(
          data.raceDate ?? "2026-06-13",
          data.totalWeeks ?? 18,
        ));
      })
      .catch(() => {
        setSettings({});
      })
      .finally(() => {
        setSettingsLoading(false);
      });
  }, [setSettings, setSettingsLoading, setPhaseInfo]);

  const apiKey = useAtomValue(apiKeyAtom);

  // ─── Calendar ──────────────────────────────────────────
  const cal = useSharedCalendarData(apiKey);
  const setCalEvents = useSetAtom(calendarEventsAtom);
  const setCalLoading = useSetAtom(calendarLoadingAtom);
  const setCalError = useSetAtom(calendarErrorAtom);

  useEffect(() => {
    setCalEvents(cal.events);
    setCalLoading(cal.isLoading);
    setCalError(cal.error);
  }, [cal.events, cal.isLoading, cal.error, setCalEvents, setCalLoading, setCalError]);

  // ─── Current BG ────────────────────────────────────────
  const bg = useCurrentBG();
  const setCurrentBG = useSetAtom(currentBGAtom);
  const setTrend = useSetAtom(trendAtom);
  const setTrendSlope = useSetAtom(trendSlopeAtom);
  const setLastUpdate = useSetAtom(lastBGUpdateAtom);
  const setReadings = useSetAtom(readingsAtom);

  useEffect(() => {
    setCurrentBG(bg.currentBG);
    setTrend(bg.trend);
    setTrendSlope(bg.trendSlope);
    setLastUpdate(bg.lastUpdate);
    setReadings(bg.readings);
  }, [bg.currentBG, bg.trend, bg.trendSlope, bg.lastUpdate, bg.readings,
      setCurrentBG, setTrend, setTrendSlope, setLastUpdate, setReadings]);

  // ─── Run Data / BG Model ──────────────────────────────
  const runData = useRunData(apiKey, true, cal.events, bg.readings);
  const setBgModel = useSetAtom(bgModelAtom);
  const setBgModelLoading = useSetAtom(bgModelLoadingAtom);
  const setBgModelProgress = useSetAtom(bgModelProgressAtom);
  const setBgActivityNames = useSetAtom(bgActivityNamesAtom);
  const setRunBGContexts = useSetAtom(runBGContextsAtom);
  const setCachedActivities = useSetAtom(cachedActivitiesAtom);

  useEffect(() => {
    setBgModel(runData.bgModel);
    setBgModelLoading(runData.bgModelLoading);
    setBgModelProgress(runData.bgModelProgress);
    setBgActivityNames(runData.bgActivityNames);
    setRunBGContexts(runData.runBGContexts);
    setCachedActivities(runData.cachedActivities);
  }, [runData.bgModel, runData.bgModelLoading, runData.bgModelProgress,
      runData.bgActivityNames, runData.runBGContexts, runData.cachedActivities,
      setBgModel, setBgModelLoading, setBgModelProgress,
      setBgActivityNames, setRunBGContexts, setCachedActivities]);

  // ─── Wellness ──────────────────────────────────────────
  const {
    data: wellnessData = [],
    isLoading: wellnessIsLoading,
  } = useSWR<WellnessEntry[]>(
    "/api/wellness?days=365",
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const setWellnessEntries = useSetAtom(wellnessEntriesAtom);
  const setWellnessLoading = useSetAtom(wellnessLoadingAtom);

  useEffect(() => {
    setWellnessEntries(wellnessData);
    setWellnessLoading(wellnessIsLoading);
  }, [wellnessData, wellnessIsLoading, setWellnessEntries, setWellnessLoading]);

  // ─── Pace Curves ───────────────────────────────────────
  const pc = usePaceCurves(apiKey);
  const setPaceCurveData = useSetAtom(paceCurveDataAtom);
  const setPaceCurveLoading = useSetAtom(paceCurveLoadingAtom);

  useEffect(() => {
    setPaceCurveData(pc.data);
    setPaceCurveLoading(pc.isLoading);
  }, [pc.data, pc.isLoading, setPaceCurveData, setPaceCurveLoading]);
}
