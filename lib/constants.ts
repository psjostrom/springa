import type { PaceTable, SpeedSessionType } from "./types";

// --- CONSTANTS ---
export const DEFAULT_LTHR = 169;
export const CRASH_DROP_RATE = -3.0;
export const SPIKE_RISE_RATE = 3.0;
export const DEFAULT_CARBS_G = 10;
export const API_BASE = "https://intervals.icu/api/v1";

export const FALLBACK_PACE_TABLE: PaceTable = {
  easy: { zone: "easy", avgPace: 6.71, sampleCount: 0 },
  steady: { zone: "steady", avgPace: 5.67, sampleCount: 0 },
  tempo: { zone: "tempo", avgPace: 5.21, sampleCount: 0 },
  hard: { zone: "hard", avgPace: 4.75, sampleCount: 0 },
};

export const SPEED_ROTATION: SpeedSessionType[] = [
  "short-intervals",
  "hills",
  "long-intervals",
  "distance-intervals",
];

export const SPEED_SESSION_LABELS: Record<SpeedSessionType, string> = {
  "short-intervals": "Short Intervals",
  hills: "Hills",
  "long-intervals": "Long Intervals",
  "distance-intervals": "Distance Intervals",
  "race-pace-intervals": "Race Pace Intervals",
};

export const HR_ZONE_COLORS = {
  z1: "#6ee7b7",
  z2: "#06b6d4",
  z3: "#fbbf24",
  z4: "#fb923c",
  z5: "#ef4444",
} as const;

export const PACE_ESTIMATES = {
  easy: 6.75,
  steady: 6.15,
  tempo: 5.15,
  hard: 4.75,
} as const;
