import type { ClothingRecommendation } from "./clothingCalculator";
import { recommendClothing } from "./clothingCalculator";
import { classifyHR, getWorkoutCategory } from "./constants";
import {
  classifyPacePct,
  parseWorkoutStructure,
} from "./descriptionParser";
import { fetchForecast, getWeatherForTime } from "./smhi";
import { localToUtcMs } from "./timezone";
import type { IntervalsEvent, ZoneName } from "./types";
import {
  resolveWorkoutMetrics,
  type WorkoutEstimationContext,
  type WorkoutMetricDistance,
  type WorkoutMetricDuration,
} from "./workoutMath";
import { calculateCanonicalPlannedPrescription } from "./workoutPrescriptions";
import { formatCalendarEventId } from "./calendarEventId";

export type PlannedWorkoutCategory =
  | "easy"
  | "long"
  | "interval"
  | "race"
  | "other";

export interface PlannedWorkoutDetail {
  event: {
    id: `event-${number}`;
    intervalsEventId: number;
    startDateLocal: string;
    name: string;
    category: PlannedWorkoutCategory;
    description: string;
  };
  structure: {
    sections: {
      name: string;
      repeats: number | null;
      steps: {
        label: string | null;
        duration: string;
        zone: ZoneName;
        detail: string;
      }[];
    }[];
    timeline: {
      durationMinutes: number;
      intensityPercent: number;
      zone: ZoneName;
      estimated: boolean;
    }[];
  };
  metrics: {
    duration: WorkoutMetricDuration | null;
    distance: WorkoutMetricDistance | null;
    fuelRateGPerHour: number | null;
    prescribedCarbsG: number | null;
  };
  preRunCarbsG: number | null;
  clothing:
    | { status: "available"; recommendation: ClothingRecommendation }
    | {
        status: "unavailable";
        reason: "outside-window" | "forecast-unavailable";
      };
}

export class UnsupportedPlannedWorkoutError extends Error {
  constructor() {
    super("Event is not a planned workout");
    this.name = "UnsupportedPlannedWorkoutError";
  }
}

export interface BuildPlannedWorkoutDetailInput {
  event: IntervalsEvent;
  lthr?: number;
  hrZones?: number[];
  estimationContext: WorkoutEstimationContext;
  timezone: string;
  warmthPreference?: number;
  preRunCarbsG: number | null;
}

const WEATHER_PAST_WINDOW_MS = 12 * 60 * 60 * 1000;
const WEATHER_FUTURE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function buildPlannedWorkoutDetail({
  event,
  lthr,
  hrZones,
  estimationContext,
  timezone,
  warmthPreference,
  preRunCarbsG,
}: BuildPlannedWorkoutDetailInput): Promise<PlannedWorkoutDetail> {
  if (
    event.category !== "WORKOUT" ||
    event.type !== "Run" ||
    event.paired_activity_id != null
  ) {
    throw new UnsupportedPlannedWorkoutError();
  }

  const name = event.name ?? "";
  const description = event.description ?? "";
  const category = getWorkoutCategory(name);
  const validLthr = lthr ?? null;
  const validHrZones = hrZones?.length === 5 ? hrZones : null;
  const isPaceBased =
    description.includes("/km Pace") || description.includes("% pace");
  const isHrBased = description.includes("% LTHR");
  const hasHrCalibration = validLthr != null && validHrZones != null;
  const hasPaceTable = Object.values(
    estimationContext.paceTable ?? {},
  ).some(Boolean);
  const hasPaceCalibration =
    estimationContext.thresholdPace != null || hasPaceTable;
  const derivable = isPaceBased
    ? hasPaceCalibration
    : isHrBased
      ? hasHrCalibration
      : true;
  const sections = derivable
    ? parseWorkoutStructure(
        description,
        validLthr ?? 0,
        validHrZones ?? [],
        estimationContext.thresholdPace,
      )
    : [];
  const resolved = derivable
    ? resolveWorkoutMetrics(
        description,
        event.carbs_per_hour,
        estimationContext,
      )
    : { duration: null, distance: null, prescribedCarbsG: null, segments: [] };

  const renderable = /(?:^|\n)-\s+.*\d+(?:\.\d+)?(?:s|m|km)(?:\s|$)/.test(
    description,
  );
  if (category === "other" && !renderable) {
    throw new UnsupportedPlannedWorkoutError();
  }

  const eventMs = localToUtcMs(event.start_date_local, timezone);
  const now = Date.now();
  let clothing: PlannedWorkoutDetail["clothing"];

  if (
    eventMs < now - WEATHER_PAST_WINDOW_MS ||
    eventMs > now + WEATHER_FUTURE_WINDOW_MS
  ) {
    clothing = { status: "unavailable", reason: "outside-window" };
  } else {
    let weather: ReturnType<typeof getWeatherForTime>;
    try {
      weather = getWeatherForTime(
        await fetchForecast(),
        new Date(eventMs),
      );
    } catch {
      weather = null;
    }
    clothing = weather
      ? {
          status: "available",
          recommendation: recommendClothing(
            weather,
            category,
            warmthPreference ?? 0,
          ),
        }
      : { status: "unavailable", reason: "forecast-unavailable" };
  }

  const timeline =
    derivable
      ? resolved.segments.map((segment) => ({
          durationMinutes: segment.duration,
          intensityPercent: segment.intensity,
          zone:
            segment.zone ??
            (isPaceBased
              ? classifyPacePct(segment.intensity)
              : isHrBased && validLthr != null && validHrZones != null
                ? classifyHR(
                    (segment.intensity / 100) * validLthr,
                    validHrZones,
                  )
                : "z2"),
          estimated: segment.estimated,
        }))
      : [];

  const duration =
    !hasPaceCalibration && resolved.duration?.estimated
      ? null
      : resolved.duration;
  const distance =
    hasPaceCalibration && (isPaceBased || isHrBased || hasPaceTable)
      ? resolved.distance
      : null;
  const prescribedCarbsG =
    derivable && hasPaceCalibration
      ? calculateCanonicalPlannedPrescription(
          description,
          event.carbs_per_hour,
          estimationContext,
        )
      : null;

  return {
    event: {
      id: formatCalendarEventId(event.id),
      intervalsEventId: event.id,
      startDateLocal: event.start_date_local,
      name,
      category,
      description,
    },
    structure: {
      sections: sections.map((section) => ({
        name: section.name,
        repeats: section.repeats ?? null,
        steps: section.steps.map((step) => ({
          label: step.label ?? null,
          duration: step.duration,
          zone: step.zone,
          detail: step.bpmRange,
        })),
      })),
      timeline,
    },
    metrics: {
      duration,
      distance,
      fuelRateGPerHour: event.carbs_per_hour ?? null,
      prescribedCarbsG,
    },
    preRunCarbsG,
    clothing,
  };
}
