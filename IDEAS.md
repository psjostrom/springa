# Feature Ideas

## Next

### Cross-Run BG Pattern Discovery

Surface hidden patterns in BG outcomes by correlating against every available variable across all completed runs. The per-category BG model answers "what does an average long run look like?" — this answers "what conditions make BG crash that I haven't noticed?"

**Phase 1: AI-driven discovery (now).** Build one enriched row per completed run with every available variable. Send the full table to Claude with a discovery prompt. No statistical engine — Claude reasons about correlations, flags sample sizes, and explains potential causation vs coincidence. Works with current data volume (~30 runs).

**Phase 2: Statistical engine (80+ runs).** Add proper multivariate analysis with p-values, effect sizes, and minimum sample guards. The variable enrichment from phase 1 carries over.

**Variables per run (the table):**

| Source | Variables |
|---|---|
| Activity (already have) | time of day, day of week, distance, duration, avg pace, avg HR, max HR, cadence, elevation gain, category |
| BG data (already have) | starting BG, entry slope, avg drop rate, min BG, hypo flag, BG score |
| Training context (already have) | days since last run, weekly km so far, CTL, ATL, TSB, training load |
| Fuel (already have) | planned fuel rate (g/h), actual carbs ingested |
| Wellness (one new API call) | HRV rMSSD, resting HR, sleep score, readiness, SpO2 |

~25 variables. ~30 rows. ~3-4K tokens for the full dataset.

**Wellness API:** `GET /api/v1/athlete/0/wellness?oldest=YYYY-MM-DD&newest=YYYY-MM-DD` — returns daily records. One call covers the full training history. Match each run to its day's wellness data by date.

**UI:** Button in Intel tab — "Discover BG patterns." Fetches wellness data, enriches run data, formats table, sends to Claude, renders the response as a discovery report.

**Prompt design:** Ask Claude to find patterns in BG outcomes (drop rate, min BG, hypo) that correlate with any variable or combination of variables. Require minimum 5 observations per bucket. Flag interactions ("high fatigue AND low start BG together are worse than either alone"). Caveat small samples.

**Example discoveries:**

- "Morning runs (before 11:00) average -1.8/10min drop vs afternoon at -0.9/10min. 8 morning, 12 afternoon runs."
- "Runs with sleep score < 70 had hypo events in 3/5 cases vs 1/15 when sleep > 70."
- "TSB below -15 combined with starting BG under 9 produced the 3 worst BG outcomes. Either factor alone was manageable."

### Ref Overhaul — Replace Refs With State-Driven Data Flow

Multiple hooks use `useRef` to pass data between effects as a side-channel to avoid re-renders. This breaks React's dependency tracking — effects that read refs don't re-run when the ref changes, creating race conditions that are harder to diagnose than the re-renders they prevent.

**Known bug:** `useBGModel.ts` stores `completedRunsRef` as a ref. The xDrip effect (line 150) depends on `[xdripReadings]` but reads `completedRunsRef.current`. If xDrip data arrives before activities finish loading, the effect short-circuits and never retries until the next xDrip poll (60s later). This causes `runBGContexts` to be empty when the user clicks "Discover Patterns" shortly after page load.

**Fix:** Audit all `useRef` usage across hooks. Replace refs that carry data between effects with `useState` so React's dependency system handles re-runs automatically. Keep refs only for values that genuinely shouldn't trigger re-renders (DOM refs, "has already loaded" guards, abort flags).

**Scope:** `useBGModel.ts` (`cachedRef`, `completedRunsRef`), and any other hooks using the same pattern. Full audit needed.

### AI Data Audit

Three AI consumers (adapt-plan, coach, run-analysis) each build their own context from overlapping but inconsistent data sources. Nobody has a clear map of what each consumer receives, what it's missing, and where the gaps create bad advice. The "BG crashed → trim fuel" incident happened because the adapt prompt had feedback but lacked cross-category visibility. The coach gave a BG-only response because it had no HR zones, no workout structure, no planned-vs-actual comparison.

**Deliverable:** A matrix — rows are data dimensions (HR zones, workout structure, feedback, BG streams, recovery patterns, fitness load, pace splits, planned fuel, etc.), columns are AI consumers (adapt-plan, coach, run-analysis). Each cell: present / absent / partial. Then prioritize filling the gaps that cause the worst advice.

### Readiness-Adaptive Training

Fetch daily wellness data from Intervals.icu (HRV rMSSD, resting HR, sleep score, readiness, SpO2) and use it to modulate training intensity. Intervals.icu syncs this from Garmin Connect automatically — the data is already there.

