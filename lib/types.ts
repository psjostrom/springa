// --- TYPES ---
export interface WorkoutEvent {
  start_date_local: Date;
  name: string;
  description: string;
  external_id: string;
  type: "Run";
  fuelRate?: number; // g/h (carbs per hour)
  distance?: number; // km (first-class; generators populate this for long runs)
  /**
   * Exclude from planned volume calculations.
   * Event is still synced to Intervals.icu and appears in the calendar,
   * but VolumeTrendChart won't count it toward weekly planned km.
   * Used for mutually exclusive alternatives (e.g., club run vs speed session
   * on the same day — only one will be completed, so only count the primary).
   */
  excludeFromPlan?: boolean;
}

export interface AnalysisResult {
  longRun: {
    trend: number;
    currentFuel: number;
    plotData: { time: number; glucose: number }[];
  } | null;
  easyRun: {
    trend: number;
    currentFuel: number;
    plotData: { time: number; glucose: number }[];
  } | null;
  interval: {
    trend: number;
    currentFuel: number;
    plotData: { time: number; glucose: number }[];
  } | null;
  msg?: string;
}

export interface PlanContext {
  fuelInterval: number;
  fuelLong: number;
  fuelEasy: number;
  raceDate: Date;
  raceDist: number;
  prefix: string;
  totalWeeks: number;
  startKm: number;
  lthr: number;
  hrZones: number[];
  planStartMonday: Date;
  includeBasePhase: boolean;
  boundaries: import("./periodization").PhaseBoundaries;
}

export interface IntervalsActivity {
  id: string;
  start_date: string;
  start_date_local?: string;
  name: string;
  description?: string;
  type?: string;
  distance?: number;
  moving_time?: number;
  total_elevation_gain?: number;
  calories?: number;
  avg_cadence?: number;
  average_cadence?: number;
  training_load?: number;
  intensity?: number;
  average_hr?: number;
  average_heartrate?: number;
  max_hr?: number;
  max_heartrate?: number;
  icu_training_load?: number;
  icu_intensity?: number;
  icu_hr_zone_times?: number[];
  pace?: number;
  carbs_ingested?: number;
  paired_event_id?: number | null;
  PreRunCarbsG?: number;
  PreRunCarbsMin?: number;
  Rating?: string;
  FeedbackComment?: string;
}

export interface IntervalsEvent {
  id: number;
  category: string;
  start_date_local: string;
  name?: string;
  description?: string;
  distance?: number;
  moving_time?: number;
  duration?: number;
  elapsed_time?: number;
  paired_activity_id?: string | null;
  carbs_per_hour?: number;
}

export interface IntervalsStream {
  type: string;
  data: number[];
  data2?: number[]; // For latlng stream: data=lat, data2=lng
}

// --- PACE TABLE TYPES ---
export type HRZoneName = "easy" | "steady" | "tempo" | "hard";

export interface ZonePaceEntry {
  zone: HRZoneName;
  avgPace: number;
  sampleCount: number;
  avgHr?: number;
}

export type PaceTable = Record<HRZoneName, ZonePaceEntry | null>;

// --- CALENDAR TYPES ---
export interface HRZoneData {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

export interface DataPoint {
  time: number;
  value: number;
}

export interface StreamData {
  glucose?: DataPoint[];
  heartrate?: DataPoint[];
  pace?: DataPoint[];
  cadence?: DataPoint[];
  altitude?: DataPoint[];
  latlng?: [number, number][]; // [lat, lng] pairs for GPS route
}

export interface CalendarEvent {
  id: string;
  date: Date;
  name: string;
  description: string;
  type: "completed" | "planned" | "race";
  category: "long" | "interval" | "easy" | "club" | "race" | "other";
  distance?: number;
  duration?: number;
  avgHr?: number;
  maxHr?: number;
  load?: number;
  intensity?: number;
  pace?: number;
  calories?: number;
  cadence?: number;
  zoneTimes?: HRZoneData;
  streamData?: StreamData;
  fuelRate?: number | null; // g/h (planned rate, matches carbs_per_hour)
  totalCarbs?: number | null; // planned total carbs
  carbsIngested?: number | null; // actual carbs consumed (from activity)
  preRunCarbsG?: number | null; // pre-run carbs grams (from Intervals.icu custom field)
  preRunCarbsMin?: number | null; // minutes before run start (from Intervals.icu custom field)
  rating?: string | null; // athlete feedback rating (from Intervals.icu custom field)
  feedbackComment?: string | null; // athlete feedback comment (from Intervals.icu custom field)
  activityId?: string; // raw Intervals.icu activity ID for API calls
  pairedEventId?: number; // Intervals.icu event ID this activity was paired with
}

export type WorkoutCategory = "easy" | "long" | "interval" | "club";

export type SpeedSessionType =
  | "short-intervals"
  | "hills"
  | "long-intervals"
  | "distance-intervals"
  | "race-pace-intervals";

// --- PACE CURVES TYPES ---
export interface BestEffort {
  distance: number;      // meters
  label: string;         // "1km", "5km", etc.
  timeSeconds: number;   // time to cover distance
  pace: number;          // min/km
  activityId?: string;
  activityName?: string;
  activityDate?: string; // ISO date string
}

export interface PaceCurveData {
  bestEfforts: BestEffort[];
  longestRun: { distance: number; activityId: string; activityName: string; activityDate?: string } | null;
  curve: { distance: number; pace: number }[];  // for chart
}
