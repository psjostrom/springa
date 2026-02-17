import {
  startOfDay,
  addDays,
  differenceInCalendarDays,
  format,
} from "date-fns";
import type { CalendarEvent } from "./types";

export interface FitnessDataPoint {
  date: string; // yyyy-MM-dd
  ctl: number; // Chronic Training Load (Fitness) — 42-day EMA
  atl: number; // Acute Training Load (Fatigue) — 7-day EMA
  tsb: number; // Training Stress Balance (Form) = CTL - ATL
  load: number; // raw daily load
}

export interface FitnessInsights {
  currentCtl: number;
  currentAtl: number;
  currentTsb: number;
  ctlTrend: number; // change over last 28 days
  peakCtl: number;
  peakCtlDate: string;
  formZone: "high-risk" | "optimal" | "grey" | "fresh" | "transition";
  formZoneLabel: string;
  totalActivities7d: number;
  totalLoad7d: number;
  totalActivities28d: number;
  totalLoad28d: number;
  rampRate: number; // weekly CTL change rate
}

const CTL_DAYS = 42;
const ATL_DAYS = 7;

/**
 * Compute daily fitness (CTL), fatigue (ATL), and form (TSB) from activity loads.
 * Uses exponentially weighted moving averages matching the Banister impulse-response model.
 */
export function computeFitnessData(
  events: CalendarEvent[],
  historyDays: number = 365,
): FitnessDataPoint[] {
  const today = startOfDay(new Date());
  const startDate = addDays(today, -historyDays);

  // Build a map of daily total training loads
  const dailyLoads = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "completed" || !event.load) continue;
    const key = format(startOfDay(event.date), "yyyy-MM-dd");
    dailyLoads.set(key, (dailyLoads.get(key) || 0) + event.load);
  }

  const totalDays = differenceInCalendarDays(today, startDate) + 1;
  const result: FitnessDataPoint[] = [];

  let ctl = 0;
  let atl = 0;

  // Use ramp-up period before the visible window for accurate initial values
  const rampUpDays = CTL_DAYS * 2; // 84 days before visible start
  const rampUpStart = addDays(startDate, -rampUpDays);

  for (let i = 0; i < rampUpDays; i++) {
    const d = addDays(rampUpStart, i);
    const key = format(d, "yyyy-MM-dd");
    const load = dailyLoads.get(key) || 0;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
  }

  // Now compute the visible data
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(startDate, i);
    const key = format(d, "yyyy-MM-dd");
    const load = dailyLoads.get(key) || 0;

    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
    const tsb = ctl - atl;

    result.push({
      date: key,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      load: Math.round(load * 10) / 10,
    });
  }

  // Trim leading days before any training data exists
  const firstLoadIdx = result.findIndex((dp) => dp.load > 0);
  if (firstLoadIdx > 0) {
    return result.slice(firstLoadIdx);
  }

  return result;
}

function getFormZone(tsb: number): {
  zone: FitnessInsights["formZone"];
  label: string;
} {
  if (tsb < -20) return { zone: "high-risk", label: "High Risk" };
  if (tsb < -10) return { zone: "optimal", label: "Optimal Training" };
  if (tsb < 5) return { zone: "grey", label: "Grey Zone" };
  if (tsb < 15) return { zone: "fresh", label: "Fresh" };
  return { zone: "transition", label: "Transition" };
}

/**
 * Derive insights from fitness data and raw events.
 */
export function computeInsights(
  fitnessData: FitnessDataPoint[],
  events: CalendarEvent[],
): FitnessInsights {
  const today = startOfDay(new Date());
  const latest = fitnessData[fitnessData.length - 1];
  const currentCtl = latest?.ctl ?? 0;
  const currentAtl = latest?.atl ?? 0;
  const currentTsb = latest?.tsb ?? 0;

  // CTL 28 days ago
  const idx28 = Math.max(0, fitnessData.length - 29);
  const ctl28ago = fitnessData[idx28]?.ctl ?? 0;
  const ctlTrend = currentCtl - ctl28ago;

  // Peak CTL
  let peakCtl = 0;
  let peakCtlDate = "";
  for (const dp of fitnessData) {
    if (dp.ctl > peakCtl) {
      peakCtl = dp.ctl;
      peakCtlDate = dp.date;
    }
  }

  // Form zone
  const { zone: formZone, label: formZoneLabel } = getFormZone(currentTsb);

  // Activity stats for last 7 and 28 days
  const completedEvents = events.filter((e) => e.type === "completed");
  const last7d = completedEvents.filter(
    (e) => differenceInCalendarDays(today, startOfDay(e.date)) < 7,
  );
  const last28d = completedEvents.filter(
    (e) => differenceInCalendarDays(today, startOfDay(e.date)) < 28,
  );

  const totalLoad7d = last7d.reduce((sum, e) => sum + (e.load ?? 0), 0);
  const totalLoad28d = last28d.reduce((sum, e) => sum + (e.load ?? 0), 0);

  // Ramp rate: CTL change per week (last 7 days)
  const idx7 = Math.max(0, fitnessData.length - 8);
  const ctl7ago = fitnessData[idx7]?.ctl ?? 0;
  const rampRate = currentCtl - ctl7ago;

  return {
    currentCtl: Math.round(currentCtl * 10) / 10,
    currentAtl: Math.round(currentAtl * 10) / 10,
    currentTsb: Math.round(currentTsb * 10) / 10,
    ctlTrend: Math.round(ctlTrend * 10) / 10,
    peakCtl: Math.round(peakCtl * 10) / 10,
    peakCtlDate,
    formZone,
    formZoneLabel,
    totalActivities7d: last7d.length,
    totalLoad7d: Math.round(totalLoad7d),
    totalActivities28d: last28d.length,
    totalLoad28d: Math.round(totalLoad28d),
    rampRate: Math.round(rampRate * 10) / 10,
  };
}