**Core logic:**

- Compute rolling baselines (7-day and 28-day) for HRV and resting HR.
- Flag "suppressed" days: HRV > 1 SD below baseline, or resting HR > 5 bpm above baseline.
- When suppressed: suggest swapping the day's planned workout to easy. If already easy, suggest shorter duration.
- Combine with existing TSB-based swap logic in `adaptPlan.ts` — wellness data adds a second signal alongside training load.

**UI:**

- Readiness indicator on the pre-run overlay (currently uses BG only — add wellness dimension).
- Weekly wellness trend in Intel tab: HRV + resting HR sparklines with baseline bands.
- Coach AI receives wellness context for richer advice.

**API:** `GET /api/v1/athlete/0/wellness?oldest=YYYY-MM-DD&newest=YYYY-MM-DD` — returns daily wellness records with `hrvRMSSD`, `restingHR`, `sleepScore`, `readiness`, `spO2`.

### BG Model Recency Weighting

The BG model treats all observations equally — a crash 3 months ago weighs the same as a crash yesterday. At small sample sizes (~15-20 runs per category) this is fine. As history grows, old data drowns out recent reality: the model's cross-run average won't react to a recent crash because it's diluted by months of "fine" runs.

**Fix:** Exponential decay on observation weights in `calculateTargetFuelRates`. Recent runs weigh more than older runs. Affects regression, extrapolation, and category averages. All consumers of `targetFuelRates` benefit (adapt, coach, Intel) without bolt-on guardrails.

**Design decisions (settled):**

- **Same-category only.** A crash on a long run doesn't change easy run targets.
- **Bidirectional.** Recent improvement also surfaces faster — not just bad outcomes.
- **No new data dependency.** Just weights existing observations by age. No report card lookup needed.

**Open questions:**

- **Decay half-life.** 2 weeks overreacts to one bad run. 4 weeks is a reasonable starting point (one training cycle). 8 weeks is too slow. Needs calibration.
- **Small-sample guard.** With 5 observations, recency weighting amplifies outliers. Consider minimum sample size before applying decay (e.g., equal weighting until 10+ observations, then decay kicks in).
- **Weighted regression.** `linearRegression` in `bgModel.ts` needs weighted variant. Weighted averages per fuel-rate group, then weighted least squares.

**Parked (2026-02-27):** Premature at current scale. Equal weighting works when each category has ~15-20 observations. Revisit when any category exceeds ~40 observations — likely around week 8-10 of the plan (April 2026), well before the June 13 race. At that point old data from early training will be stale relative to the runner's evolved BG response and fitness.

### Aerobic Fitness Trend

Single chart combining cardiac drift (aerobic decoupling) and efficiency factor over time. These measure the same underlying signal — pace:HR relationship — and belong together.

**Aerobic decoupling:** Split each easy/long run into first and second half. Compute pace:HR ratio for each half. Decoupling % = (ratio₂ - ratio₁) / ratio₁ × 100. A decreasing trend indicates improving aerobic fitness. Flag runs where decoupling exceeds 5%.

**Efficiency factor:** EF = normalized pace / avg HR, plotted per week. Rising EF = getting fitter at the same effort.

**Data source:** Stream data (HR + pace) already fetched for completed runs. Computation is straightforward — no new API calls needed.

**UI:** Line chart in Intel tab. Two y-axes: decoupling % (lower is better) and EF (higher is better). Trend lines showing direction over 4–8 week windows.

### Segment-Aligned Glucose Overlay

Overlay the glucose trace on the workout structure timeline so you can see exactly where BG drops relative to what you were doing. Currently glucose and workout structure are shown as separate concerns.

**Implementation approach:**

- Parse workout segments from description (warmup/main set intervals/cooldown) — `parseWorkoutStructure` already exists.
- Align segment boundaries to the activity timeline using duration.
- Render glucose line on top of segment-colored background bands in the stream chart.
- Highlight BG drop rate per segment: "BG dropped 2.1 mmol during the 4×8min block."

**Data source:** All data already fetched — glucose stream, HR stream, workout description. Just needs chart integration.

---

## Future

### Race Day BG Simulation

Time-stepping glucose forecast for full race duration. Inputs: starting BG, entry slope (rising/stable/dropping), pace plan (segments with target zones), and fueling schedule (grams at each interval). Output: predicted glucose curve with confidence bands at each 5-min step.

The BG model has the building blocks — `bgByStartLevel` gives response by starting glucose, `bgByTime` gives decay over run duration, `targetFuelRates` gives the fuel→BG-rate relationship. Stitching these into a forward simulation is the missing piece.

