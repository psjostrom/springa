# Zone Model Analysis

**Status:** Research complete, implementation deferred.

## Ben Parkes' Model (Source of Inspiration)

Ben Parkes' half marathon plans are **pace-based, not HR-based**. He uses 4 effort levels:

| Level | Feel | What it's for |
|-------|------|---------------|
| Easy Pace | Conversational, relaxed | Aerobic base, long runs |
| HM Pace | Goal race pace | Race simulation, long run sections |
| Interval Pace | ~5k effort, hard but not sprint | Speed sessions |
| Strides | 20s bursts at 95% effort | Form, stride length |

Pace tables are given by goal finish time (e.g., 2h20 HM goal -> Easy 7:03-7:46 min/km).

His YouTube video links to CalculatorSoup for HR zone education, which uses simple **%MHR** (not Karvonen):
- Z1 (Warm Up): 50-60% MHR
- Z2 (Fat Burn): 60-70% MHR
- Z3 (Aerobic): 70-80% MHR
- Z4 (Anaerobic): 80-90% MHR
- Z5 (VO2 Max): 90-100% MHR

## Springa's Current Model

Springa uses 5 HR zones from Intervals.icu: `[Z1top, Z2top, Z3top, Z4top, Z5top]` as BPM boundaries.

These map to 4 training intensities:
- **Easy** (Z1+Z2): warmups, easy runs, cooldowns
- **Steady** (Z3): race pace sections
- **Tempo** (Z4): threshold work
- **Hard** (Z5): intervals, VO2max

Zone boundaries come from Intervals.icu which syncs from Garmin. They are NOT computed from a formula — they reflect the user's watch configuration.

## The Problem

1. New Intervals.icu accounts default to 7 zones (not 5). Springa rejects them.
2. When computing fallback zones (Karvonen), different formulas produce wildly different results (up to 13 bpm difference on Z2 top).
3. Springa's zone names (easy/steady/tempo/hard) don't map to Ben Parkes' pace names (Easy/HM/Interval/Strides) or to the calculator's names (Warm Up/Fat Burn/Aerobic/Anaerobic/VO2 Max).

## Per's Actual Values

- MHR: 193 (Garmin-measured)
- LTHR: 170 (tested)
- RHR: 61 (Garmin-measured)
- Current Intervals.icu zones: [114, 140, 155, 167, 189]

## Open Questions

- Should Springa use HR zones, pace zones, or both?
- Which formula for computing zones when Intervals.icu doesn't provide 5?
- Should we align zone names with Ben Parkes' pace model?
- How do HR zones and pace zones relate for workout descriptions?

## Next Steps

Deferred to a dedicated session. The Karvonen fallback in the wizard is a temporary "get unblocked" solution. The zone formulas and model alignment need proper design work.
