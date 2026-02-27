# Feature Ideas

## Next

### AI Data Audit

Three AI consumers (adapt-plan, coach, run-analysis) each build their own context from overlapping but inconsistent data sources. Nobody has a clear map of what each consumer receives, what it's missing, and where the gaps create bad advice. The "BG crashed → trim fuel" incident happened because the adapt prompt had feedback but lacked cross-category visibility. The coach gave a BG-only response because it had no HR zones, no workout structure, no planned-vs-actual comparison.

**Deliverable:** A matrix — rows are data dimensions (HR zones, workout structure, feedback, BG streams, recovery patterns, fitness load, pace splits, planned fuel, etc.), columns are AI consumers (adapt-plan, coach, run-analysis). Each cell: present / absent / partial. Then prioritize filling the gaps that cause the worst advice.

### Rich Workout Context for Coach AI

The coach summary line per completed workout is skeletal: date, name, distance, avg pace, avg HR, load, carbs. It drops most of what `CalendarEvent` actually carries: category, duration, HR zone breakdown, planned workout structure (description), planned fuel rate, cadence, max HR. The AI has no idea whether you nailed the intervals or drifted, how much time you spent in each zone, or what the workout was even supposed to be.

**What's missing and why it matters:**

- **HR zone breakdown (`hrZones`)** — "42min in Z2, 12min in Z4" tells a completely different story than "avg HR 144." For intervals, the AI can't assess execution quality without knowing time-in-zone per rep vs recovery.
- **Category** — the coach doesn't know if a run was easy/long/interval. It infers from the name, which is fragile.
- **Workout description** — the prescribed structure (warmup → 4×5min at tempo → cooldown). Without this, the AI can't compare planned vs actual.
- **Duration** — total time matters for fuel assessment and training load context.
- **Planned fuel rate** — planned vs actual carbs comparison requires knowing what was prescribed.
- **Cadence, max HR** — secondary but useful for form and effort ceiling analysis.

**Design considerations:**

- Token budget: HR zone breakdowns and descriptions add significant prompt length. For 10 completed workouts, this could add 2-3K tokens. May need to show full detail for the last 3-5 runs and compact summaries for older ones.
- The adapt prompt already gets richer per-run context (BG patterns, recovery, entry slopes). The coach should match or exceed that level of detail since the coach is the general-purpose AI consumer.

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

### Feedback-Aware Fuel Adaptation

`applyAdaptations` sets fuel rates purely from the BG model's statistical target — observed drop rates, historical fuel, regression/extrapolation. It has no concept of how the runner *felt*. A "bad" rating with "BG crashed, needed an extra gel" doesn't move the needle because the rule-based system never sees feedback.

This creates a disconnect: the runner reports a crash, triggers adapt, and watches fuel go *down* because the model's cross-run average says the category is fine. The AI narrates it, making it worse — it references the crash and then explains a decrease, which reads as tone-deaf even when the model is technically correct for that category.

**Problem:** Fuel adaptation is statistically-driven but experientially-blind. The BG model answers "what does the average run look like?" but not "what just happened and how should we react?" Recent feedback — especially negative feedback — should act as a short-term override or bias on the target fuel rate, not just context for the AI narrator.

**Design questions:**
- How much weight should a single "bad" run carry vs the model's N-run average?
- Should feedback bias decay over time (strong today, fading over 7 days)?
- Cross-category: a crash on a steady run might not mean easy runs need more fuel. But if the crash was BG-entry related (dropping before the run), it's relevant everywhere.
- Should the bias be directional only (bad = never decrease, good = allow decrease) or quantitative (bad + specific drop rate → bump by X g/h)?

### Aerobic Fitness Trend

Single chart combining cardiac drift (aerobic decoupling) and efficiency factor over time. These measure the same underlying signal — pace:HR relationship — and belong together.

**Aerobic decoupling:** Split each easy/long run into first and second half. Compute pace:HR ratio for each half. Decoupling % = (ratio₂ - ratio₁) / ratio₁ × 100. A decreasing trend indicates improving aerobic fitness. Flag runs where decoupling exceeds 5%.