**Use case:** Rehearse race-day strategies before the event. "If I start at 12 mmol, fuel 65g/h, and pace at Z3 for 90 min — where does my glucose end up?" Run multiple scenarios, compare curves, pick the safest strategy. Reduces race-day BG surprises from "unknown" to "modeled risk."

**UI:** Interactive simulator in Intel or dedicated Race tab. Sliders for start BG, fuel rate, intensity. Live-updating predicted glucose curve. Save/compare scenarios.

### GAP for Trail Readiness

Grade-adjusted pace analysis using elevation data from completed runs. Compare GAP to flat-equivalent pace to assess trail-specific fitness. Elevation data (`total_elevation_gain`) is already fetched from Intervals.icu but unused.

**Relevance:** Only matters if training includes significant elevation. Deprioritized until trail-specific training blocks appear in the plan.

---

## Maybe

### Rich Workout Context for Coach AI — Last 10%

The coach already receives category, distance, duration, pace, avgHR, maxHR, load, planned fuel rate, actual carbs, HR zone breakdown (Z1–Z5), BG start + rate, entry slope, recovery patterns, and user feedback per completed workout. That covers ~90% of useful context.

**What's still missing:**

- **Workout description** — the prescribed structure (warmup → 4×5min at tempo → cooldown). Enables planned-vs-actual comparison ("you were supposed to do 4×5min but Z4 time says you held 3 reps"). But the report card already scores HR zone compliance, so the coach mostly duplicates that unless asked a specific execution question. ~50–100 tokens per workout × 10 = 500–1000 extra tokens per prompt.
- **Cadence** — marginal. Only relevant if specifically asking about form/fatigue breakdown.

**Trigger to revisit:** If the coach gives vague answers to "how did I execute that session?" questions, add `description` to `RunLineOptions` in `lib/runLine.ts`. Until then, the token cost isn't justified.

**Implementation:** `lib/coachContext.ts` (`summarizeCompletedWorkouts`), `lib/runLine.ts` (`formatRunLine` + `RunLineOptions`).

---

## Rejected

### Analysis → Adapt: Feed Prior Analysis Into Pre-Workout Notes

**Proposal:** Run analysis produces specific, actionable advice ("target start BG ≥10.5 for intervals", "add 15-20g at run start if below 9"). Feed the 1-2 most recent same-category analysis texts into the adapt prompt so the pre-workout AI builds on prior conclusions instead of re-deriving from scratch.

**Why it was rejected (2026-02-27):**

After deep investigation of both prompt builders, the data each receives, and side-by-side comparison of actual outputs:

**1. The adapt AI already has the same raw data.** The adapt prompt receives recent same-category runs via `formatRunLine` (start/end BG, entry slopes, recovery nadirs, HR, paces, fuel rates), runner feedback (ratings + comments), BG model patterns, and recovery stats. The run analysis was derived FROM this data. Feeding the derivative alongside the source is redundant — the adapt AI can and does reach the same conclusions independently. Tested 2026-02-27: the adapt notes correctly referenced a BG crash, the pre-run swing, and set appropriate fuel rates without seeing any analysis text.

**2. Chaining AI outputs creates an authority problem.** The second AI treats the first AI's conclusions as ground truth. If the analysis made a subtly wrong recommendation, the adapt AI anchors on it instead of reasoning from data. Two AIs agreeing with each other is not the same as one AI reasoning correctly. The system prompt would say "don't contradict without new evidence" — but the adapt AI has no mechanism to evaluate whether the prior analysis was right.

**3. Staleness.** An analysis from 3 weeks ago carries advice that may no longer apply — the runner's fitness, BG patterns, and fueling have evolved. But the adapt AI is told to "build on these conclusions," so it defers to stale recommendations instead of reading the current data fresh.

**4. The actionable advice falls into two buckets, and neither benefits from chaining.** Workout parameters (fuel rate, pacing) are already adjusted by the rule-based system via the BG model. Runner behavior (start BG target, pre-run protocol) can't be controlled by the adapt note — it's a behavioral reminder that the runner already knows from reading the analysis.

**5. Token cost for diminishing returns.** ~2800 extra input tokens per adapt call (4 events × ~700 tokens) for advice the AI can derive from data it already has.

**6. What actually matters is the feedback, and it already flows.** A "bad" rating with "BG crashed hard, was trending down before the run" is ground truth. The adapt prompt already receives this via `feedbackByActivity`. That's what moves the needle — not a prior AI's interpretation of it.

