import { computeMaxHRZones, DEFAULT_MAX_HR } from "./constants";
import { getActivityStreams, type CachedActivity } from "./activityStreamsDb";
import {
  extractZoneSegments,
  buildCalibratedPaceTable,
  toPaceTable,
} from "./paceCalibration";
import { fetchAthleteProfile } from "./intervalsApi";
import { getUserSettings, type UserSettings } from "./settings";
import {
  createWorkoutEstimationContext,
  type WorkoutEstimationContext,
} from "./workoutMath";

function deriveCalibratedPaceTable(
  activities: CachedActivity[],
  hrZones: number[],
) {
  const segments = activities.flatMap((activity) => {
    if (!activity.hr.length || !activity.pace?.length || !activity.activityDate) {
      return [];
    }
    return extractZoneSegments(
      activity.hr,
      activity.pace,
      hrZones,
      activity.activityId,
      activity.activityDate,
    );
  });

  if (segments.length === 0) return undefined;
  return toPaceTable(buildCalibratedPaceTable(segments));
}

export async function getUserWorkoutEstimationContext(
  email: string,
  intervalsApiKey?: string | null,
  settings?: UserSettings,
): Promise<WorkoutEstimationContext> {
  const resolvedSettings = settings ?? await getUserSettings(email);
  const context = createWorkoutEstimationContext({
    currentAbilityDist: resolvedSettings.currentAbilityDist,
    currentAbilitySecs: resolvedSettings.currentAbilitySecs,
  });

  if (!intervalsApiKey) return context;

  const profile = await fetchAthleteProfile(intervalsApiKey);
  const hrZones = resolvedSettings.hrZones?.length === 5
    ? resolvedSettings.hrZones
    : profile.hrZones?.length === 5
      ? profile.hrZones
      : profile.maxHr
        ? computeMaxHRZones(profile.maxHr)
        : computeMaxHRZones(DEFAULT_MAX_HR);

  const cachedActivities = await getActivityStreams(email);
  const paceTable = deriveCalibratedPaceTable(cachedActivities, hrZones);

  return createWorkoutEstimationContext({
    paceTable,
    thresholdPace: context.thresholdPace,
  });
}