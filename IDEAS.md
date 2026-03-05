# Feature Ideas

## Next

### Readiness-Adaptive Training

Fetch daily wellness data from Intervals.icu (HRV rMSSD, resting HR, sleep score, readiness, SpO2) and use it to modulate training intensity. Intervals.icu syncs this from Garmin Connect automatically — the data is already there.

**Core logic:**

- Compute rolling baselines (7-day and 28-day) for HRV and resting HR.
- Flag "suppressed" days: HRV > 1 SD below baseline, or resting HR > 5 bpm above baseline.
- When suppressed: suggest swapping the day's planned workout to easy. If already easy, suggest shorter duration.
- Combine with existing TSB-based swap logic in `adaptPlan.ts` — wellness data adds a second signal alongside training load.
- A T1D runner with suppressed HRV is at higher hypo risk even with perfect start BG — this is the missing dimension in the pre-run overlay.

**UI:**

- Readiness indicator on the pre-run overlay (currently uses BG only — add wellness dimension).
- Weekly wellness trend in Intel tab: HRV + resting HR sparklines with baseline bands.
- Coach AI receives wellness context for richer advice.

**API:** `GET /api/v1/athlete/0/wellness?oldest=YYYY-MM-DD&newest=YYYY-MM-DD` — returns daily wellness records with `hrvRMSSD`, `restingHR`, `sleepScore`, `readiness`, `spO2`.

### BG Simulation Engine

Two-phase project: forward simulation for race rehearsal, then retrospective "what-if" analysis on completed runs.

**Phase 1 — Race Day Simulation.** Time-stepping glucose forecast for full race duration. Inputs: starting BG, entry slope (rising/stable/dropping), pace plan (segments with target zones), and fueling schedule (grams at each interval). Output: predicted glucose curve with confidence bands at each 5-min step.

The BG model has the building blocks — `bgByStartLevel` gives response by starting glucose, `bgByTime` gives decay over run duration, `targetFuelRates` gives the fuel->BG-rate relationship. Stitching these into a forward simulation is the missing piece.

**Use case:** Rehearse race-day strategies before the event. "If I start at 12 mmol, fuel 65g/h, and pace at Z3 for 90 min — where does my glucose end up?" Run multiple scenarios, compare curves, pick the safest strategy.

**Phase 2 — BG Twin (Shadow Runs).** After a run, re-simulate the glucose curve with different fuel timing/amounts. "What would have happened if you'd started fueling 10 minutes earlier?" or "What if you'd taken 15g instead of 10g at minute 20?"

Same simulation engine as Phase 1, pointed backward. Every completed run has glucose stream ground truth to validate against. The diff between simulated and actual shows where the strategy could improve. Turns every run into a learning opportunity.

Phase 2 is nearly free after Phase 1 — same engine, different inputs. Validate the simulator against completed runs (which is basically BG Twin) before trusting it for race-day planning.

**UI:** Interactive simulator in Intel or dedicated Race tab. Sliders for start BG, fuel rate, intensity. Live-updating predicted glucose curve. Save/compare scenarios. For BG Twin: overlay simulated vs actual on completed run detail.

### Post-Run Insulin Reconnect Advisor

The pump goes off before every run. When does it go back on? Reconnect too early with IOB still active and BG still dropping post-exercise — crash. Reconnect too late — BG rockets.

Available data: post-run BG trajectory (from stream data), insulin context (IOB at run start, expected decay via Fiasp curve in `insulinContext.ts`), MyLife Cloud data (pump state). Build a simple model: "based on your post-run BG trend and remaining IOB, reconnect in X minutes" or "reconnect now — BG is stable and rising."

This closes the loop on the pump-off protocol: pre-run prep -> during-run fueling -> **post-run reconnect**. The third phase is currently completely unmanaged.

**Implementation:** Extend `insulinContext.ts` to project IOB forward post-run. New `lib/postrun.ts` module. Push notification: "Run complete. BG 7.2->. Reconnect pump in ~15 min when BG stabilizes above 8."

**MyLife Cloud latency note:** ~2 hour sync delay (tested 2026-03-02) means real-time IOB from MyLife is unavailable post-run. The model must project forward from the last known pre-run IOB state. Since all runs are pump-off, the only insulin decaying is what was active at disconnect — this is fully computable from the pre-run insulin context without fresh MyLife data.

### Aerobic Fitness Trend

Single chart combining cardiac drift (aerobic decoupling) and efficiency factor over time. These measure the same underlying signal — pace:HR relationship — and belong together.

