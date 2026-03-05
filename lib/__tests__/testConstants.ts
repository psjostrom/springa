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
