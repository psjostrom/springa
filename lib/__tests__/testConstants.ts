/**
 * Shared test constants for zone-related tests.
 * Synced from Intervals.icu: 2026-03-05
 *
 * Zone boundaries:
 *   Z1 Active Recovery: 0-68%   →   0-114 bpm
 *   Z2 Easy:            68-83%  → 115-140 bpm
 *   Z3 Race Pace:       84-92%  → 141-155 bpm
 *   Z4 Threshold:       93-99%  → 156-167 bpm
 *   Z5 VO2 Max:         100%+   → 168-189 bpm
 */

/** Zone ceilings [Z1top, Z2top, Z3top, Z4top, Z5top] in BPM. */
export const TEST_HR_ZONES = [114, 140, 155, 167, 189] as const;

/** LTHR (Lactate Threshold Heart Rate). */
export const TEST_LTHR = 168;

/** Max HR. */
export const TEST_MAX_HR = 189;

/** Goal time for HM in seconds (2h20m). */
export const TEST_GOAL_TIME = 8400;

/**
 * Pre-computed zone strings for tests.
 * These match what the code generates with TEST_HR_ZONES and TEST_LTHR.
 */
export const TEST_ZONE_STRINGS = {
  // Easy: Z1top-Z2top → 114-140 bpm, 68-83% LTHR
  easy: "68-83% LTHR (114-140 bpm)",
  // Steady: Z2top-Z3top → 140-155 bpm, 83-92% LTHR
  steady: "83-92% LTHR (140-155 bpm)",
  // Tempo: Z3top-Z4top → 155-167 bpm, 92-99% LTHR
  tempo: "92-99% LTHR (155-167 bpm)",
  // Hard: Z4top-Z5top → 167-189 bpm, 99-113% LTHR
  hard: "99-113% LTHR (167-189 bpm)",
  // Walk: 50%-Z1top → 84-114 bpm, 50-68% LTHR
  walk: "50-68% LTHR (84-114 bpm)",
} as const;
