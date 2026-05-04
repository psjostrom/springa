import { computeMaxHRZones, DEFAULT_MAX_HR } from "./constants";
import { getActivityStreams, type CachedActivity } from "./activityStreamsDb";
import {
  extractZoneSegments,
  buildCalibratedPaceTable,
  toPaceTable,
} from "./paceCalibration";
import { fetchAthleteProfile } from "./intervalsApi";
import { getUserSettings, saveUserSettings, type UserSettings } from "./settings";
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

  // Use cached hrZones/maxHr from settings to skip the live profile API call.
  // If not cached, fetch once and write back for future requests.
  let hrZones: number[];
  const cachedHrZones = resolvedSettings.hrZones?.length === 5 ? resolvedSettings.hrZones : null;
  const cachedMaxHr = resolvedSettings.maxHr ?? null;

  const cachedActivities = await getActivityStreams(email);

  if (cachedHrZones) {
    hrZones = cachedHrZones;
  } else if (cachedMaxHr) {
    hrZones = computeMaxHRZones(cachedMaxHr);
  } else {
    const profile = await fetchAthleteProfile(intervalsApiKey);
    hrZones = profile.hrZones?.length === 5
      ? profile.hrZones
      : profile.maxHr
        ? computeMaxHRZones(profile.maxHr)
        : computeMaxHRZones(DEFAULT_MAX_HR);
    // Write back so subsequent requests skip the live fetch.
    await saveUserSettings(email, {
      hrZones: profile.hrZones?.length === 5 ? profile.hrZones : undefined,
      maxHr: profile.maxHr ?? undefined,
    });
  }

  const paceTable = deriveCalibratedPaceTable(cachedActivities, hrZones);

  return createWorkoutEstimationContext({
    paceTable,
    thresholdPace: context.thresholdPace,
  });
}