**Better alternative:** If the adapt notes are ever missing cross-run pattern detection, the fix is a more explicit system prompt instruction ("look for patterns across the recent runs — recurring low start BG, consistent crashes, feedback trends"), not chained AI outputs. Cheaper, more robust, no staleness.

---

## Completed

### Pre-Run Protocol Card

Structured pre-run overlay showing current BG with trend, readiness assessment (ready/heads-up/hold), 30-min BG forecast, and category-specific guidance (easy/long/interval). Derives pump action, fuel plan, and start-BG target from workout description + BG model. Three-level traffic-light readiness with specific reasons and recommendations.

**Implementation:** `PreRunOverlay.tsx`, `lib/prerun.ts` (assessReadiness, estimateBGAt30m).

### Weekly Volume Trend Chart

Bar chart across the entire plan duration — completed (green) vs planned (cyan) vs optional (purple), stacked per week. Makes periodization visible: build phases growing, recovery weeks dropping, taper shrinking. Reveals missed sessions and volume shortfalls at a glance.

**Implementation:** `WeeklyVolumeChart.tsx` (planner), `VolumeTrendChart.tsx` (intel — advanced version with current-week highlight).

### BG Response Model

Category-based BG response analysis across easy/long/interval runs. 5-min sliding windows across aligned HR + glucose streams, BG slope per window, aggregated per workout category. Includes: confidence levels, fuel adjustment suggestions, BG by start level (< 8 / 8–10 / 10–12 / 12+ mmol/L), BG by entry slope (rising/stable/dropping), BG by time decay, target fuel rate calculation (regression + extrapolation), scatter chart visualization.

**Implementation:** `lib/bgModel.ts` (400+ lines, 85 unit tests).

**Refinement — per-zone HR analysis:** Classify each window by HR zone (Z2/Z3/Z4) instead of workout category. Gives intensity-level insight ("in Z3 BG drops X mmol/10min") rather than category-level ("long runs drop Y"). Infrastructure ready — HR stream aligned, sliding windows computing slopes — just swap the classification key. Revisit after 20+ runs with BG data and several mixed-intensity runs. Until then, per-zone splits have too few samples per zone.

### Auto-Suggest Fuel Rates

Target fuel rates computed from BG model regression/extrapolation. Auto-applied as defaults when generating plans. Shown as informational targets in Intel tab with confidence indicators and current-vs-target comparison.

**Implementation:** `bgModel.ts` (targetFuelRates), `PlannerScreen.tsx` (fuelDefault), `BGResponsePanel.tsx` (display).

### Live CGM via xDrip

xDrip+ pushes glucose data via Nightscout protocol (`/api/v1/entries`). Readings persisted indefinitely for post-run analysis. Direction recomputed from adjacent sgv values — fixes xDrip+ companion mode's 31% stale-direction error rate. Current BG pill in header with trend arrow + slope. Readings fed to Coach AI and pre-run overlay.

**Implementation:** `lib/xdrip.ts`, `app/api/v1/entries/route.ts`, `CurrentBGPill.tsx`, `BGGraphPopover.tsx`.

### Post-Run Report Card

5-axis scoring strip in EventModal for each completed run: BG stability (drop rate + hypo detection), HR zone compliance (% time in target zone by category), fuel adherence (actual vs planned carbs from Intervals.icu `carbs_ingested`), entry trend (pre-run slope classification), recovery (post-run BG drop + nadir). Color-coded green/yellow/red dots. Skeleton shimmer while stream data loads.

**Implementation:** `lib/reportCard.ts`, `RunReportCard.tsx`, 54 unit tests.

**Refinements:**

- **Trend across runs:** Track report card scores over time to show improvement patterns (e.g., "BG management improving over last 5 long runs").
- **Per-zone HR scoring for intervals:** Currently scores intervals against Z4 total, but mixed sessions (warmup Z2 + reps Z4 + recovery Z1) dilute the percentage. Score only the work intervals against target zone.
- **BG scoring by workout phase:** Score BG stability per segment (warmup/main/cooldown) instead of whole-run average, to pinpoint where management breaks down.

### Adaptive Plan

Adapts the next 4 upcoming planned runs based on recent performance. Three adaptation mechanisms:

1. **Fuel adjustment** — pulls target fuel rates from BG model, adjusts planned fuel (capped at 1.5x current or 90 g/h).
2. **Workout swap** — replaces intervals with easy runs when fatigued (TSB < -20 or ramp rate > 8 bpm/week).
3. **AI coaching notes** — Claude generates 2-paragraph pre-workout notes referencing recent BG patterns, paces, HR, and run feedback. First-person "Coach" voice.

