# Pace Zone Analysis & Zone Naming Alignment

**Date:** 2026-04-11
**Status:** Ready for review
**Depends on:** PR #146 (zone system redesign — merged)
**Related:** `docs/specs/2026-04-09-zone-system-redesign.md` (parent spec, Sections 7 + 8.5)

---

## Problem

Springa has pace-based workout prescription (PR #139, #146) but no pace zone analysis. After a run, the user sees HR zone time-in-zone bars but nothing for pace. They can't answer "did I spend the right amount of time at the right pace?"

Additionally, the zone naming is misaligned with the industry. Springa calls Z3 "Steady" and Z4 "Tempo", but every major platform (Strava, Garmin, Intervals.icu, Coggan) calls Z3 "Tempo" and Z4 "Threshold." This off-by-one creates confusion for users who cross-reference with other tools.

---

## Decisions

### 1. Zone names align with industry standard

Coggan / Strava / Intervals.icu naming, applied to both HR and pace zones:

| Zone | Display Name |
|------|-------------|
| Z1 | Recovery |
| Z2 | Endurance |
| Z3 | Tempo |
| Z4 | Threshold |
| Z5 | VO2 Max |

**Why not keep "Easy" for Z2?** "Easy" describes effort (how hard it feels) — that's HR territory. A pace zone should describe the type of running at that speed. "Endurance" describes what the pace builds, not how it feels. You can run at Endurance pace uphill and be dying inside — the pace is still Endurance even if the effort isn't easy.

**Internal keys use z-numbers.** The old descriptive keys (`easy`, `steady`, `tempo`, `hard`) created a permanent mismatch — `tempo` in code meant something different from "Tempo" in the UI. Instead of renaming to new descriptive keys that would still be approximate, use neutral z-numbers (`z1`…`z5`). Display names come from `ZONE_DISPLAY_NAMES`. Code never uses words like "endurance" or "threshold" as identifiers — just `z1`-`z5`, always.

### 2. Prescription stays in plain language

Workouts still say "easy run", "race pace", "intervals" — never zone names. Zone vocabulary appears only in analysis charts and settings.

### 3. Pace zone boundaries use Strava-derived percentages

Contiguous pace zones derived from threshold pace (HM-equivalent of current ability). Boundaries reverse-engineered from Strava's pace zone model:

| Zone | % of threshold speed | For threshold = 6:00/km | For threshold = 5:10/km |
|------|---------------------|------------------------|------------------------|
| Z1 Recovery | < 77% | > 7:48 /km | > 6:43 /km |
| Z2 Endurance | 77-90% | 6:40 - 7:48 /km | 5:44 - 6:43 /km |
| Z3 Tempo | 90-100% | 6:00 - 6:40 /km | 5:10 - 5:44 /km |
| Z4 Threshold | 100-107% | 5:36 - 6:00 /km | 4:50 - 5:10 /km |
| Z5 VO2 Max | > 107% | < 5:36 /km | < 4:50 /km |

**Why Strava's model over CTS?** CTS Run (72/91/97/102%) produces an absurdly narrow Z4 Threshold band. A 5K race for a recreational runner (~105% of threshold) classifies as Z5 VO2 Max under CTS — but a 25-minute 5K is a threshold effort, not VO2 Max. Strava's wider Z4 (100-107%) correctly places 5K pace in Threshold.

### 4. Easy ceiling lowered to align with Z2

The current easy prescription ceiling (94%) sits above the Z2/Z3 boundary (90%). Fix: lower to 88%, placing it inside Z2 Endurance.

### 5. Editable zones deferred

Requires a settings page that doesn't exist yet. Deferred to a follow-up PR.

---

## Known issues (out of scope)

### Race pace sections are broken for trail races

When goal race pace is slower than the easy ceiling, race-pace sandwich sections prescribe a pace in Z1 Recovery. Fix belongs in planner/prescription logic.

### Editable zones UI / Aggregate pace zone analysis

Deferred to follow-up PRs. Intervals.icu pace zone push is implemented — zones are pushed alongside threshold pace via `updatePaceZones()` in `lib/intervalsApi.ts`.

---

## Out of scope (separate PRs)

- Pace auto-update system (spec Section 10)
- Post-run reconciliation (spec Section 9)
- Editable zones UI (spec Section 8.5)
- Aggregate zone analysis
- Trail race pace prescription fix
