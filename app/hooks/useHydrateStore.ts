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
  calendarReloadAtom,
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
} from "../atoms";
import { useSharedCalendarData } from "./useSharedCalendarData";
import { useCurrentBG } from "./useCurrentBG";
import { useRunData } from "./useRunData";
import { usePaceCurves } from "./usePaceCurves";
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

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: UserSettings) => {
        setSettings(data);
      })
      .catch(() => {
        setSettings({});
      })
      .finally(() => {
        setSettingsLoading(false);
      });
  }, [setSettings, setSettingsLoading]);

  const apiKey = useAtomValue(apiKeyAtom);

  // ─── Calendar ──────────────────────────────────────────
  const cal = useSharedCalendarData(apiKey);
  const setCalEvents = useSetAtom(calendarEventsAtom);
  const setCalLoading = useSetAtom(calendarLoadingAtom);
  const setCalError = useSetAtom(calendarErrorAtom);
  const setCalReload = useSetAtom(calendarReloadAtom);

  useEffect(() => {
    setCalEvents(cal.events);
  }, [cal.events, setCalEvents]);
  useEffect(() => {
    setCalLoading(cal.isLoading);
  }, [cal.isLoading, setCalLoading]);
  useEffect(() => {
    setCalError(cal.error);
  }, [cal.error, setCalError]);
  useEffect(() => {
    setCalReload(cal.reload);
  }, [cal.reload, setCalReload]);

  // ─── Current BG ────────────────────────────────────────
  const bg = useCurrentBG();
  const setCurrentBG = useSetAtom(currentBGAtom);
  const setTrend = useSetAtom(trendAtom);
  const setTrendSlope = useSetAtom(trendSlopeAtom);
  const setLastUpdate = useSetAtom(lastBGUpdateAtom);
  const setReadings = useSetAtom(readingsAtom);

  useEffect(() => {
    setCurrentBG(bg.currentBG);
  }, [bg.currentBG, setCurrentBG]);
  useEffect(() => {
    setTrend(bg.trend);
  }, [bg.trend, setTrend]);
  useEffect(() => {
    setTrendSlope(bg.trendSlope);
  }, [bg.trendSlope, setTrendSlope]);
  useEffect(() => {
    setLastUpdate(bg.lastUpdate);
  }, [bg.lastUpdate, setLastUpdate]);
  useEffect(() => {
    setReadings(bg.readings);
  }, [bg.readings, setReadings]);

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
  }, [runData.bgModel, setBgModel]);
  useEffect(() => {
    setBgModelLoading(runData.bgModelLoading);
  }, [runData.bgModelLoading, setBgModelLoading]);
  useEffect(() => {
    setBgModelProgress(runData.bgModelProgress);
  }, [runData.bgModelProgress, setBgModelProgress]);
  useEffect(() => {
    setBgActivityNames(runData.bgActivityNames);
  }, [runData.bgActivityNames, setBgActivityNames]);
  useEffect(() => {
    setRunBGContexts(runData.runBGContexts);
  }, [runData.runBGContexts, setRunBGContexts]);
  useEffect(() => {
    setCachedActivities(runData.cachedActivities);
  }, [runData.cachedActivities, setCachedActivities]);

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
  }, [wellnessData, setWellnessEntries]);
  useEffect(() => {
    setWellnessLoading(wellnessIsLoading);
  }, [wellnessIsLoading, setWellnessLoading]);

  // ─── Pace Curves ───────────────────────────────────────
  const pc = usePaceCurves(apiKey);
  const setPaceCurveData = useSetAtom(paceCurveDataAtom);
  const setPaceCurveLoading = useSetAtom(paceCurveLoadingAtom);

  useEffect(() => {
    setPaceCurveData(pc.data);
  }, [pc.data, setPaceCurveData]);
  useEffect(() => {
    setPaceCurveLoading(pc.isLoading);
  }, [pc.isLoading, setPaceCurveLoading]);
}