**Aerobic decoupling:** Split each easy/long run into first and second half. Compute pace:HR ratio for each half. Decoupling % = (ratio2 - ratio1) / ratio1 x 100. A decreasing trend indicates improving aerobic fitness. Flag runs where decoupling exceeds 5%.

**Efficiency factor:** EF = normalized pace / avg HR, plotted per week. Rising EF = getting fitter at the same effort.

**Data source:** Stream data (HR + pace) already fetched for completed runs. Computation is straightforward — no new API calls needed.

**UI:** Line chart in Intel tab. Two y-axes: decoupling % (lower is better) and EF (higher is better). Trend lines showing direction over 4-8 week windows.

### Workout-Specific BG Pacing

Fuel rate is currently constant per workout type. But BG doesn't drop linearly. The `bgByTime` data shows *when* during a run BG drops fastest. For long runs, the first 15 minutes might be stable (liver glycogen buffering), then the drop accelerates.

Instead of "10g every 10 minutes," generate a time-varying fuel schedule: "0g for first 10 min, then 12g every 10 min starting at minute 10, increase to 15g every 10 min after minute 30." Upload this to the workout description as timed fuel cues.

**Data source:** `bgByTime` already computes time-bucketed BG rates. The step from "analysis" to "prescription" is small.

**Prerequisite:** Enough observations per time bucket to see the non-linear pattern clearly. Likely needs 20+ runs with BG data per category.

### Confidence-Gated Automation

The BG model has confidence levels (`low`/`medium`/`high`). The adapt system applies fuel changes regardless of confidence. This should be inverted: at `low` confidence, present suggestions as questions ("try 48g/h?") rather than auto-applying. At `high` confidence, auto-apply silently.

Not a feature — a design principle that makes the existing system safer. A low-confidence auto-adjustment to fuel rate before a long run could cause a hypo. The system should be more cautious when it knows less.

**Implementation:** `adaptPlan.ts` fuel adjustment logic — gate auto-apply on `targetFuelRates[].confidence`. Low = suggest only (shown in adapt preview, not auto-synced). Medium = auto-apply with note. High = auto-apply silently.

### Cross-Run BG Pattern Surfacing — Remaining Phases

Phase 1 (discovery) and Phase 2a (AI consumers) are complete — see Completed section.

**Phase 2b: Rule-based consumers (harder, requires structured output).**

Pre-run readiness, report card scoring, and push notifications use fixed thresholds. Personalizing these from patterns requires parsing prose into structured findings (variable, direction, threshold, confidence, n). Bigger design change — revisit after phase 2a proves value.

**Phase 3: Statistical engine (80+ runs).** Proper multivariate analysis with p-values, effect sizes, and minimum sample guards. The variable enrichment from phase 1 carries over.

**MyLife Cloud latency:** Tested 2026-03-02. CamAPS FX -> MyLife Cloud sync has **~2 hour delay** (0.1U test bolus at 10:15, appeared in logbook at 12:05). Sync is batched, not streaming — events arrive in chunks. Insulin data (IOB, time since bolus) is usable for retrospective analysis but **not real-time enough for pre-run decisions**. Pre-run surfacing must rely on variables available in real-time: xDrip BG + trend, Intervals.icu wellness, training load, time of day.

---

## Parked

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

### Per-Segment BG Analysis (Cross-Run)

Aggregate glucose behavior per workout segment type across runs. The BG model currently operates at category level (easy/long/interval). This would add a segment-type dimension: "across 8 long runs, BG drops 2x faster during race pace blocks than easy blocks."

**Why not single-run or visual overlay:** CGM has ~5-10 min interstitial lag. A graph overlay misattributes glucose changes to wrong segments. For single-run analysis, the AI already has the glucose stream and workout description — it can reason about timing without pre-computed stats. The value is in cross-run aggregation where lag noise averages out.

**Prerequisite:** Enough mixed-segment runs to aggregate meaningfully. Long runs with race pace sandwich are the primary source. Needs ~10+ sandwich long runs per segment type before patterns are statistically useful.

**Implementation:** Extend `bgModel.ts` — store per-segment BG stats (drop rate, min, start/end) alongside existing `BGObservation[]`, aggregate by segment type across runs. Feed aggregated segment patterns to AI consumers alongside existing category-level BG model data.

**Parked:** Too few mixed-segment long runs to aggregate. Revisit when race pace sandwich long runs reach ~10+ completions.

---

## Rejected

### GAP for Trail Readiness