**Efficiency factor:** EF = normalized pace / avg HR, plotted per week. Rising EF = getting fitter at the same effort.

**Data source:** Stream data (HR + pace) already fetched for completed runs. Computation is straightforward — no new API calls needed.

**UI:** Line chart in Intel tab. Two y-axes: decoupling % (lower is better) and EF (higher is better). Trend lines showing direction over 4–8 week windows.

### Customizable Intel Dashboard

Intel tab is currently a fixed stack of panels. Make each panel a discrete widget that can be reordered, shown, or hidden. Persisted per user.

**Widgets (current panels, each becomes a widget):**

- Volume Trend Chart
- BG Response Model (category breakdown, scatter chart)
- Fuel Rate Targets
- Fitness Insights (CTL/ATL/TSB)
- Fitness Chart (load trend)
- HR Zone Breakdown
- Pace Calibration

**Interaction:**

- Long-press (mobile) or drag handle (desktop) to enter reorder mode. Drag to rearrange.
- Toggle visibility per widget — hidden widgets don't fetch data or render.
- "Reset to default" restores the stock layout.
- Layout stored in user settings (database) so it survives device switches.

**Implementation approach:**

- Widget registry: each widget declares its key, label, default order, and lazy-loaded component.
- `IntelScreen` reads the user's layout from settings, renders widgets in stored order, skips hidden ones.
- Drag-and-drop: `@dnd-kit/sortable` (already tree-shakeable, small footprint) or native HTML drag since the list is short.
- Settings shape: `{ widgetOrder: string[], hiddenWidgets: string[] }` in user settings.

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

### Cross-Run Pattern Discovery

Correlate BG outcomes against variables the current per-category model ignores: time of day, days since last run, cumulative weekly load, entry slope, weather (temperature/humidity from external API). Surface hidden rules the runner can't see in individual run analyses.

Examples: "Morning runs drop 40% more than evening at same fuel rate." "Runs after 2+ rest days start higher and drop slower." "BG stability degrades when weekly load exceeds 6 hours."

**Implementation:** Extend `BGObservation` with `startHour`, `daysSinceLastRun`, `weeklyLoadSoFar`. Run multivariate analysis across all observations. Present as discovered rules with p-values and sample sizes, not just averages.

**Prerequisite:** Needs 30+ runs with BG data across varied conditions to produce statistically meaningful splits.

### Auto-Sync HR Metrics from Intervals.icu

LTHR and max HR are currently manual settings the runner has to update by hand. But Garmin Connect already tracks these (measured LTHR, observed max HR), and Intervals.icu syncs them from Garmin. If we pull these values from the Intervals.icu athlete API, the app can auto-update LTHR and max HR — and by extension, all HR zones — without the runner touching settings.

**Why it matters:** Stale LTHR means wrong zone boundaries. Every workout description, every report card HR compliance score, every pace calibration zone boundary depends on LTHR. If the runner's LTHR drifts from 169 to 172 over a training block and the setting doesn't follow, all zone-based scoring and workout targeting is slightly off. Auto-sync eliminates that drift.

**API:** `GET /api/v1/athlete/0` on Intervals.icu returns athlete profile fields including `lthr`, `max_hr`, and potentially resting HR. Need to verify which fields are populated from Garmin sync vs manually entered on Intervals.icu.

**Design questions:**
- Should we auto-update silently, or show a notification when values change ("LTHR updated from 169 → 172, zones recalculated")?
- How often to poll? On every calendar fetch, or a separate daily check?
- What if Intervals.icu has no value (runner hasn't synced from Garmin)? Fall back to the manual setting.
- Should we store historical LTHR values to track fitness progression over time?

### GAP for Trail Readiness

Grade-adjusted pace analysis using elevation data from completed runs. Compare GAP to flat-equivalent pace to assess trail-specific fitness. Elevation data (`total_elevation_gain`) is already fetched from Intervals.icu but unused.

**Relevance:** Only matters if training includes significant elevation. Deprioritized until trail-specific training blocks appear in the plan.

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
