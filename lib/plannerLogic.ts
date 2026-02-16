import {
  addDays,
  addWeeks,
  format,
  startOfWeek,
  parseISO,
  isBefore,
  isSameDay,
} from "date-fns";

// --- CONSTANTS ---
export const DEFAULT_LTHR = 169;
export const CRASH_DROP_RATE = -3.0;
export const SPIKE_RISE_RATE = 3.0;
export const DEFAULT_CARBS_G = 10;
export const API_BASE = "https://intervals.icu/api/v1";

// Smart glucose conversion: converts mg/dL to mmol/L only when needed
function convertGlucoseToMmol(values: number[], streamType: string): number[] {
  if (values.length === 0) return values;

  // Determine if values are in mg/dL based on value range
  // mmol/L range: 3.9-10 (normal), up to ~15 (high)
  // mg/dL range: 70-180 (normal), up to ~300+ (high)
  // Use threshold of 15: anything above is definitely mg/dL
  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
  const maxValue = Math.max(...values);

  // Only convert if values look like mg/dL (average > 15 OR max > 20)
  const needsConversion = avgValue > 15 || maxValue > 20;

  if (needsConversion) {
    return values.map((v) => v / 18.018);
  }
  return values;
}

// --- TYPES ---
export interface WorkoutEvent {
  start_date_local: Date;
  name: string;
  description: string;
  external_id: string;
  type: "Run";
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

interface PlanContext {
  fuelInterval: number; // Low fuel for intervals/tempo/hills (e.g., 5g/10m)
  fuelLong: number; // High fuel for long runs (e.g., 10g/10m)
  fuelEasy: number; // Moderate fuel for easy/bonus runs (e.g., 8g/10m)
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

// New interfaces to avoid 'any' in analysis
interface IntervalsActivity {
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
  icu_hr_zone_times?: number[]; // Array of seconds in each zone [z1, z2, z3, z4, z5]
  pace?: number;
}

interface IntervalsStream {
  type: string;
  data: number[];
}

// --- PACE TABLE TYPES & HELPERS ---
export type HRZoneName = "easy" | "steady" | "tempo" | "hard";

export interface ZonePaceEntry {
  zone: HRZoneName;
  avgPace: number; // min/km as decimal (e.g. 6.15 = 6min 9sec)
  sampleCount: number;
  avgHr?: number; // average HR across the sampled runs (only for data-driven entries)
}

export type PaceTable = Record<HRZoneName, ZonePaceEntry | null>;

/** Format decimal pace (e.g. 6.15) as "6:09" */
export function formatPace(paceMinPerKm: number): string {
  const totalSeconds = Math.round(paceMinPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const FALLBACK_PACE_TABLE: PaceTable = {
  easy: { zone: "easy", avgPace: 6.71, sampleCount: 0 },    // ~6:43/km
  steady: { zone: "steady", avgPace: 5.67, sampleCount: 0 }, // ~5:40/km (race pace)
  tempo: { zone: "tempo", avgPace: 5.21, sampleCount: 0 },   // ~5:13/km (interval)
  hard: { zone: "hard", avgPace: 4.75, sampleCount: 0 },     // ~4:45/km
};

/** Returns data-driven entry or falls back to hardcoded values */
export function getPaceForZone(
  table: PaceTable,
  zone: HRZoneName,
): ZonePaceEntry {
  return table[zone] ?? FALLBACK_PACE_TABLE[zone]!;
}

/**
 * Build easy pace from historical easy and long runs (excluding strides).
 * Returns a data-driven easy pace entry with avg HR, or null if no data.
 */
export function buildEasyPaceFromHistory(
  events: CalendarEvent[],
): ZonePaceEntry | null {
  const easyRuns = events.filter((e) => {
    if (e.type !== "completed") return false;
    if (!e.distance || !e.duration || !e.avgHr) return false;
    const name = e.name.toLowerCase();
    const isEasyOrLong =
      name.includes("easy") || name.includes("long") || name.includes("bonus");
    const hasStrides = name.includes("strides");
    return isEasyOrLong && !hasStrides;
  });

  if (easyRuns.length === 0) return null;

  let totalPace = 0;
  let totalHr = 0;
  let validCount = 0;

  for (const e of easyRuns) {
    const distKm = e.distance! / 1000;
    if (distKm < 0.5) continue;
    const durMin = e.duration! / 60;
    const pace = durMin / distKm;
    if (pace < 2.0 || pace > 12.0) continue;
    totalPace += pace;
    totalHr += e.avgHr!;
    validCount++;
  }

  if (validCount === 0) return null;

  return {
    zone: "easy",
    avgPace: totalPace / validCount,
    sampleCount: validCount,
    avgHr: Math.round(totalHr / validCount),
  };
}

/** Classify avgHr into a zone name based on LTHR ratio (Garmin LTHR zones) */
function classifyHRZone(avgHr: number, lthr: number): HRZoneName {
  const ratio = avgHr / lthr;
  if (ratio > 0.99) return "hard";   // Z5: >99% LTHR
  if (ratio > 0.89) return "tempo";  // Z4: >89% LTHR (interval)
  if (ratio > 0.78) return "steady"; // Z3: >78% LTHR (race pace)
  return "easy";                     // Z2: ≤78% LTHR
}



const ZONE_LABELS: Record<HRZoneName, string> = {
  easy: "Easy",
  steady: "Race Pace",
  tempo: "Interval",
  hard: "Hard",
};

export function getZoneLabel(zone: HRZoneName): string {
  return ZONE_LABELS[zone];
}

/** Classify an HR max-percentage into a zone name */
function classifyPctToZone(maxPct: number): HRZoneName {
  if (maxPct > 99) return "hard";
  if (maxPct > 89) return "tempo";
  if (maxPct > 78) return "steady";
  return "easy";
}

/**
 * Parse a workout description and return all distinct HR zones used,
 * ordered from lowest to highest intensity.
 */
export function parseWorkoutZones(description: string): HRZoneName[] {
  // Match all HR percentage ranges across the entire description
  const stepMatches = Array.from(
    description.matchAll(/-\s*(?:[\w\s]*?\s+)?\d+(m|km)\s+(\d+)-(\d+)%/g),
  );
  if (stepMatches.length === 0) return [];

  const zones = new Set<HRZoneName>();
  for (const m of stepMatches) {
    const maxPct = parseInt(m[3]);
    zones.add(classifyPctToZone(maxPct));
  }

  // Return sorted low-to-high intensity
  const order: HRZoneName[] = ["easy", "steady", "tempo", "hard"];
  return order.filter((z) => zones.has(z));
}

// --- HELPER FUNCTIONS ---
export const getEstimatedDuration = (event: WorkoutEvent): number => {
  // 1. Long Run: Calculate 6 min/km (approximate trail pace)
  if (event.name.includes("Long")) {
    const match = event.name.match(/(\d+)km/);
    if (match) return parseInt(match[1]) * 6;
  }

  // 2. Default duration for other workouts (Easy, Tempo, Hills)
  return 45;
};

const formatStep = (
  duration: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  note?: string,
): string => {
  const minBpm = Math.floor(lthr * minPct);
  const maxBpm = Math.ceil(lthr * maxPct);
  // Note comes first (for Garmin display), then duration, then zone
  const core = `${duration} ${Math.floor(minPct * 100)}-${Math.ceil(maxPct * 100)}% LTHR (${minBpm}-${maxBpm} bpm)`;
  return note ? `${note} ${core}` : core;
};

// Helper to calculate total carbs for a workout
const calculateWorkoutCarbs = (
  durationMinutes: number,
  fuelRateGPer10Min: number,
): number => {
  return Math.round((durationMinutes / 10) * fuelRateGPer10Min);
};

const createWorkoutText = (
  title: string,
  warmup: string,
  mainSteps: string[],
  cooldown: string,
  repeats: number = 1,
  notes?: string,
): string => {
  const lines = [
    title,
    "",
  ];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(
    "Warmup",
    `- ${warmup}`,
    "",
    repeats > 1 ? `Main set ${repeats}x` : "Main set",
    ...mainSteps.map((s) => `- ${s}`),
    "",
    "Cooldown",
    `- ${cooldown}`,
    "",
  );

  return lines.join("\n");
};

// --- ANALYSIS LOGIC ---
async function fetchStreams(
  activityId: string,
  apiKey: string,
): Promise<IntervalsStream[]> {
  const auth = "Basic " + btoa("API_KEY:" + apiKey);
  const keys = [
    "time",
    "heartrate",
    "bloodglucose",
    "glucose",
    "ga_smooth",
    "velocity_smooth",
    "cadence",
    "altitude",
  ].join(",");
  try {
    const res = await fetch(
      `${API_BASE}/activity/${activityId}/streams?keys=${keys}`,
      {
        headers: { Authorization: auth },
      },
    );
    if (res.ok) {
      return await res.json();
    }
    console.warn(
      `Failed to fetch streams for activity ${activityId}: ${res.status} ${res.statusText}`,
    );
    return [];
  } catch (e) {
    console.warn(`Error fetching streams for activity ${activityId}:`, e);
    return [];
  }
}

// Categorize workout by type based on name
function getWorkoutCategory(
  name: string,
): "long" | "interval" | "easy" | "other" {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("long")) return "long";
  if (
    lowerName.includes("interval") ||
    lowerName.includes("hills") ||
    lowerName.includes("tempo") ||
    lowerName.includes("race pace")
  )
    return "interval";
  if (
    lowerName.includes("easy") ||
    lowerName.includes("bonus") ||
    lowerName.includes("strides")
  )
    return "easy";
  return "other";
}

async function analyzeRun(
  run: IntervalsActivity,
  apiKey: string,
): Promise<{
  trend: number;
  currentFuel: number;
  plotData: { time: number; glucose: number }[];
}> {
  const streams = await fetchStreams(run.id, apiKey);
  let tData: number[] = [];
  let gData: number[] = [];
  let glucoseStreamType: string = "";

  for (const s of streams) {
    if (s.type === "time") tData = s.data;
    if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) {
      gData = s.data;
      glucoseStreamType = s.type;
    }
  }

  let plotData: { time: number; glucose: number }[] = [];
  let trend = 0.0;
  let currentFuel = 10;

  // Get fuel from description
  const match = run.description?.match(/FUEL PER 10:\s*(\d+)g/i);
  if (match) currentFuel = parseInt(match[1]);

  if (gData.length > 0 && tData.length > 1) {
    const glucoseInMmol = convertGlucoseToMmol(gData, glucoseStreamType);

    plotData = tData.map((t, idx) => ({
      time: Math.round(t / 60),
      glucose: glucoseInMmol[idx],
    }));

    const delta = glucoseInMmol[glucoseInMmol.length - 1] - glucoseInMmol[0];
    const durationHr = (tData[tData.length - 1] - tData[0]) / 3600;
    if (durationHr > 0.2) {
      trend = delta / durationHr;
    }
  }

  return { trend, currentFuel, plotData };
}

export async function analyzeHistory(
  apiKey: string,
  prefix: string,
): Promise<AnalysisResult> {
  const auth = "Basic " + btoa("API_KEY:" + apiKey);
  const today = new Date();
  const startDate = addDays(today, -45);
  const oldest = format(startDate, "yyyy-MM-dd");
  const newest = format(today, "yyyy-MM-dd");

  try {
    const res = await fetch(
      `${API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}`,
      { headers: { Authorization: auth } },
    );
    if (!res.ok) throw new Error("Failed to fetch activities");
    const activities: IntervalsActivity[] = await res.json();

    const relevant = activities.filter((a) =>
      a.name.toLowerCase().includes(prefix.toLowerCase()),
    );

    if (relevant.length === 0) {
      return {
        longRun: null,
        easyRun: null,
        interval: null,
        msg: "No activities found",
      };
    }

    // Sort by date (most recent first)
    relevant.sort(
      (a, b) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
    );

    // Find most recent run from each category
    const mostRecentLong = relevant.find(
      (a) => getWorkoutCategory(a.name) === "long",
    );
    const mostRecentEasy = relevant.find(
      (a) => getWorkoutCategory(a.name) === "easy",
    );
    const mostRecentInterval = relevant.find(
      (a) => getWorkoutCategory(a.name) === "interval",
    );

    const result: AnalysisResult = {
      longRun: null,
      easyRun: null,
      interval: null,
    };

    // Analyze each category if found
    if (mostRecentLong) {
      result.longRun = await analyzeRun(mostRecentLong, apiKey);
    }

    if (mostRecentEasy) {
      result.easyRun = await analyzeRun(mostRecentEasy, apiKey);
    }

    if (mostRecentInterval) {
      result.interval = await analyzeRun(mostRecentInterval, apiKey);
    }

    return result;
  } catch (error) {
    console.error("Analysis failed", error);
    return {
      easyRun: null,
      longRun: null,
      interval: null,
      msg: "Analysis failed",
    };
  }
}

// --- PLAN GENERATORS ---

type SpeedSessionType =
  | "short-intervals"
  | "hills"
  | "long-intervals"
  | "distance-intervals"
  | "race-pace-intervals";

const SPEED_ROTATION: SpeedSessionType[] = [
  "short-intervals",
  "hills",
  "long-intervals",
  "distance-intervals",
];

function getSpeedSessionType(
  weekIdx: number,
  totalWeeks: number,
): SpeedSessionType | null {
  const weekNum = weekIdx + 1;
  const isRaceWeek = weekNum === totalWeeks;
  const isTaper = weekNum >= totalWeeks - 1;
  const isRecoveryWeek = weekNum % 4 === 0;

  if (isRaceWeek) return null; // No speed session on race week
  if (isRecoveryWeek) return null; // Recovery week — no speed
  if (isTaper) return "race-pace-intervals"; // Taper: race pace practice

  // Count non-skipped speed weeks before this one for rotation
  let speedCount = 0;
  for (let i = 0; i < weekIdx; i++) {
    const wn = i + 1;
    if (wn % 4 !== 0 && wn < totalWeeks - 1) speedCount++;
  }

  return SPEED_ROTATION[speedCount % SPEED_ROTATION.length];
}

const SPEED_SESSION_LABELS: Record<SpeedSessionType, string> = {
  "short-intervals": "Short Intervals",
  hills: "Hills",
  "long-intervals": "Long Intervals",
  "distance-intervals": "Distance Intervals",
  "race-pace-intervals": "Race Pace Intervals",
};

const generateQualityRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const date = addDays(weekStart, 1);
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;