Triggered manually from Planner tab or automatically after submitting post-run feedback ("Adapt upcoming →"). Preview cards show diff before syncing to Intervals.icu.

**Implementation:** `lib/adaptPlan.ts` (rules), `lib/adaptPlanPrompt.ts` (prompt), `app/api/adapt-plan/route.ts` (endpoint with parallel Claude calls), `PlannerScreen.tsx` (UI + auto-adapt).

### Coach AI Chat

Context-aware AI chat with streaming responses. Passes rich context: plan events, BG model, fitness insights (CTL/ATL/TSB), current BG + trend, xDrip readings, per-run BG contexts. Suggested prompts for common questions. Integrated as a main tab.

**Implementation:** `CoachScreen.tsx`, `app/api/chat/route.ts`, `ChatMessage.tsx`, `ChatInput.tsx`, `useCoachData.ts`.

### Post-Run Feedback System

Push notification triggered when SugarRun completes a run. Deep-links to feedback page showing distance/time/HR summary. Emoji rating (good/bad) + optional comment. Persisted to database. Recent feedback fed into adaptive plan AI prompt so coaching notes reference how runs felt.

**Implementation:** `app/feedback/page.tsx`, `app/api/run-feedback/route.ts`, `app/api/run-completed/route.ts`, `lib/settings.ts` (getRecentFeedback).

### Push Notifications

Web Push API (VAPID) with database-persisted subscriptions. Two triggers:

1. **Post-run:** Fired when SugarRun reports a completed activity. Links to feedback page.
2. **Pre-run:** Daily cron at 09:00 UTC (10:00 CET). Checks today's planned workout, runs readiness assessment, sends notification with BG status and workout summary.

**Implementation:** `lib/push.ts`, `app/api/push/subscribe/route.ts`, `app/api/cron/prerun-push/route.ts`, `public/sw.js`.

### Settings Management

Full settings UI: Intervals.icu API key, Google AI API key, xDrip secret (auto-generation), Nightscout URL (copy button), race parameters (name/date/distance), plan parameters (prefix/weeks/start km/LTHR), push notification toggle. All persisted to database.

**Implementation:** `SettingsModal.tsx`, `app/api/settings/route.ts`, `lib/settings.ts`.

### Pace Zone Auto-Calibration

Build a full pace table from completed run data — not just easy zone. For each HR zone, collect segments where the runner held that zone for a minimum duration, compute median pace. Track how pace-per-zone changes over the training block.

**Minimum segment durations:** Z1–Z2: 3 min, Z3: 2 min, Z4: 1 min. Z5 is always extrapolated — never measured directly. Short Z5 bursts (30s–2min) are polluted by acceleration/deceleration ramps and HR lag, producing noisier data than a simple projection. Fit a line through Z1–Z4 calibrated paces and project Z5 from the curve.

Currently the pace table is hardcoded in `lib/constants.ts` (`FALLBACK_PACE_TABLE`). Generated workouts reference these static paces. With calibration, workout descriptions would use actual recent paces instead. Zones with insufficient data fall back to the hardcoded table until enough samples accumulate.

**Data source:** HR + pace streams from completed activities. Zone boundaries from LTHR-based calculation (already implemented).

**UI:** Pace table card in Intel tab showing current calibrated paces vs fallback. Trend arrows showing improvement/regression per zone.

### Customizable Intel Dashboard

Widget-based Intel tab with reorderable, hideable panels. Widget registry declares key, label, default order, and component. Layout persisted in user settings DB (`widget_order`, `hidden_widgets`). Edit mode with up/down/eye buttons. Reset to default.

**Implementation:** `lib/widgetRegistry.ts` (registry + `moveWidget`/`toggleWidget`), `IntelScreen.tsx` (edit mode UI), `lib/settings.ts` (persistence). 6 widget types: phase-tracker, fitness-insights, fitness-chart, volume-trend, pace-zones, bg-response.

### Auto-Sync HR Metrics from Intervals.icu

Auto-syncs LTHR, max HR, and HR zone boundaries from `GET /api/v1/athlete/0` (Run sport settings). Triggered on settings load with 24h throttle. Only updates DB when values change. Falls back to cached values on API error.

**Implementation:** `lib/intervalsApi.ts` (`fetchAthleteProfile`), `app/api/settings/route.ts` (sync trigger), `lib/settings.ts` (`shouldSyncProfile`, `markProfileSynced`). DB columns: `lthr`, `max_hr`, `hr_zones`, `profile_synced_at`.
