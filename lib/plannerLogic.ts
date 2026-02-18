// Barrel re-export — all existing imports from "@/lib/plannerLogic" continue to work.

export type {
  WorkoutEvent,
  AnalysisResult,
  PlanContext,
  IntervalsActivity,
  IntervalsStream,
  HRZoneName,
  ZonePaceEntry,
  PaceTable,
  HRZoneData,
  DataPoint,
  StreamData,
  CalendarEvent,
  SpeedSessionType,
} from "./types";

export {
  DEFAULT_LTHR,
  CRASH_DROP_RATE,
  SPIKE_RISE_RATE,
  DEFAULT_CARBS_G,
  API_BASE,
  FALLBACK_PACE_TABLE,
  SPEED_ROTATION,
  SPEED_SESSION_LABELS,
  HR_ZONE_COLORS,
  PACE_ESTIMATES,
} from "./constants";

export {
  formatPace,
  getPaceForZone,
  getZoneLabel,
  buildEasyPaceFromHistory,
  classifyHRZone,
  parseWorkoutZones,
  getEstimatedDuration,
  formatStep,
  createWorkoutText,
  calculateWorkoutCarbs,
  convertGlucoseToMmol,
  getWorkoutCategory,
  extractFuelRate,
  extractTotalCarbs,
} from "./utils";

export {
  fetchStreams,
  fetchActivityDetails,
  fetchCalendarData,
  updateEvent,
  uploadToIntervals,
  updateActivityCarbs,
} from "./intervalsApi";

export { analyzeHistory } from "./analysis";

export { generatePlan } from "./workoutGenerators";
