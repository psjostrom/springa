# Zone System Redesign

> Spec for Springa's pace and HR zone architecture. Covers prescription (telling users how to run), analysis (reviewing what happened), and auto-updating (learning from real data). Designed for recreational runners, including those with Type 1 Diabetes.

**Date:** 2026-04-09
**Status:** Draft — reviewed, corrections applied
**Branch:** `refactor/plan-config-object` (zones work follows this cleanup)
**Related:** `docs/specs/2026-04-07-pace-primary-zone-redesign.md` (predecessor, partially superseded)

---

## Table of Contents

1. [Background & Problems](#1-background--problems)
2. [Users](#2-users)
3. [Design Principles](#3-design-principles)
4. [Current Ability: The Single Anchor](#4-current-ability-the-single-anchor)
5. [Goal Time: A Separate Concept](#5-goal-time-a-separate-concept)
6. [Pace Prescription](#6-pace-prescription)
7. [Pace Zones (Analysis)](#7-pace-zones-analysis)
8. [HR Zones (Analysis)](#8-hr-zones-analysis)
9. [Post-Run Analysis & Reconciliation](#9-post-run-analysis--reconciliation)
10. [Pace Auto-Update System](#10-pace-auto-update-system)
11. [BG Layer (Springa's Differentiator)](#11-bg-layer-springas-differentiator)
12. [Intervals.icu Integration](#12-intervalsicu-integration)
13. [Wizard Changes](#13-wizard-changes)
14. [What We Drop](#14-what-we-drop)
15. [Open Questions](#15-open-questions)
16. [Research Sources](#16-research-sources)

---

## 1. Background & Problems

### 1.1 Where We Started

Springa's pace-primary redesign (PR #139) introduced pace-based workout descriptions using Intervals.icu's `% pace` syntax, with Ben Parkes ratios deriving training paces from a goal time. HR zones used the Karvonen formula (requiring max HR + resting HR) for post-run analysis.

This worked for Per's specific case but raised fundamental questions about scaling to other users.

### 1.2 The Problems

**Problem 1: Goal time is the wrong anchor for training paces.**

Our wizard asks for a *goal time* — what you aspire to run. For flat road races (5K, 10K, HM), goal pace and threshold pace are close enough that goal-derived training paces work. But for trail races (e.g., EcoTrail 16km with significant elevation), goal race pace can be drastically different from flat-road fitness:

- Per's Garmin LT estimate: 5:10/km (flat road)
- EcoTrail 16km goal: 8:45/km (trail with elevation)

Training at paces derived from 8:45/km goal pace produces workouts with no training stimulus. A "tempo" run at 7:50/km (90% of trail goal pace) is well below threshold for someone whose LT is 5:10/km.

Runna solves this by asking for **current fitness** (estimated race time at any flat distance), not goal time. The race is what you're training FOR. Training paces come from where you ARE.

**Problem 2: Karvonen HR zones require resting HR, which most users don't know.**

The Karvonen formula produces individualized zones by accounting for resting HR. But:

- A fresh Intervals.icu account has `icu_resting_hr: null`
- Most recreational runners can't tell you their resting HR
- Our wizard's HRZonesStep asks for it, creating friction
- The resulting zones are narrow: Karvonen Z2 = ~13 bpm wide for a typical runner

Runna and Strava derive HR zones from max HR alone (estimated via 220-age or from watch data). No resting HR needed. Runna's Z2 is ~30 bpm wide — actually usable. A PMC study of 165 recreational runners found Karvonen is NOT meaningfully more accurate than %maxHR — both produce identical error magnitudes (MAE ~6.7 bpm at LT1, ~3.4 bpm at LT2). The extra friction of asking for RHR buys nothing.

**Problem 3: "Zones" were conflated with "prescription."**

We treated zones as something users need to understand and configure. In practice:

- Ben Parkes (beginner HM plans) never mentions zones. Three effort levels: Easy, HM Pace, Interval Pace.
- Runna prescribes "conversational pace, no faster than 6:45/km." Never says "Zone 2."
- Zones exist for POST-RUN analysis (time-in-zone charts), not for telling runners what to do.

**Problem 4: Pace prescription used ranges, not ceilings.**

We prescribed easy runs as a pace range (e.g., 6:30-7:00/km). Beginners treat ranges as targets — they try to hit the fast end. Runna uses a pace CEILING: "No faster than 6:45/km. This is a limit, not a target — run at whatever pace feels truly easy!" This gives permission to be slow, which is exactly what easy runs need.

**Problem 5: No clear path for pace auto-updating.**

The pace-primary spec mentioned an auto-update system but didn't define what data feeds it, when it triggers, or how it interacts with T1D-specific considerations.

**Problem 6: HR zone boundaries were too narrow for practical use.**

- Karvonen Z2: ~13-14 bpm wide
- LTHR-based Z2: ~7 bpm wide (proposed and correctly rejected)
- Standard % max HR (Garmin/Apple): Z2 = 60-70% max = ~18-19 bpm wide

Your HR fluctuates 10+ bpm from a small hill. A 13-beat zone means you're constantly drifting in and out. You need Z2 to be ~25-30 bpm wide to be usable while running.

### 1.3 What We Learned From Research

**Platforms studied:** Runna (onboarding + post-run analysis + Pace Insights), Strava (Training Zones + Athlete Intelligence + pace zone settings), Garmin, COROS EvoLab, TrainingPeaks, Stryd.

**Coaching methodologies studied:** Ben Parkes (beginner HM plans), Jack Daniels (VDOT), Matt Fitzgerald (80/20), Steve Seiler (polarized), Norwegian method.

**T1D exercise research:** T1DEXI study (n=497, largest T1D exercise study), ADA position statement, studies on exercise-BG interaction and HR reliability in T1D.

**Key findings:**

1. Every serious platform separates prescription (how to run) from analysis (what happened). Zones are for analysis.
2. Pace is the primary prescription metric. HR is a secondary guardrail.
3. Runna asks for current fitness (not goal time) and derives all paces from it. This solves the trail race problem.
4. Easy runs should use a pace ceiling, not a range. Permission to be slow.
5. Runna uses 65/81/89/97% of max HR for 5-zone HR analysis. Strava uses a slightly different model (59/78/87/97%). Runna's model produces Z2 ~30 bpm wide, starting at 65% where actual running begins. We adopt Runna's model.
6. Pace auto-updates should come from speed sessions only (not easy runs). HR-based fitness estimation is unreliable for all runners (lag, cardiac drift, day-to-day variability from sleep/heat/caffeine/hydration). For T1D runners, BG adds further noise to HR. Pace from speed sessions is the cleanest signal.
7. Steady-state running drops BG most (T1DEXI population mean: -18 mg/dL, SD 39). Intervals drop less (mean -14, SD 32). Within-individual variability is massive — workout category is a directional prior for the BG model, not a reliable per-individual prediction.

---

## 2. Users

### 2.1 Primary User

A recreational runner training for a race. Beginner to intermediate. May or may not have Type 1 Diabetes. Has a GPS running watch (required — we need HR and pace data). May have never raced before. Does not know what lactate threshold, VDOT, HRR, or Karvonen mean.

They opened Springa because they want to:
- Train for a specific race (5K, 10K, half marathon, trail race)
- Know what to do on each training day
- Know if they did it right after each run
- Get faster over time
- (If T1D) Manage blood glucose during runs and get fuel recommendations

### 2.2 What They Know

- What race they want to do (distance, date, maybe a specific event)
- Roughly how experienced they are (beginner / regular / experienced)
- Roughly how fit they are (can run 5K, can run 10K comfortably, etc.)
- Their birthday (for age)

### 2.3 What They Don't Know (and Should Never Be Asked)

- Lactate threshold (HR or pace)
- Max heart rate (unless their watch told them)
- Resting heart rate
- VDOT score
- Functional threshold pace
- What "Zone 2" means in physiological terms
- Heart rate reserve

### 2.4 What Their Watch Knows

- HR during runs (wrist or chest strap)
- Pace during runs (GPS)
- Max HR observed (from hard efforts)
- Possibly resting HR (from overnight tracking)

We access this data through Intervals.icu (connected to Garmin/Strava/COROS/etc.).

---

## 3. Design Principles

### 3.1 Prescription and analysis are separate systems

**Prescription** tells the runner what to do: "6km easy run, no faster than 6:45/km." Uses effort names and pace targets. Never mentions zones.

**Analysis** tells the runner what happened: time-in-zone bars, pace splits, HR charts, BG feedback. Uses zones for visualization and AI commentary for interpretation.

These two systems share the same underlying data (current ability → pace ratios, max HR → zone boundaries) but present differently to the user.

### 3.2 One anchor, everything derives

All training paces derive from a single number: **current ability** (expressed as an estimated race time at a standard distance). Change this one number, all paces update. No separate threshold, no separate race pace, no separate easy pace — they're all ratios of the anchor.

### 3.3 Start approximate, get precise

Day one: estimated from experience level + age. After a few speed sessions: refined from real data. The system should be useful immediately and improve over time. Never block a user because we lack data.

### 3.4 The user sees names, not numbers

The user sees "Easy run" and "Tempo" and "Intervals" — not "Zone 2 run" or "85% pace." Zone numbers appear in post-run analysis charts but are never part of the instruction.

### 3.5 Permission to be slow

Easy runs use a ceiling ("no faster than X/km"), not a target range. The hardest thing for most runners is running easy enough. The prescription should reinforce this, not undermine it.

### 3.6 T1D-aware but not T1D-exclusive

The zone system works for all runners. BG features (fuel rates, pre-run readiness, post-run BG analysis) layer on top for users with sugar mode enabled. The zone system itself doesn't change based on diabetes status.

---

## 4. Current Ability: The Single Anchor

### 4.1 What It Is

The user's estimated current race time at a standard flat-road distance. This represents their current aerobic fitness, not their aspiration.

Examples:
- "I can run a 10K in about 1:00:00" → 6:00/km current pace
- "I can run a 5K in about 30:00" → 6:00/km current pace
- "I'm a beginner, I can jog 5K in about 40:00" → 8:00/km current pace

### 4.2 How We Get It

**Option A: From experience level (default path)**

The wizard asks experience level (beginner / intermediate / advanced). We set a default current ability based on this:

| Level | Description | Default 5K | Default 10K |
|-------|-------------|-----------|------------|
| Beginner | Can complete 5K without stopping | ~35:00 (7:00/km) | ~1:15:00 (7:30/km) |
| Intermediate | Regularly runs 5K+, no structured training | ~28:00 (5:36/km) | ~1:00:00 (6:00/km) |
| Advanced | Regularly runs 10K+, does intervals | ~23:00 (4:36/km) | ~48:00 (4:48/km) |

The user can adjust this with a slider. It's presented as "About how fast can you run X right now?" — not "What's your current race time?"

**Option B: From Intervals.icu data**

If the user connects Intervals.icu and has recent running data, we can pull their best recent efforts and auto-detect current ability. This is the most accurate path and requires zero user input beyond connecting the account.

**Option C: From manual input**

User can enter a recent race result or time trial at any distance. We convert to the standard anchor using Riegel distance conversion (already implemented).

### 4.3 How It's Used

Current ability (as a pace) becomes the anchor for all training pace derivation. Using ratios (Ben Parkes style, already implemented):

For a runner with current 10K ability of 1:00:00 (6:00/km):

| Effort Level | Ratio | Pace |
|-------------|-------|------|
| Easy ceiling | ~1.10-1.15x | ~6:45/km |
| Steady | ~1.00-1.05x | ~6:00-6:18/km |
| Tempo | ~0.92-0.95x | ~5:31-5:42/km |
| Interval | ~0.85-0.90x | ~5:06-5:24/km |
| Strides | Effort-based | 95% effort |
| Walk/recovery | N/A | Walking pace |

*(Exact ratios TBD — these are illustrative. The existing Ben Parkes ratios in `computeZonePacePct()` are a starting point.)*

### 4.4 Distance Conversion

Users can express their current ability at any distance (5K, 10K, HM, marathon). We convert internally using Riegel's formula (already in codebase) to a standard reference distance. Which reference distance to use internally (5K or 10K) is an implementation detail — the user never sees it.

### 4.5 Data Model

Two new fields in `user_settings`:

```
current_ability_secs  INTEGER  -- estimated time at reference distance (seconds)
current_ability_dist  REAL     -- which distance in km (e.g., 5.0, 10.0, 21.0975)
```

The existing `goal_time` field is **retained** but scoped down — it is no longer used for training pace derivation. `goal_time` is only consumed by:
- Race-pace sandwich sections in long runs
- Fueling strategy (estimated time on course)
- Progress tracking and motivational display
- Race pace pushed to Intervals.icu for race-specific analysis

Everything that currently reads `goalTime` for pace derivation switches to `currentAbility`. The `dist` field preserves which distance the user thinks in, so the UI and auto-update messages stay in their language (e.g., "Your 10K has improved from 55:00 to 52:00").

Internally, we always convert to a 5K equivalent via Riegel before deriving training paces. The user never sees this normalization.

---

## 5. Goal Time: A Separate Concept

### 5.1 What It's For

Goal time is aspirational — what the user wants to achieve in their target race. It is NOT used for training pace derivation.

**Goal time is used for:**
- Race-specific workout sections (e.g., long runs with segments "at race pace")
- Fueling strategy (estimated time on course → fuel planning)
- Progress tracking ("You're on track to beat your goal")
- Pushing race pace to Intervals.icu for race-specific analysis
- Motivational context ("12 weeks to your 2:20 EcoTrail")

### 5.2 How We Get It

Three options (Garmin-style):
1. **Set a finish time** — "I want to finish in 2:20:00"
2. **Set a pace** — "I want to average 8:45/km"
3. **Just finish** — no time goal, focus on completion

For "just finish," we skip race pace sections in workouts and focus purely on building endurance at the runner's current ability level.

### 5.3 Relationship to Current Ability

Goal time can be faster, slower, or equal to what the runner's current ability predicts for the race distance. This is fine:

- Faster goal → the plan builds toward it (progressive overload, race-specific prep)
- Equal goal → the plan maintains and sharpens
- "Just finish" → the plan focuses on distance and endurance

The training paces (easy ceiling, interval targets) always come from current ability, regardless of the goal.

---

## 6. Pace Prescription

### 6.1 How Workouts Are Described

Workouts use effort names and pace guidance. Never zone numbers.

**Easy runs:**
> "6km easy run at a conversational pace. No faster than 6:45/km. This is a limit, not a target — run at whatever pace feels truly easy!"

**Tempo runs:**
> "10 min warmup, 20 min at tempo pace (5:31-5:42/km), 10 min cooldown"

**Intervals:**
> "10 min warmup, 6x 3 min at interval pace (5:06-5:24/km), 2 min walk recovery, 10 min cooldown"

**Long runs with race pace sections:**
> "15km long run: 5km easy, 5km at race pace (8:45/km), 5km easy"

**Hill repeats:**
> "1.5km warmup at easy pace, 10x 60s hard uphill / walk down, 1.5km cooldown"

**Strides:**
> "Add 4x 20s strides at 95% effort with 60s easy jog between"

### 6.2 Effort Levels

Five effort levels for prescription (matching Ben Parkes + walk breaks):

| Effort | Description | Pace derivation |
|--------|-------------|----------------|
| **Easy** | Conversational pace. Can speak in full sentences. | Ceiling from current ability |
| **Steady/Race Pace** | Comfortably hard. Goal race effort. | From goal time (if set) or current ability |
| **Tempo** | Can only say a few words. Sustained hard effort. | From current ability (~92-95%) |
| **Interval** | Hard but controlled. Roughly 5K race effort. | From current ability (~85-90%) |
| **Strides** | Short bursts of fast running. | Effort-based (95%), no specific pace |

Plus walk/recovery (no pace prescribed).

### 6.3 What Goes to the Watch

Workouts pushed to Intervals.icu → Garmin use the `% pace` syntax with threshold_pace set to derive the correct absolute paces. The watch shows pace targets per step.

For easy runs, we use a low floor with the ceiling as the upper bound: e.g., `30-88% pace`. The floor (30%) is low enough to allow walking without triggering a pace alert. It exists only to satisfy the structured workout format — it is never a real target. The watch only buzzes when you exceed the ceiling (88%), which is the "no faster than" signal. Tested and confirmed working on Garmin via Intervals.icu.

### 6.4 Pace Zones on the Watch

We push contiguous pace zones to Intervals.icu (which can sync to Garmin) so the watch can color-code current pace. This gives the runner a visual indicator ("I'm in the green zone") without requiring them to know what "Zone 3" means.

Zone boundaries for the watch are derived from current ability using the same ratios as the prescription effort levels, extended to be contiguous (no gaps between zones).

---

## 7. Pace Zones (Analysis)

### 7.1 Purpose

Pace zones are used in post-run analysis to classify every second of the run into a named effort level. This enables:
- Time-in-zone bar charts ("73% in Endurance, 23% in Tempo, 4% in Threshold")
- Training distribution analysis ("82% easy, 18% hard — good 80/20 balance")
- Progress tracking over time (aggregate zone distribution over weeks/months)

### 7.2 Zone Count and Names

**5 contiguous zones** derived from current ability, matching the 5 HR zones for consistency:

| Zone | Name | Description |
|------|------|-------------|
| Z1 | Recovery | Walking, very slow jogging |
| Z2 | Endurance | Easy running, conversational |
| Z3 | Tempo | Comfortably hard, sustained |
| Z4 | Threshold | Hard, interval/race effort |
| Z5 | Speed | Very hard, strides/sprints |

Strava uses 6 pace zones (splitting VO2 Max and Anaerobic), but the 6th zone (Anaerobic, sprint efforts) is rarely relevant for recreational runners training for 5K-marathon. 5 zones keeps it simpler and maps 1:1 with the HR zones, making post-run reconciliation straightforward (pace Z3 "Tempo" aligns with HR Z3 "Tempo").

### 7.3 Zone Boundaries

Derived from current ability using % of anchor pace. Exact percentages TBD — should align with the prescription effort levels so that "Easy" in prescription maps to Z2 (Endurance) in analysis.

The boundaries must be **contiguous** — every pace maps to exactly one zone. Unlike prescription ranges (which can have gaps as coaching guidance), analysis zones cover the full spectrum.

### 7.4 Visualization

- **Per-run:** Horizontal time-in-zone bars (like Strava/Runna)
- **Aggregate:** Time-in-zone over 7D / 1M / 3M / YTD (like Strava's Training Zones view)
- **AI commentary:** "Strong easy run — 85% in Endurance zone. Your pacing was consistent throughout." (reconciles with HR data — see Section 9)

---

## 8. HR Zones (Analysis)

### 8.1 Purpose

HR zones classify effort based on heart rate. Used alongside pace zones in post-run analysis to provide a complete picture. HR reveals physiological effort — pace reveals performance. Together they answer "did I run at the right effort?"

### 8.2 Zone Count and Names

**5 zones**, derived from max HR:

| Zone | Name | Approx % Max HR |
|------|------|----------------|
| Z1 | Recovery | < 65% |
| Z2 | Endurance | 65-81% |
| Z3 | Tempo | 81-89% |
| Z4 | Threshold | 89-97% |
| Z5 | Anaerobic | 97%+ |

### 8.3 Why These Percentages

**The standard industry model (Garmin, Apple, Polar, Whoop) uses 50/60/70/80/90%.** This produces equal 10% bands and a Z2 of ~18-19 bpm wide. The problem: Z1 (50-60%) covers walking/warm-up that barely counts as running, and Z2 (60-70%) is narrower than what coaches mean by "easy running."

**Two alternative models exist:**

| | Strava | Runna |
|---|---|---|
| Z1 top | 59% | 65% |
| Z2 top | 78% | 81% |
| Z3 top | 87% | 89% |
| Z4 top | 97% | 97% |
| Z2 width (maxHR 185) | ~35 bpm | ~30 bpm |

**We adopt Runna's model (65/81/89/97%)** because:
- Strava's Z1 extends to 59% — that's walking and barely jogging, wasting the bottom of the zone range
- Runna starts "useful running" at 65%, which better matches where actual running begins
- Z2 of 65-81% produces ~30 bpm width — practical for running
- The boundaries better match the coaching definition of "easy" (Norwegian Olympic Federation defines Zone 2 as 72-82% of max HR)
- Most training time correctly classifies as Z2 instead of splitting between Z2 and Z3

**Sports science context:**
- VT1 (first lactate threshold): Davis meta-analysis (n=412 runners) found 90% CI of 69-94% of max HR
- VT2 (second lactate threshold): same study found 90% CI of 80-98% of max HR
- The variation is large (25 and 18 percentage points respectively), confirming that fixed % max HR zones are approximations that will be wrong for ~40-50% of users at any conventional anchor
- Both %maxHR and Karvonen produce identical error magnitudes for recreational runners (PMC study, n=165). No fixed system avoids this without lab testing.
- Editable zones are the escape hatch — same approach as Runna and Strava. Most users never touch it, but those who know better can adjust.

### 8.4 How We Get Max HR

**Priority order:**
1. **From Intervals.icu athlete profile** — `max_hr` on run sport settings (available on every account, even fresh ones: the test account showed max_hr=189)
2. **From observed data** — highest HR recorded across all activities (Intervals.icu may auto-detect this)
3. **From age** — 220 - age (least accurate but available immediately)

We NEVER ask the user to manually enter max HR during onboarding. We use whatever data we have and improve over time. The user CAN edit it in settings if they know better.

### 8.5 Editable Zones

Like Runna and Strava, we provide an "Edit zones" option in settings. For users who know their actual max HR, or who want to adjust boundaries based on their experience. Most users will never touch this.

### 8.6 What We Push to Intervals.icu

We push our 5-zone HR boundaries to Intervals.icu so their analysis matches ours. This replaces the default 7-zone LTHR-based system that Intervals.icu creates for new accounts.

We also push `icu_resting_hr` if we obtain it from watch data (wellness sync), but we don't require it and don't use it for zone computation.

---

## 9. Post-Run Analysis & Reconciliation

### 9.1 The Mixed Messages Problem

If we prescribe by pace and separately show HR zones, the user can get contradictory signals: "Your pace was perfect, but your HR was too high." This is confusing without interpretation.

### 9.2 Reconciled Feedback

Every post-run analysis reconciles pace and HR into a single coherent message:

| Pace vs target | HR vs expected | Message |
|---------------|----------------|---------|
| On target | Expected | "Good run, right on target. Your effort matched the plan." |
| On target | Too high | "You hit the pace, but your body was working harder than expected. Could be heat, hills, stress, or fatigue. On days like this, it's OK to slow down — effort matters more than pace for easy runs." |
| Too fast | Too high | "This was harder than planned. Easy runs are about keeping it conversational — try slowing down next time." |
| On target | Low | "That felt comfortable. You might be ready for faster paces soon." |
| Too slow | Expected | "You were slower than planned, but the effort was right. Terrain or conditions may have played a role." |

For T1D users, BG context is added: "Your BG dropped from 8.2 to 5.8 during the run. At this fuel rate, consider an extra 10g carbs before your next long run."

### 9.3 What the Analysis Shows

**Per-run analysis (in order):**
1. **Summary card** — distance, time, avg pace, avg HR, elevation, calories
2. **Workout insight** (AI) — reconciled message (pace + HR + BG if applicable)
3. **Pace splits** — km splits with +/- delta, color-coded
4. **Pace chart** — pace over distance with prescribed target/ceiling overlaid
5. **HR chart** — HR over distance
6. **HR zones** — time-in-zone bars (5 zones)
7. **BG chart** (if sugar mode) — glucose over time, aligned with run
8. **BG feedback** (if sugar mode) — fuel rate assessment, recommendations

---

## 10. Pace Auto-Update System

### 10.1 What Updates

The user's **current ability** (their estimated race time). When this changes, all training paces cascade — the plan structure stays the same, only pace targets change.

### 10.2 What Triggers Updates

**Only speed sessions:** intervals, tempo runs, time trials. Easy runs and long runs do NOT contribute to pace updates.

**Why:**
- Easy runs are intentionally effort-based (conversational). Pace there reflects feel, not fitness.
- Speed sessions are where you actually try to hit pace targets — they reveal true current ability.
- Coaching science confirms: threshold/tempo efforts (20-60 min sustained) are the most reliable indicator of aerobic fitness. Intervals are noisier due to recovery quality and psychological factors.
- HR-based fitness estimation is unreliable for all runners (lag, cardiac drift, day-to-day variability from sleep, heat, caffeine, hydration). For T1D runners, BG adds further noise to HR. Pace from speed sessions avoids this confounding entirely.

### 10.3 Minimum Data Required

**3 completed speed workouts** before the first recommendation (Runna's approach). One good day is noise. Three consistent sessions is a pattern.

### 10.4 Status States

| Status | Meaning | Action |
|--------|---------|--------|
| **Monitoring** | Not enough data yet (< 3 speed sessions) | "Keep running, we're learning your paces" |
| **Pace on Point** | Performance matches current ability | "Your training paces are well calibrated" |
| **Ahead of Plan** | Consistently faster than prescribed | Suggest increasing current ability → faster paces |
| **Let's Review** | Consistently slower than prescribed | Suggest decreasing current ability → slower paces |
| **Variable** | Inconsistent results | "Focus on hitting targets consistently" |

### 10.5 User Control

- Recommendations are **suggestions**, not automatic changes
- User accepts or rejects each recommendation
- User can manually adjust current ability in settings at any time
- "We can't account for weather, terrain, poor sleep, or blood sugar. You're in control."

### 10.6 What Changes

When current ability updates:
- All training pace targets recalculate (easy ceiling, tempo range, interval range)
- Pace zone boundaries recalculate
- Plan structure stays the same (distances, days, workout types)
- Threshold pace pushed to Intervals.icu updates
- "Easy runs should always feel comfortable and conversational, regardless of pace changes"

### 10.7 Easy Run Signals (Not Updates)

Easy runs don't trigger pace updates, but they DO generate signals:
- If HR is consistently in Z3-Z4 at the prescribed easy ceiling → flag: "Your easy runs feel harder than expected. Consider slowing down."
- If HR is consistently low Z1 at the prescribed ceiling → flag: "Your easy pace has room to increase. This might update after your next speed session."
- These are feedback messages, not pace change triggers.

### 10.8 Depreciation

Older data contributes less over time. A speed session from 8 weeks ago is less relevant than one from last week. Workouts older than ~90 days phase out completely (Stryd/COROS approach). This means current ability can decrease if you don't maintain training — which is physiologically correct.

---

## 11. BG Layer (Springa's Differentiator)

### 11.1 What Runna Doesn't Have

Runna (and every other running app) treats all runners the same physiologically. Springa's unique value is the T1D layer:

- **Pre-run readiness:** BG level + trend + IOB → "Safe to run?" / "Eat 15g first"
- **Fuel rate per workout category:** Steady-state running tends to drop BG more than intervals (T1DEXI population means: -18 vs -14 mg/dL, but within-individual variability is large: SD 32-39 mg/dL). The BG model learns per-category fuel rates from this user's actual data, treating the population trend as a directional prior.
- **Post-run BG analysis:** "Your BG dropped 2.5 mmol/L. At current fuel rate, consider adding 10g/h."
- **Spike penalty:** If post-run data shows BG spikes after runs at a given fuel rate, the model reduces the target.
- **BG-aware workout insight:** The post-run AI commentary includes BG context alongside pace and HR.

### 11.2 How BG Interacts With Zones

The BG model uses **workout category** (easy/long = steady state, intervals = intermittent) and **raw HR data** for metabolic load estimation. It does NOT use HR zones or pace zones.

This is correct because:
- Steady-state vs intermittent exercise is the primary driver of BG response (T1DEXI)
- Prandial state (when you last ate) matters more than exercise intensity for BG prediction
- HR correlates with metabolic load better than pace (running uphill at 8:00/km can burn as much glycogen as flat at 6:00/km)
- Zone classification adds no useful information over raw HR + category

### 11.3 T1D-Specific Pace Considerations

BG affects performance. A runner in hypo range will be slower. A runner with high BG may have elevated HR independent of effort. These are general observations — the magnitude varies per individual.

The pace auto-update system accounts for this by:
- Only updating from speed sessions (pace-based, avoiding the HR confounding that affects all runners and is amplified by BG variability in T1D)
- Requiring multiple confirming sessions (bad BG days wash out)
- Giving the user control to reject recommendations ("I was low during that session")

Future enhancement: BG-gated pace updates — only consider speed sessions where BG stayed in 5-10 mmol/L range throughout.

---

## 12. Intervals.icu Integration

### 12.1 What We Push

> **Breaking change:** `threshold_pace` pushed to Intervals.icu changes from goal race pace (previously 8:45/km for EcoTrail) to flat-road ability pace derived from current ability (~5:30/km). This is the fix for Problem 1 — training paces were wrong because the anchor was wrong. All `% pace` targets in workout descriptions resolve against this new value.

| Data | API | When |
|------|-----|------|
| Threshold pace (m/s) | `PUT /sport-settings/{id}` | When current ability changes |
| HR zones (5-zone array) | `PUT /sport-settings/{id}` | When zones are computed/edited |
| Resting HR | `PUT /athlete/0` | When obtained from watch data |
| Workouts with pace targets | Events API | When plan is generated/updated |

### 12.2 What We Read

| Data | API | When |
|------|-----|------|
| Max HR | `GET /athlete/0` → sportSettings | Onboarding, periodic |
| Resting HR | `GET /athlete/0` → icu_resting_hr | If available |
| HR zones (existing) | sportSettings.hr_zones | Onboarding (accept or replace) |
| Activity streams (HR, pace) | Activity streams API | Post-run analysis |
| Recent activities | Activities API | Auto-detect current ability |

### 12.3 Fresh Account Handling

A fresh Intervals.icu account provides:
- `max_hr`: 189 (auto-estimated)
- `lthr`: 171 (auto-estimated as ~90.5% of max HR)
- `hr_zones`: 7-zone array (LTHR-based)
- `threshold_pace`: null
- `icu_resting_hr`: null

**Current bug:** Our code checks `hr_zones.length === 5` and silently discards 7-zone arrays. This needs to be fixed: either accept 7 zones and collapse to 5, or compute our own 5 from max_hr and push them.

**Target behavior:** Compute our 5-zone HR boundaries from max_hr. Push to Intervals.icu (replacing their 7). Compute threshold_pace from current ability. Push to Intervals.icu.

---

## 13. Wizard Changes

### 13.1 Current Flow

1. Goal (distance + date)
2. Experience level
3. Goal time (slider)
4. Connect Intervals.icu
5. HR Zones (asks for resting HR)
6. (more steps...)

### 13.2 Proposed Flow

1. Goal race (distance + date, or "just get fitter")
2. Experience level (beginner / intermediate / advanced — with descriptions like Runna)
3. **Current ability** (slider defaults from experience level; user adjusts; presented as "About how fast can you run [distance] right now?")
4. **Race goal** (set a time / set a pace / "just finish")
5. Connect Intervals.icu (pulls max HR, recent data, refines current ability if possible)
6. Schedule (run days, long run day)
7. T1D setup (sugar mode toggle, NS connection — existing flow)

**What's removed:** HR Zones step (zones are computed automatically from max HR, no user input needed). Resting HR question (dropped entirely).

**What's added:** Current ability step (separate from goal time). Race goal options (time / pace / just finish).

### 13.3 Post-Wizard

Redirect to calendar. User sees their plan immediately with pace targets derived from current ability. HR zones are computed in the background and pushed to Intervals.icu.

---

## 14. What We Drop

| Current Feature | Replacement |
|----------------|-------------|
| Karvonen HR zones | % of max HR zones (wider, no RHR needed) |
| HRZonesStep in wizard (RHR question) | Auto-computed from max HR |
| `computeKarvonenZones()` | New zone computation from max HR |
| Goal time as pace anchor | Current ability as pace anchor |
| Pace ranges for easy runs | Pace ceiling for easy runs |
| `hr_zones.length === 5` check | Accept any length, compute our own |

---

## 15. Open Questions

### 15.1 Exact Pace Ratios

The Ben Parkes ratios in `computeZonePacePct()` were designed relative to goal pace. They need to be re-derived relative to current ability. The ratios themselves may be similar, but the anchor point changes.

### 15.2 Exact HR Zone Percentages

**Resolved:** 65/81/89/97% of max HR (Runna's model). Produces ~30 bpm Z2 width, starts at 65% where running begins, validated against real user data. Both %maxHR and Karvonen produce identical error magnitudes (PMC, n=165), so the simpler model wins. Editable zones as escape hatch for users who know better.

### 15.3 Pace Zone Count

**Resolved:** 5 pace zones, matching the 5 HR zones. The 6th zone (Anaerobic/sprint) is rarely relevant for recreational 5K-marathon runners. 5-to-5 mapping keeps post-run reconciliation simple (pace Z3 = HR Z3 = "Tempo").

### 15.4 Pace Zone Boundaries as Percentages

The exact % of anchor pace for each pace zone boundary. Need to be contiguous and align with the prescription effort levels.

### 15.5 Trail Race Handling

**Resolved:** Keep it simple for v1. Current ability is flat-road fitness → training paces. Goal time is trail race pace → race-pace sandwich sections in long runs. The architecture already handles this: Section 6.2 says Steady/Race Pace comes "from goal time (if set) or current ability." The user sets their trail goal time directly. No algorithmic trail-pace conversion needed.

### 15.6 Club Run Integration

**Resolved:** Club runs count as speed sessions for the pace auto-update system when the user has told us the club covers speed work. The planner already tracks this via `clubType`:

- `clubType === "speed"` → counts as a speed session for auto-update. The club run IS the planned quality session — Springa already skips its own speed session that week.
- `clubType === "varies"` → also counts. The auto-update requires 3 sessions + consistency checks, so one easy club night among hard ones won't skew recommendations. Excluding "varies" would create a blind spot when half the user's quality sessions are club runs.
- `clubType === "long"` → excluded from pace updates. Same exclusion as any other long/easy run.

### 15.7 Easy Ceiling Implementation for Garmin

**Resolved:** Use a low floor with the ceiling as the upper bound: `30-88% pace`. The 30% floor allows walking without triggering pace alerts. The watch only buzzes when you exceed the ceiling. Tested and confirmed working on Garmin via Intervals.icu.

### 15.8 Sex Differences in Zone Boundaries

A PMC study found LT1 occurs at ~4-5% higher %maxHR in females (83.6% vs 78.9%). Neither Runna nor Strava account for this. This is a known source of systematic error for approximately half of users. Not blocking for v1, but worth investigating for a future refinement.

### 15.9 Cold-Start Anchoring Bias

When a beginner picks "beginner" and sees a default slider value (e.g., 7:00/km for 5K), they may anchor to it without adjusting — even if their actual ability is different. Runna mitigates this by separating ability level (which controls plan volume/structure) from estimated race time (which controls pace). Our spec merges them: experience level sets a default, user adjusts. This works but could create anchoring. Consider whether the slider needs more guidance (e.g., "Most beginners run 5K between 35-45 minutes") or whether we should separate the two inputs like Runna does.

### 15.10 Zone Misclassification Rate

Fixed %maxHR zones are wrong for ~40-50% of users at conventional thresholds (Davis meta-analysis, n=412). This is inherent to any %maxHR system — no fixed formula avoids it without lab testing. Our mitigations: editable zones + pace auto-updates that gradually calibrate the system from real performance data. This is the same trade-off Runna and Strava make. It should be acknowledged honestly in any user-facing "about zones" documentation.

---

## 16. Research Sources

### T1D Exercise Science
- [T1DEXI Study — Acute Glycemic Effects of Exercise Types in T1D](https://pmc.ncbi.nlm.nih.gov/articles/PMC10090894/) (Riddell et al., Diabetes Care 2023, n=497)
- [Vigorous Intervals and Hypoglycemia in T1D](https://www.nature.com/articles/s41598-018-34342-6)
- [Exercise Timing and BG Response in T1D](https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2022.1021800/full)
- [ADA Position Statement: Physical Activity and Diabetes](https://diabetesjournals.org/care/article/39/11/2065/37249/)
- [Competitive Athlete with T1D — Diabetologia](https://link.springer.com/article/10.1007/s00125-020-05183-8)

### HR Zone Science
- [LT1, LT2 and the Scientific Basis of HR Zones — Running Writings](https://runningwritings.com/2025/02/lt1-lt2-heart-rate-zone-science.html)
- [Individual Variation in HR at LT1/LT2 — Running Writings](https://runningwritings.com/2025/02/lt1-lt2-heart-rate-individual-variation.html)
- [Zone 2 Intensity: A Critical Comparison — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11986187/)
- [What Is Zone 2 Training? — IJSPP](https://journals.humankinetics.com/view/journals/ijspp/20/11/article-p1614.xml)
- [Accuracy of Fixed Intensity Anchors for Lactate Thresholds — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12354492/)

### Platform Research
- [Runna: Pace Insights & Recommendations](https://support.runna.com/en/articles/10854865-what-are-pace-insights-and-how-do-pace-recommendations-work)
- [Runna: Understanding Heart Rate](https://support.runna.com/en/articles/6359409-understanding-and-training-to-heart-rate)
- [Strava: Heart Rate Zones](https://support.strava.com/hc/en-us/articles/216917077-Heart-Rate-Zones)
- [COROS EvoLab: Personalized Pace Zones](https://coros.com/stories/coros-metrics/c/evolab-updated-pace-zones)
- [COROS: HR Zone Guide](https://coros.com/stories/coros-metrics/c/coros-heart-rate-zones-the-ultimate-guide)
- [Stryd: Auto-Calculated Critical Power](https://blog.stryd.com/2019/07/09/introducing-auto-calculated-critical-power/)
- [Stryd: CP Depreciation](https://blog.stryd.com/2019/08/22/auto-calculated-critical-power-depreciation/)
- [TrainingPeaks: Threshold Notifications](https://www.trainingpeaks.com/blog/are-you-using-threshold-improvement-notifications/)
- [Garmin: Q1 2026 Feature Update](https://the5krunner.com/2026/02/24/garmin-q1-2026-feature-update/)
- [Joe Friel: Quick Guide to Setting Zones](https://joefrieltraining.com/a-quick-guide-to-setting-zones/)

### Coaching Methodology
- Ben Parkes: Half Marathon Level 1 Training Plan (PDF, reviewed in full)
- [80/20 Running Plans — TrainingPeaks](https://www.trainingpeaks.com/training-plans/running/marathon/tp-107696/)
- [Polarized Training — Fast Talk Labs](https://www.fasttalklabs.com/pathways/polarized-training/)
- [Norwegian Method Applied — Marius Bakken (2026)](https://www.mariusbakken.com/the-norwegian-model.html)
- [Jack Daniels VDOT Calculator](https://sport-calculator.com/calculators/running/jack-daniels-running-calculator)
- [Cardiac Drift Guide — Uphill Athlete](https://uphillathlete.com/aerobic-training/heart-rate-drift/)