Grade-adjusted pace analysis using elevation data from completed runs. Compare GAP to flat-equivalent pace to assess trail-specific fitness. Elevation data (`total_elevation_gain`) is already fetched from Intervals.icu but unused.

**Rejected (2026-03-05):** EcoTrail 16km is moderate trail. Training doesn't include significant elevation. GAP analysis without elevation training data is academic. Revisit if training regularly includes >100m elevation runs.

### Rich Workout Context for Coach AI — Last 10%

The coach already receives category, distance, duration, pace, avgHR, maxHR, load, planned fuel rate, actual carbs, HR zone breakdown (Z1-Z5), BG start + rate, entry slope, recovery patterns, and user feedback per completed workout. That covers ~90% of useful context.

**Rejected (2026-03-05):** The remaining 10% (workout description for planned-vs-actual, cadence) adds 500-1000 tokens per prompt for marginal improvement. The report card already scores HR zone compliance, covering the primary use case. The trigger condition ("coach gives vague execution answers") has never been met.

### Analysis -> Adapt: Feed Prior Analysis Into Pre-Workout Notes

**Proposal:** Run analysis produces specific, actionable advice ("target start BG >=10.5 for intervals", "add 15-20g at run start if below 9"). Feed the 1-2 most recent same-category analysis texts into the adapt prompt so the pre-workout AI builds on prior conclusions instead of re-deriving from scratch.

**Why it was rejected (2026-02-27):**

After deep investigation of both prompt builders, the data each receives, and side-by-side comparison of actual outputs:

**1. The adapt AI already has the same raw data.** The adapt prompt receives recent same-category runs via `formatRunLine` (start/end BG, entry slopes, recovery nadirs, HR, paces, fuel rates), runner feedback (ratings + comments), BG model patterns, and recovery stats. The run analysis was derived FROM this data. Feeding the derivative alongside the source is redundant — the adapt AI can and does reach the same conclusions independently. Tested 2026-02-27: the adapt notes correctly referenced a BG crash, the pre-run swing, and set appropriate fuel rates without seeing any analysis text.

**2. Chaining AI outputs creates an authority problem.** The second AI treats the first AI's conclusions as ground truth. If the analysis made a subtly wrong recommendation, the adapt AI anchors on it instead of reasoning from data. Two AIs agreeing with each other is not the same as one AI reasoning correctly. The system prompt would say "don't contradict without new evidence" — but the adapt AI has no mechanism to evaluate whether the prior analysis was right.

**3. Staleness.** An analysis from 3 weeks ago carries advice that may no longer apply — the runner's fitness, BG patterns, and fueling have evolved. But the adapt AI is told to "build on these conclusions," so it defers to stale recommendations instead of reading the current data fresh.

**4. The actionable advice falls into two buckets, and neither benefits from chaining.** Workout parameters (fuel rate, pacing) are already adjusted by the rule-based system via the BG model. Runner behavior (start BG target, pre-run protocol) can't be controlled by the adapt note — it's a behavioral reminder that the runner already knows from reading the analysis.

**5. Token cost for diminishing returns.** ~2800 extra input tokens per adapt call (4 events x ~700 tokens) for advice the AI can derive from data it already has.

**6. What actually matters is the feedback, and it already flows.** A "bad" rating with "BG crashed hard, was trending down before the run" is ground truth. The adapt prompt already receives this via `feedbackByActivity`. That's what moves the needle — not a prior AI's interpretation of it.

**Better alternative:** If the adapt notes are ever missing cross-run pattern detection, the fix is a more explicit system prompt instruction ("look for patterns across the recent runs — recurring low start BG, consistent crashes, feedback trends"), not chained AI outputs. Cheaper, more robust, no staleness.

---

## Completed

### Cross-Run BG Pattern Surfacing

Phase 1: 34-column enriched run table, AI analysis via Claude Sonnet, cached in SQLite with staleness tracking. Displayed in `BGResponsePanel` on Intel screen.

Phase 2a: Pattern text fed into all three AI consumers — adapt notes, run analysis, and coach chat — via `getBGPatterns()` -> `patternsText` appended to prompts. Each consumer weaves relevant patterns into its output rather than listing them mechanically.

**Implementation:** `lib/bgPatterns.ts` (enrichment + prompt), `lib/bgPatternsDb.ts` (storage), `app/api/bg-patterns/route.ts` (endpoint), `BGResponsePanel.tsx` (display). AI integration: `lib/adaptPlanPrompt.ts`, `lib/runAnalysisPrompt.ts`, `app/api/chat/route.ts`.

### Ref Overhaul — Replace Refs With State-Driven Data Flow