  const weekNum = weekIdx + 1;
  const progress = weekIdx / ctx.totalWeeks;
  const prefixName = `W${weekNum.toString().padStart(2, "0")} Tue`;

  const sessionType = getSpeedSessionType(weekIdx, ctx.totalWeeks);

  // No speed session this week — generate an easy run instead
  if (sessionType === null) {
    const totalDuration = 10 + 30 + 5;
    const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelEasy);
    const strat = `PUMP ON (EASE OFF) - FUEL PER 10: ${ctx.fuelEasy}g TOTAL: ${totalCarbs}g`;
    const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
    const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
    const notes = "Recovery week. Keep it genuinely easy — this is where your body absorbs the training from the past weeks. Resist the urge to push. Relaxed breathing, comfortable pace.";
    return {
      start_date_local: new Date(date.setHours(12, 0, 0)),
      name: `${prefixName} Easy ${ctx.prefix}`,
      description: createWorkoutText(strat, wu, [
        formatStep("30m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ], cd, 1, notes),
      external_id: `${ctx.prefix}-tue-${weekNum}`,
      type: "Run",
    };
  }

  let reps: number;
  let repDuration: number; // minutes per full rep cycle (work + rest)
  let steps: string[];
  let notes: string;
  const label = SPEED_SESSION_LABELS[sessionType];

  switch (sessionType) {
    case "short-intervals": {
      reps = 6 + Math.floor(progress * 2); // 6 → 8
      repDuration = 4; // 2m work + 2m recovery
      steps = [
        formatStep("2m", ctx.zones.tempo.min, ctx.zones.tempo.max, ctx.lthr),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = "Short, punchy efforts to build leg speed and running economy. Run each rep at a strong, controlled effort — not a flat-out sprint. Focus on quick cadence and light feet. The recovery jog should be truly easy, letting your HR come back down before the next one.";
      break;
    }
    case "hills": {
      reps = 6 + Math.floor(progress * 2); // 6 → 8
      repDuration = 4; // 2m up + 2m down
      steps = [
        formatStep("2m", ctx.zones.hard.min, ctx.zones.hard.max, ctx.lthr, "Uphill"),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, "Downhill"),
      ];
      notes = "Hill reps build strength and power that translates directly to EcoTrail's terrain. Find a steady hill with a moderate gradient. Drive your knees, lean slightly forward from the ankles, and keep a strong arm swing. Jog back down easy — the downhill IS the recovery.";
      break;
    }
    case "long-intervals": {
      const workMin = 4 + Math.floor(progress * 2); // 4m → 6m
      reps = 4;
      repDuration = workMin + 2; // work + 2m recovery
      steps = [
        formatStep(`${workMin}m`, ctx.zones.tempo.min, ctx.zones.tempo.max, ctx.lthr),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = "Longer intervals to develop your threshold and teach your body to clear lactate at pace. These should feel 'comfortably hard' — you can speak a few words but not hold a conversation. Stay relaxed in your shoulders and hands. Each rep should feel the same effort, not faster as you go.";
      break;
    }
    case "distance-intervals": {
      const distM = 600 + Math.floor(progress * 2) * 200; // 600m → 1000m
      reps = distM >= 1000 ? 6 : 8;
      const distKm = (distM / 1000).toFixed(1); // 0.6km, 0.8km, 1.0km
      const recoveryKm = "0.2"; // 200m jog recovery
      // Estimate rep duration: 800m at ~5:10/km ≈ 4min + 200m jog ≈ 1.5min
      repDuration = Math.ceil((distM / 1000) * 5.2) + 1.5;
      steps = [
        formatStep(`${distKm}km`, ctx.zones.tempo.min, ctx.zones.tempo.max, ctx.lthr),
        formatStep(`${recoveryKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = `Track-style reps to sharpen your pace awareness. Run each ${distM}m at a consistent, controlled pace — aim to hit the same split every rep rather than going out too fast. The 200m jog recovery is short, so keep moving. These build the specific speed and confidence you need on race day.`;
      break;
    }
    case "race-pace-intervals": {
      reps = 5;
      repDuration = 7; // 5m work + 2m recovery
      steps = [
        formatStep("5m", ctx.zones.steady.min, ctx.zones.steady.max, ctx.lthr),
        formatStep("2m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      ];
      notes = "Race pace practice. The goal is to lock in what race effort feels like so it becomes automatic on the day. These should feel controlled and sustainable — not hard. Focus on rhythm: steady breathing, relaxed form, consistent pace. If it feels too easy, you're doing it right.";
      break;
    }
  }

  const totalDuration = 10 + reps * repDuration + 5;
  const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelInterval);
  const strat = `PUMP OFF - FUEL PER 10: ${ctx.fuelInterval}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);

  return {
    start_date_local: new Date(date.setHours(12, 0, 0)),
    name: `${prefixName} ${label} ${ctx.prefix}`,
    description: createWorkoutText(strat, wu, steps, cd, reps, notes),
    external_id: `${ctx.prefix}-tue-${weekNum}`,
    type: "Run",
  };
};

const generateEasyRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const date = addDays(weekStart, 3);
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;
  const weekNum = weekIdx + 1;
  const progress = weekIdx / ctx.totalWeeks;
  const isRaceWeek = weekNum === ctx.totalWeeks;
  const isRaceTest =
    weekNum === ctx.totalWeeks - 2 || weekNum === ctx.totalWeeks - 3;
  const withStrides = weekIdx % 2 === 1 && !isRaceWeek; // Alternate weeks

  const duration = isRaceWeek
    ? 20
    : isRaceTest
      ? 30
      : 40 + Math.floor(progress * 20);

  const stridesDuration = withStrides ? 6 : 0; // 4x (20s + 1m) ≈ 6 min
  const totalDuration = 10 + duration + stridesDuration + 5;
  const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelEasy);

  const strat = `PUMP ON (EASE OFF) - FUEL PER 10: ${ctx.fuelEasy}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);

  const sessionLabel = withStrides ? "Easy + Strides" : "Easy";
  const name = `W${weekNum.toString().padStart(2, "0")} Thu ${sessionLabel} ${ctx.prefix}${isRaceWeek ? " [SHAKEOUT]" : ""}`;

  let notes: string;
  if (isRaceWeek) {
    notes = "Pre-race shakeout. Just loosen the legs and shake off any nerves. Keep it short, keep it easy. Tomorrow is the day.";
  } else if (withStrides) {
    notes = "Easy run with strides at the end. The main run should be fully conversational — save your energy. After the easy portion, do 4 short strides: accelerate smoothly to near-sprint over 20 seconds, then walk/jog back. Strides build neuromuscular speed without creating fatigue.";
  } else {
    notes = "Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.";
  }

  if (withStrides) {
    // Build text manually for strides (two sections)
    const easyStep = formatStep(`${duration}m`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
    const strideWork = formatStep("20s", ctx.zones.hard.min, ctx.zones.hard.max, ctx.lthr);
    const strideRest = formatStep("1m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
    const lines = [
      strat,
      "",
      notes,
      "",
      "Warmup",
      `- ${wu}`,
      "",
      "Main set",
      `- ${easyStep}`,
      "",
      "Strides 4x",
      `- ${strideWork}`,
      `- ${strideRest}`,
      "",
      "Cooldown",
      `- ${cd}`,
      "",
    ];
    return {
      start_date_local: new Date(date.setHours(12, 0, 0)),
      name,
      description: lines.join("\n"),
      external_id: `${ctx.prefix}-thu-${weekNum}`,
      type: "Run",
    };
  }

  return {
    start_date_local: new Date(date.setHours(12, 0, 0)),
    name,
    description: createWorkoutText(strat, wu, [
      formatStep(`${duration}m`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ], cd, 1, notes),
    external_id: `${ctx.prefix}-thu-${weekNum}`,
    type: "Run",
  };
};

const generateBonusRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const date = addDays(weekStart, 5);
  if (!isBefore(date, ctx.raceDate) && !isSameDay(date, ctx.raceDate))
    return null;
  if (isSameDay(date, ctx.raceDate)) return null;
  const weekNum = weekIdx + 1;

  const name = `W${weekNum.toString().padStart(2, "0")} Sat Bonus Easy ${ctx.prefix}`;

  const totalDuration = 10 + 30 + 5;
  const totalCarbs = calculateWorkoutCarbs(totalDuration, ctx.fuelEasy);

  const strat = `PUMP ON (EASE OFF) - FUEL PER 10: ${ctx.fuelEasy}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep("10m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep("5m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);
  const notes = "Optional bonus run to add volume. This is extra credit — if your legs feel heavy from the week, skip it or walk instead. If you're feeling fresh, enjoy an easy 30 minutes. No pressure, no pace targets. Just move.";

  return {
    start_date_local: new Date(date.setHours(12, 0, 0)),
    name,
    description: createWorkoutText(strat, wu, [
      formatStep("30m", ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ], cd, 1, notes),
    external_id: `${ctx.prefix}-sat-${weekNum}`,
    type: "Run",
  };
};

const generateLongRun = (
  ctx: PlanContext,
  weekIdx: number,
  weekStart: Date,
): WorkoutEvent | null => {
  const weekNum = weekIdx + 1;
  const isRaceWeek = weekNum === ctx.totalWeeks;
  if (isRaceWeek) {
    // Race day: estimate at race pace ~5:40/km
    const estimatedRaceDuration = ctx.raceDist * 5.67;
    const totalCarbs = calculateWorkoutCarbs(estimatedRaceDuration, ctx.fuelLong);
    const strat = `PUMP OFF - FUEL PER 10: ${ctx.fuelLong}g TOTAL: ${totalCarbs}g`;
    return {
      start_date_local: new Date(ctx.raceDate.setHours(10, 0, 0)),
      name: `RACE DAY ${ctx.prefix}`,
      description: `RACE DAY! ${ctx.raceDist}km. ${strat}\n\nGood luck!`,
      external_id: `${ctx.prefix}-race`,
      type: "Run",
    };
  }
  const date = addDays(weekStart, 6);
  if (!isBefore(date, ctx.raceDate)) return null;
  const isTaper = weekNum === ctx.totalWeeks - 1;
  const isRaceTest =
    weekNum === ctx.totalWeeks - 2 || weekNum === ctx.totalWeeks - 3;
  const isRecoveryWeek = weekNum % 4 === 0;

  let km = Math.min(
    Math.floor(
      ctx.startKm +
        ((ctx.raceDist - ctx.startKm) / Math.max(ctx.totalWeeks - 4, 1)) *
          weekIdx,
    ),
    ctx.raceDist,
  );
  let type = "";
  if (isRecoveryWeek) {
    km = ctx.startKm;
    type = " [RECOVERY]";
  }
  if (isTaper) {
    km = Math.floor(ctx.raceDist * 0.5);
    type = " [TAPER]";
  }
  if (isRaceTest) {
    km = ctx.raceDist;
    type = " [RACE TEST]";
  }

  // Determine if this is a race-pace sandwich long run
  // Alternate among non-special weeks; recovery, taper, and week 1 are always all-easy
  let isRacePaceSandwich = false;
  if (!isRecoveryWeek && !isTaper && weekNum > 1) {
    let nonSpecialCount = 0;
    for (let i = 0; i < weekIdx; i++) {
      const wn = i + 1;
      if (wn % 4 !== 0 && wn < ctx.totalWeeks - 1 && wn > 1) nonSpecialCount++;
    }
    isRacePaceSandwich = nonSpecialCount % 2 === 1;
  }

  // Warmup and cooldown are distance-based and included in the total km
  const wuKm = 1;
  const cdKm = 1;
  const mainKm = Math.max(km - wuKm - cdKm, 1);

  // Estimate duration at easy pace ~6:43/km
  const estimatedDuration = km * 6.71;
  const totalCarbs = calculateWorkoutCarbs(estimatedDuration, ctx.fuelLong);

  const strat = `PUMP OFF - FUEL PER 10: ${ctx.fuelLong}g TOTAL: ${totalCarbs}g`;
  const wu = formatStep(`${wuKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr, strat);
  const cd = formatStep(`${cdKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr);

  let mainSteps: string[];
  let notes: string;

  if (isRacePaceSandwich && mainKm >= 4) {
    // Race pace sandwich: easy → race pace → easy
    const rpBlockKm = Math.min(2 + Math.floor((weekIdx / ctx.totalWeeks) * 3), Math.floor(mainKm * 0.4));
    const easyBeforeKm = Math.floor((mainKm - rpBlockKm) / 2);
    const easyAfterKm = mainKm - rpBlockKm - easyBeforeKm;
    mainSteps = [
      formatStep(`${easyBeforeKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
      formatStep(`${rpBlockKm}km`, ctx.zones.steady.min, ctx.zones.steady.max, ctx.lthr),
      formatStep(`${easyAfterKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = `Long run with a ${rpBlockKm}km race pace block sandwiched in the middle. Start easy and settle in before picking up to race effort. The race pace section should feel controlled, not hard — practise running at goal effort on tired legs. Ease back down afterwards and finish relaxed.`;
  } else if (isRecoveryWeek) {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = "Recovery week long run — shorter distance to let your body absorb the training. Run the whole thing easy and enjoy being out there. No pace pressure today.";
  } else if (isTaper) {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = "Taper run. The hay is in the barn — you've done the work. Keep this short and easy. Your legs might feel heavy or oddly flat; that's normal during taper. Trust the process.";
  } else if (isRaceTest) {
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = `Race distance test at easy effort. This is about covering ${km}km and practising your fueling and BG strategy, not about pace. Treat it as a dress rehearsal: same kit, same fuel timing, same pump setup you'll use on race day. Note what works and what doesn't.`;
  } else {
    // All easy, normal build week
    mainSteps = [
      formatStep(`${mainKm}km`, ctx.zones.easy.min, ctx.zones.easy.max, ctx.lthr),
    ];
    notes = "Long run at easy pace. This is the most important run of the week — it builds your endurance engine. Keep the effort genuinely easy throughout. If the last few km feel harder at the same pace, that's normal; resist the urge to speed up early to 'bank time'. Fuel early, fuel often.";
  }

  return {
    start_date_local: new Date(date.setHours(10, 0, 0)),
    name: `W${weekNum.toString().padStart(2, "0")} Sun Long (${km}km)${type} ${ctx.prefix}`,
    description: createWorkoutText(`${strat} (Trail)`, wu, mainSteps, cd, 1, notes),
    external_id: `${ctx.prefix}-sun-${weekNum}`,
    type: "Run",
  };
};

// --- MAIN ORCHESTRATOR ---
export function generatePlan(
  fuelInterval: number, // Low fuel for intervals/tempo/hills (e.g., 5g/10m)
  fuelLong: number, // High fuel for long runs (e.g., 10g/10m)
  fuelEasy: number, // Moderate fuel for easy/bonus runs (e.g., 8g/10m)
  raceDateStr: string,
  raceDist: number,
  prefix: string,
  totalWeeks: number,
  startKm: number,
  lthr: number,
): WorkoutEvent[] {
  const raceDate = parseISO(raceDateStr);
  const today = new Date();
  const ctx: PlanContext = {
    fuelInterval,
    fuelLong,
    fuelEasy,
    raceDate,
    raceDist,
    prefix,
    totalWeeks,
    startKm,
    lthr,
    planStartMonday: addWeeks(
      startOfWeek(raceDate, { weekStartsOn: 1 }),
      -(totalWeeks - 1),
    ),
    zones: {
      easy: { min: 0.66, max: 0.78 },   // Z2: 112-132 bpm
      steady: { min: 0.78, max: 0.89 },  // Z3: 132-150 bpm (race pace)
      tempo: { min: 0.89, max: 0.99 },   // Z4: 150-167 bpm (interval)
      hard: { min: 0.99, max: 1.11 },    // Z5: 167-188 bpm
    },
  };
  const weekIndices = Array.from({ length: totalWeeks }, (_, i) => i);
  return weekIndices.flatMap((i) => {
    const weekStart = addWeeks(ctx.planStartMonday, i);
    if (isBefore(addDays(weekStart, 7), today)) return [];
    return [
      generateQualityRun(ctx, i, weekStart),
      generateEasyRun(ctx, i, weekStart),
      generateBonusRun(ctx, i, weekStart),
      generateLongRun(ctx, i, weekStart),
    ].filter((e): e is WorkoutEvent => e !== null);
  });
}

// --- CALENDAR TYPES ---
export interface HRZoneData {
  z1: number; // Time in seconds
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

export interface DataPoint {
  time: number; // Minutes from start
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
  pace?: number; // min/km
  calories?: number;
  cadence?: number; // spm (steps per minute)
  hrZones?: HRZoneData;
  streamData?: StreamData;
}

// Calculate HR zones based on LTHR
function calculateHRZones(
  hrData: number[],
  lthr: number = DEFAULT_LTHR,
): HRZoneData {
  const zones: HRZoneData = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  // Zone boundaries based on Garmin LTHR zones
  const z1Max = lthr * 0.66; // Z1: up to 66% LTHR (warm up)
  const z2Max = lthr * 0.78; // Z2: 66-78% LTHR (easy)
  const z3Max = lthr * 0.89; // Z3: 78-89% LTHR (aerobic/race pace)
  const z4Max = lthr * 0.99; // Z4: 89-99% LTHR (threshold/interval)
  // Z5 is > 99% LTHR (maximum)

  hrData.forEach((hr) => {
    if (hr <= z1Max) zones.z1++;
    else if (hr <= z2Max) zones.z2++;
    else if (hr <= z3Max) zones.z3++;
    else if (hr <= z4Max) zones.z4++;
    else zones.z5++;
  });

  return zones;
}

// Fetch detailed activity data including HR zones and all stream data
export async function fetchActivityDetails(
  activityId: string,
  apiKey: string,
  lthr: number = DEFAULT_LTHR,
): Promise<{
  hrZones?: HRZoneData;
  streamData?: StreamData;
  avgHr?: number;
  maxHr?: number;
}> {
  try {
    // Fetch streams
    const streams = await fetchStreams(activityId, apiKey);

    let timeData: number[] = [];
    let hrData: number[] = [];
    let glucoseData: number[] = [];
    let glucoseStreamType: string = "";
    let velocityData: number[] = [];
    let cadenceData: number[] = [];
    let altitudeData: number[] = [];

    for (const s of streams) {
      if (s.type === "time") timeData = s.data;
      if (s.type === "heartrate") hrData = s.data;
      if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) {
        glucoseData = s.data;
        glucoseStreamType = s.type;
      }
      if (s.type === "velocity_smooth") {
        velocityData = s.data;
      }
      if (s.type === "cadence") cadenceData = s.data;
      if (s.type === "altitude") altitudeData = s.data;
    }

    // Convert velocity (m/s) to pace (min/km) with outlier filtering
    const paceData = velocityData.map((v) => {
      if (v === 0 || v < 0.001) return null; // Stopped or invalid
      const pace = 1000 / (v * 60); // Convert m/s to min/km

      // Filter outliers: realistic running pace is 2:00 - 12:00 min/km
      // Faster than 2:00/km = elite sprinting (unlikely)
      // Slower than 12:00/km = walking very slowly (likely GPS error when stopped)
      if (pace < 2.0 || pace > 12.0) return null;

      return pace;
    });

    const result: {
      hrZones?: HRZoneData;
      streamData?: StreamData;
      avgHr?: number;
      maxHr?: number;
    } = {};

    // Calculate HR zones if we have HR data
    if (hrData.length > 0) {
      result.hrZones = calculateHRZones(hrData, lthr);
      result.avgHr = Math.round(
        hrData.reduce((a, b) => a + b, 0) / hrData.length,
      );
      result.maxHr = Math.round(Math.max(...hrData));
    }

    // Process all stream data
    if (timeData.length > 0) {
      const streamData: StreamData = {};

      if (glucoseData.length > 0) {
        const glucoseInMmol = convertGlucoseToMmol(
          glucoseData,
          glucoseStreamType,
        );
        streamData.glucose = timeData.map((t, idx) => ({
          time: Math.round(t / 60), // Convert to minutes
          value: glucoseInMmol[idx],
        }));
      }

      if (hrData.length > 0) {
        streamData.heartrate = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: hrData[idx],
        }));
      }

      if (paceData.length > 0) {
        streamData.pace = timeData
          .map((t, idx) => ({
            time: Math.round(t / 60),
            value: paceData[idx], // Converted from velocity_smooth (m/s) to min/km
          }))
          .filter(
            (point) => point.value !== null && point.value > 0,
          ) as DataPoint[];
      }

      if (cadenceData.length > 0) {
        streamData.cadence = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: cadenceData[idx] * 2, // Convert single-foot to total steps
        }));
      }

      if (altitudeData.length > 0) {
        streamData.altitude = timeData.map((t, idx) => ({
          time: Math.round(t / 60),
          value: altitudeData[idx],
        }));
      }

      if (Object.keys(streamData).length > 0) {
        result.streamData = streamData;
      }
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch activity details:", error);
    return {};
  }
}

// --- CALENDAR API ---
export async function fetchCalendarData(
  apiKey: string,
  startDate: Date,
  endDate: Date,
): Promise<CalendarEvent[]> {
  const auth = "Basic " + btoa("API_KEY:" + apiKey);
  const oldest = format(startDate, "yyyy-MM-dd");
  const newest = format(endDate, "yyyy-MM-dd");

  try {
    // Fetch both activities (completed) and events (planned) in parallel
    const results = await Promise.allSettled([
      fetch(
        `${API_BASE}/athlete/0/activities?oldest=${oldest}&newest=${newest}&cols=*`,
        { headers: { Authorization: auth } },
      ),
      fetch(`${API_BASE}/athlete/0/events?oldest=${oldest}&newest=${newest}`, {
        headers: { Authorization: auth },
      }),
    ]);

    const activitiesRes =
      results[0].status === "fulfilled" ? results[0].value : null;
    const eventsRes =
      results[1].status === "fulfilled" ? results[1].value : null;

    const activities = activitiesRes?.ok ? await activitiesRes.json() : [];
    const events = eventsRes?.ok ? await eventsRes.json() : [];

    const calendarEvents: CalendarEvent[] = [];

    // Filter run activities (including VirtualRun for treadmill runs)
    const runActivities = activities.filter(
      (a: IntervalsActivity) => a.type === "Run" || a.type === "VirtualRun",
    );

    // Process completed activities
    const activityMap = new Map<string, CalendarEvent>();

    runActivities.forEach((activity: IntervalsActivity) => {
      const category = getWorkoutCategory(activity.name);

      // Calculate pace (min/km) if we have distance and duration
      let pace: number | undefined;
      if (activity.distance && activity.moving_time) {
        const distanceKm = activity.distance / 1000;
        const durationMin = activity.moving_time / 60;
        pace = durationMin / distanceKm;
      }

      // Extract HR zones from the API response (icu_hr_zone_times)
      let hrZones: HRZoneData | undefined;
      if (
        activity.icu_hr_zone_times &&
        activity.icu_hr_zone_times.length >= 5
      ) {
        hrZones = {
          z1: activity.icu_hr_zone_times[0],
          z2: activity.icu_hr_zone_times[1],
          z3: activity.icu_hr_zone_times[2],
          z4: activity.icu_hr_zone_times[3],
          z5: activity.icu_hr_zone_times[4],
        };
      }

      // Try to find matching planned event for this activity to get the description
      const activityDate = parseISO(
        activity.start_date_local || activity.start_date,
      );
      const matchingEvent = events.find((event: any) => {
        if (event.category !== "WORKOUT") return false;
        const eventDate = parseISO(event.start_date_local);
        const sameDay = isSameDay(activityDate, eventDate);
        const similarName =
          activity.name
            ?.toLowerCase()
            .includes(event.name?.toLowerCase().substring(0, 10)) ||
          event.name
            ?.toLowerCase()
            .includes(activity.name?.toLowerCase().substring(0, 10));
        return sameDay && similarName;
      });

      // Use event description if found, otherwise use activity description
      const description =
        matchingEvent?.description || activity.description || "";

      const calendarEvent: CalendarEvent = {
        id: `activity-${activity.id}`,
        date: activityDate,
        name: activity.name,
        description,
        type: "completed",
        category,
        distance: activity.distance,
        duration: activity.moving_time,
        avgHr: activity.average_heartrate || activity.average_hr,
        maxHr: activity.max_heartrate || activity.max_hr,
        load: activity.icu_training_load,
        intensity: activity.icu_intensity,
        pace: activity.pace || pace,
        calories: activity.calories,
        cadence: activity.average_cadence
          ? activity.average_cadence * 2
          : undefined, // Convert single-foot to total steps
        hrZones,
        // streamData will be loaded below for recent activities
      };

      activityMap.set(activity.id, calendarEvent);
      calendarEvents.push(calendarEvent);
    });

    // Process planned events (but skip ones that have been completed)
    for (const event of events) {
      if (event.category !== "WORKOUT") continue;

      const name = event.name || "";
      const eventDate = parseISO(event.start_date_local);

      // Check if this event has a matching completed activity
      // Match by name similarity and date proximity (same day)
      const hasMatchingActivity = runActivities.some(
        (activity: IntervalsActivity) => {
          const activityDate = parseISO(
            activity.start_date_local || activity.start_date,
          );
          const sameDay = isSameDay(activityDate, eventDate);
          const similarName =
            activity.name
              ?.toLowerCase()
              .includes(name.toLowerCase().substring(0, 10)) ||
            name
              .toLowerCase()
              .includes(activity.name?.toLowerCase().substring(0, 10));
          return sameDay && similarName;
        },
      );

      // Skip this event if it has been completed
      if (hasMatchingActivity) {
        continue;
      }

      const isRace = name.toLowerCase().includes("race");
      const category = isRace ? "race" : getWorkoutCategory(name);

      calendarEvents.push({
        id: `event-${event.id}`,
        date: eventDate,
        name,
        description: event.description || "",
        type: isRace ? "race" : "planned",
        category,
        distance: event.distance || 0,
        duration: event.moving_time || event.duration || event.elapsed_time,
      });
    }

    // Sort by date
    calendarEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    return calendarEvents;
  } catch (error) {
    console.error("Failed to fetch calendar data:", error);
    return [];
  }
}

// --- API UPLOAD ---
export async function uploadToIntervals(
  apiKey: string,
  events: WorkoutEvent[],
): Promise<number> {
  const auth = "Basic " + btoa("API_KEY:" + apiKey);
  const todayStr = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
  const endStr = format(addDays(new Date(), 365), "yyyy-MM-dd'T'HH:mm:ss");

  // Delete all future workouts with a single call
  try {
    console.log("Deleting all future workouts...");
    const deleteRes = await fetch(
      `${API_BASE}/athlete/0/events?oldest=${todayStr}&newest=${endStr}&category=WORKOUT`,
      {
        method: "DELETE",
        headers: { Authorization: auth },
      },
    );

    if (!deleteRes.ok) {
      console.error(`Delete failed with status ${deleteRes.status}`);
    }
  } catch (deleteError) {
    console.error("Error during deletion phase:", deleteError);
    // Continue with upload even if deletion fails
  }

  // Upload the new plan
  const payload = events.map((e) => ({
    category: "WORKOUT",
    start_date_local: format(e.start_date_local, "yyyy-MM-dd'T'HH:mm:ss"),
    name: e.name,
    description: e.description,
    external_id: e.external_id,
    type: e.type,
  }));

  try {
    const res = await fetch(`${API_BASE}/athlete/0/events/bulk?upsert=true`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API Error ${res.status}: ${errorText}`);
    }
    return payload.length;
  } catch (error) {
    console.error("Upload failed:", error);
    console.error("Payload size:", payload.length);
    console.error("First event:", payload[0]);
    throw error;
  }
}
