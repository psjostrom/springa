import type { CalendarEvent } from "./types";
import type { ZoneSegment } from "./paceCalibration";

type EventCategory = CalendarEvent["category"];

const EXTERNAL_ID_CATEGORY_MAP: Record<string, EventCategory> = {
  speed: "interval",
  club: "interval",
  easy: "easy",
  free: "easy",
  long: "long",
  race: "race",
  ondemand: "other",
};

export function categoryFromExternalId(
  externalId: string | undefined,
): EventCategory | null {
  if (!externalId) return null;
  const prefix = externalId.split("-")[0];
  return EXTERNAL_ID_CATEGORY_MAP[prefix] ?? null;
}

/** Stockholm monthly average temperatures (C). Index 0 = January. */
const STOCKHOLM_MONTHLY_TEMP = [-1, -1, 2, 7, 12, 17, 20, 19, 14, 8, 3, 0];

const HR_PER_DEGREE_ABOVE_THRESHOLD = 1.8;
const HEAT_THRESHOLD_C = 15;

/**
 * Correct HR for temperature effects on cardiac cost.
 * Above 15C, HR inflates ~1.8 bpm per degree. Returns the corrected HR
 * that removes the heat component, making cross-season comparisons fair.
 * @param month 0-indexed (0 = January, 11 = December)
 */
export function temperatureCorrectHr(avgHr: number, month: number): number {
  const temp = STOCKHOLM_MONTHLY_TEMP[month];
  const correction = Math.max(0, temp - HEAT_THRESHOLD_C) * HR_PER_DEGREE_ABOVE_THRESHOLD;
  return avgHr - correction;
}

export interface CardiacCostResult {
  changePercent: number;
  direction: "improving" | "regressing";
  recentAvg: number;
  previousAvg: number;
}

const CARDIAC_COST_IMPROVEMENT_PCT = -3;
const CARDIAC_COST_REGRESSION_PCT = 5;
const MIN_SEGMENTS_PER_WINDOW = 4;
const RECENT_WINDOW_DAYS = 28;
const PREVIOUS_WINDOW_DAYS = 56;

export function computeCardiacCostTrend(
  segments: ZoneSegment[],
): CardiacCostResult | null {
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const previousCutoff = now - PREVIOUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const z2Segments = segments.filter((s) => s.zone === "z2" && s.activityDate);

  const recent: number[] = [];
  const previous: number[] = [];

  for (const seg of z2Segments) {
    const dateMs = new Date(seg.activityDate).getTime();
    if (isNaN(dateMs)) continue;

    const month = new Date(seg.activityDate).getMonth();
    const correctedHr = temperatureCorrectHr(seg.avgHr, month);
    const cost = correctedHr * seg.avgPace;

    if (dateMs >= recentCutoff) {
      recent.push(cost);
    } else if (dateMs >= previousCutoff) {
      previous.push(cost);
    }
  }

  if (recent.length < MIN_SEGMENTS_PER_WINDOW || previous.length < MIN_SEGMENTS_PER_WINDOW) {
    return null;
  }

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

  if (changePercent <= CARDIAC_COST_IMPROVEMENT_PCT) {
    return { changePercent, direction: "improving", recentAvg, previousAvg };
  }
  if (changePercent >= CARDIAC_COST_REGRESSION_PCT) {
    return { changePercent, direction: "regressing", recentAvg, previousAvg };
  }

  return null;
}
