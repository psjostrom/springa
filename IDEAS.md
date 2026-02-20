# Feature Ideas

## Completed

### Pre-run protocol card [x]

The fueling strategy is embedded as text in workout descriptions — `PUMP OFF - FUEL PER 10: 10g TOTAL: 75g`. It's designed for the Garmin display. But when reviewing a planned workout the night before or morning of, what you actually want is a structured, glanceable card: pump action, meal timing reminder, target start BG, how many gels/tabs to carry, intake schedule (every 10 min). All derivable from what's already in the description + workout duration. Zero new data, much better presentation for the planning use case.

### Weekly volume trend chart [x]

A bar chart — one bar per week across the entire plan duration — split into completed (solid) vs remaining planned (faded). This makes the periodization visible: build phases growing, recovery weeks dropping, taper shrinking. It also immediately reveals if you're consistently missing sessions or falling behind volume targets.

### BG Response Model [x]

Category-based BG response analysis across easy/long/interval runs. 5-min sliding windows across aligned HR + glucose streams, BG slope per window, aggregated per workout category. Includes: confidence levels, fuel adjustment suggestions, BG by start level, BG by entry slope, BG by time decay, target fuel rate calculation (regression + extrapolation), scatter chart visualization.

**Future refinement — per-zone HR analysis:** Classify each window by HR zone (Z2/Z3/Z4) instead of workout category. This gives intensity-level insight ("in Z3 BG drops X") rather than category-level ("long runs drop Y"). The infrastructure is ready (HR stream aligned, sliding windows computing slopes) — just swap the classification key. **Revisit after 20+ runs with BG data and several mixed-intensity runs (sandwich/progressive long runs).** Until then, per-zone splits would have too few samples per zone to be meaningful.

### Auto-Suggest Fuel Rates [x]

Target fuel rates computed from BG model (regression or extrapolation) and auto-applied as defaults in the planner. Shown as informational targets in Intel tab.

### Live CGM via xDrip [x]

xDrip pushes glucose data via Nightscout protocol. Readings persisted indefinitely for post-run analysis. Pre-run card shows current BG with trend.

### Post-Run Report Card [x]

3-column strip in EventModal (between stats card and carbs section) scoring each completed run on three axes: BG stability (drop rate + hypo detection), HR zone compliance (% time in target zone by workout category), and fuel adherence (actual vs planned carbs). Color-coded green/yellow/red dots. Skeleton shimmer while stream data loads. Scoring logic in `lib/reportCard.ts`, UI in `app/components/RunReportCard.tsx`, 32 unit tests.

**Future refinements:**
- **Trend across runs:** Track report card scores over time to show improvement patterns (e.g., "BG management improving over last 5 long runs").
- **Per-zone HR scoring for intervals:** Currently scores intervals against Z4 total, but mixed sessions (warmup Z2 + reps Z4 + recovery Z1) dilute the percentage. Could score only the work intervals against Z4.
- **BG scoring by workout phase:** Score BG stability per segment (warmup/main/cooldown) instead of whole-run average, to pinpoint where management breaks down.

---

## Intel Features

### 1. Aerobic Decoupling Tracker

Track cardiac drift (pace:HR ratio) across easy and long runs over time. A decreasing decoupling percentage indicates improving aerobic fitness. Flag runs where decoupling exceeds 5%.

### 2. Efficiency Factor Trend

Plot EF (normalized pace / avg HR) over weeks. Rising EF = getting fitter at the same effort. Useful for tracking aerobic base development without racing.

### 3. GAP for Trail Readiness

Grade-adjusted pace analysis using elevation data from completed runs. Compare GAP to flat-equivalent pace to assess trail-specific fitness for EcoTrail's terrain.

### 4. Readiness-Adaptive Training

Use HRV, resting HR, sleep score, and recent BG variability to suggest workout intensity adjustments. "Your HRV is 15% below baseline — consider swapping Thursday's intervals for an easy run." Blocked on data source — Garmin Connect API or manual input needed.

---

## Backlog

### Segment-aligned glucose overlay

The app already fetches both workout stream data (time, HR, pace) and glucose data. But they're shown as separate concerns — glucose in the analysis section, workout structure in the stream graph. The real insight comes from seeing them together: glucose trace overlaid on the workout segments (warmup, main set, cooldown), so you can see exactly where BG drops relative to what you were doing.

### Actual vs planned fuel logging

The three-tier strategy is "experimental" and "actively being validated". But there's no structured way to record what actually happened. A simple input on completed events: actual carbs consumed, start BG, end BG, any hypo (y/n). Over 20-30 runs, this builds a real dataset.

### Pace zone auto-calibration from completed runs

`buildEasyPaceFromHistory` already exists and calculates easy pace from historical data. But it only covers easy zone, and the fallback table is hardcoded. Building a full pace table from actual data — and showing how it changes over time — would make the zone targets in generated workouts more accurate.
