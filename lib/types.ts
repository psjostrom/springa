// --- TYPES ---
export interface WorkoutEvent {
  start_date_local: Date;
  name: string;
  description: string;
  external_id: string;
  type: "Run";
  fuelRate?: number; // g per 10 min
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
  planStartMonday: Date;
  zones: {
    easy: { min: number; max: number };
    steady: { min: number; max: number };
    tempo: { min: number; max: number };
    hard: { min: number; max: number };
  };
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
}

export interface CalendarEvent {
  id: string;
  date: Date;
  name: string;
  description: string;
  type: "completed" | "planned" | "race";
  category: "long" | "interval" | "easy" | "race" | "other";
  distance?: number;
  duration?: number;
  avgHr?: number;
  maxHr?: number;
  load?: number;
  intensity?: number;
  pace?: number;
  calories?: number;
  cadence?: number;
  hrZones?: HRZoneData;
  streamData?: StreamData;
  fuelRate?: number | null; // g per 10 min (planned rate)
  totalCarbs?: number | null; // planned total carbs
  carbsIngested?: number | null; // actual carbs consumed (from activity)
  activityId?: string; // raw Intervals.icu activity ID for API calls
}

export type SpeedSessionType =
  | "short-intervals"
  | "hills"
  | "long-intervals"
  | "distance-intervals"
  | "race-pace-intervals";