Converted `completedRunsRef` and `cachedRef` from `useRef` to `useState` in `useBGModel.ts`. Fixed race condition where xDrip effect read stale ref values before activities loaded. Audited all hooks — remaining refs are legitimate (DOM refs, fire-once guards, abort flags).

**Implementation:** `app/hooks/useBGModel.ts`.

### Pre-Run Protocol Card

Structured pre-run overlay showing current BG with trend, readiness assessment (ready/heads-up/hold), 30-min BG forecast, and category-specific guidance (easy/long/interval). Derives pump action, fuel plan, and start-BG target from workout description + BG model. Three-level traffic-light readiness with specific reasons and recommendations.

**Implementation:** `PreRunOverlay.tsx`, `lib/prerun.ts` (assessReadiness, estimateBGAt30m).

### Weekly Volume Trend Chart

Bar chart across the entire plan duration — completed (green) vs planned (cyan) vs optional (purple), stacked per week. Makes periodization visible: build phases growing, recovery weeks dropping, taper shrinking. Reveals missed sessions and volume shortfalls at a glance.

**Implementation:** `WeeklyVolumeChart.tsx` (planner), `VolumeTrendChart.tsx` (intel — advanced version with current-week highlight).

### BG Response Model

Category-based BG response analysis across easy/long/interval runs. 5-min sliding windows across aligned HR + glucose streams, BG slope per window, aggregated per workout category. Includes: confidence levels, fuel adjustment suggestions, BG by start level (< 8 / 8-10 / 10-12 / 12+ mmol/L), BG by entry slope (rising/stable/dropping), BG by time decay, target fuel rate calculation (regression + extrapolation), scatter chart visualization.

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

Triggered manually from Planner tab or automatically after submitting post-run feedback ("Adapt upcoming ->"). Preview cards show diff before syncing to Intervals.icu.

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

**Minimum segment durations:** Z1-Z2: 3 min, Z3: 2 min, Z4: 1 min. Z5 is always extrapolated — never measured directly. Short Z5 bursts (30s-2min) are polluted by acceleration/deceleration ramps and HR lag, producing noisier data than a simple projection. Fit a line through Z1-Z4 calibrated paces and project Z5 from the curve.

Currently the pace table is hardcoded in `lib/constants.ts` (`FALLBACK_PACE_TABLE`). Generated workouts reference these static paces. With calibration, workout descriptions would use actual recent paces instead. Zones with insufficient data fall back to the hardcoded table until enough samples accumulate.

**Data source:** HR + pace streams from completed activities. Zone boundaries from LTHR-based calculation (already implemented).

**UI:** Pace table card in Intel tab showing current calibrated paces vs fallback. Trend arrows showing improvement/regression per zone.

### AI Data Audit

Mapped all data flowing into the three AI consumers (adapt-plan, run-analysis, coach) via a 34-row x 3-column matrix. Identified 5 gaps ranked by worst-advice risk. Fixed the 3 high-impact gaps: added pace/HR zones to adapt, fitness context to run analysis, BG model summary to run analysis. Remaining 2 (coach insulin context, coach report card trends) assessed as low-impact and deferred — coach already handles those use cases adequately through other data paths.

**Source files:** `lib/adaptPlanPrompt.ts`, `lib/runAnalysisPrompt.ts`, `lib/coachContext.ts`, `app/api/chat/route.ts`.

### Customizable Intel Dashboard

Widget-based Intel tab with reorderable, hideable panels. Widget registry declares key, label, default order, and component. Layout persisted in user settings DB (`widget_order`, `hidden_widgets`). Edit mode with up/down/eye buttons. Reset to default.

**Implementation:** `lib/widgetRegistry.ts` (registry + `moveWidget`/`toggleWidget`), `IntelScreen.tsx` (edit mode UI), `lib/settings.ts` (persistence). 6 widget types: phase-tracker, fitness-insights, fitness-chart, volume-trend, pace-zones, bg-response.

### Auto-Sync HR Metrics from Intervals.icu

Auto-syncs LTHR, max HR, and HR zone boundaries from `GET /api/v1/athlete/0` (Run sport settings). Triggered on settings load with 24h throttle. Only updates DB when values change. Falls back to cached values on API error.

**Implementation:** `lib/intervalsApi.ts` (`fetchAthleteProfile`), `app/api/settings/route.ts` (sync trigger), `lib/settings.ts` (`shouldSyncProfile`, `markProfileSynced`). DB columns: `lthr`, `max_hr`, `hr_zones`, `profile_synced_at`.
