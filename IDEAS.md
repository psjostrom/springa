# Feature Ideas

## Completed

### Pre-run protocol card [x]

The fueling strategy is embedded as text in workout descriptions — `PUMP OFF - FUEL PER 10: 10g TOTAL: 75g`. It's designed for the Garmin display. But when reviewing a planned workout the night before or morning of, what you actually want is a structured, glanceable card: pump action, meal timing reminder, target start BG, how many gels/tabs to carry, intake schedule (every 10 min). All derivable from what's already in the description + workout duration. Zero new data, much better presentation for the planning use case.

### Weekly volume trend chart [x]

A bar chart — one bar per week across the entire plan duration — split into completed (solid) vs remaining planned (faded). This makes the periodization visible: build phases growing, recovery weeks dropping, taper shrinking. It also immediately reveals if you're consistently missing sessions or falling behind volume targets.

---

## Intel Features

### 1. BG Response Model [in progress]

Correlate per-zone HR with BG drop rate across historical runs. Slide 5-min windows across aligned HR + glucose streams, classify each window by HR zone, compute BG slope. Show avg/median mmol/L change per 10 min for each training zone, confidence levels, and fuel adjustment suggestions. The single most actionable insight for T1D training.

### 2. Readiness-Adaptive Training

Use HRV, resting HR, sleep score, and recent BG variability to suggest workout intensity adjustments. "Your HRV is 15% below baseline — consider swapping Thursday's intervals for an easy run."

### 3. Aerobic Decoupling Tracker

Track cardiac drift (pace:HR ratio) across easy and long runs over time. A decreasing decoupling percentage indicates improving aerobic fitness. Flag runs where decoupling exceeds 5%.

### 4. GAP for Trail Readiness

Grade-adjusted pace analysis using elevation data from completed runs. Compare GAP to flat-equivalent pace to assess trail-specific fitness for EcoTrail's terrain.

### 5. Efficiency Factor Trend

Plot EF (normalized pace / avg HR) over weeks. Rising EF = getting fitter at the same effort. Useful for tracking aerobic base development without racing.

### 6. Post-Run Report Card

Auto-generated summary after each completed run: BG management score (time in range during run), pacing accuracy vs plan, HR zone compliance, fueling adherence. Single card with pass/flag indicators.

### 8. Auto-Suggest Fuel Rates from BG Model

The BG model's `targetFuelRates` can feed back into plan generation — instead of manually tuning `fuelEasy`/`fuelLong`/`fuelInterval`, the app prompts "BG model suggests updating fuelEasy to 10 g/10min — apply?" Based on regression across runs at different fuel rates, or extrapolation when data is limited.

**When to revisit:** When at least one zone reaches "medium" confidence (10+ observations) AND the model has regression data (2+ distinct fuel rates tried in the same zone with 3+ runs each). Until then, the Intel tab target display is sufficient. Check back after ~15-20 completed runs with BG data, or when you've intentionally varied fuel rates across a few runs to give the model something to regress on.

**Implementation:** Never silently override — always a confirmation prompt. Show current vs suggested, the model's confidence level, and the method (regression vs extrapolation) so the decision is informed.

### 9. Live CGM via xDrip

xDrip can push glucose data to a web server continuously. If the app ingests this feed, it unlocks pre-run BG awareness: the pre-run card could show current BG and warn if it's in a band with historically worse drop rates, suggest delaying the run or taking extra carbs. Also enables live mid-run alerts (not on the watch, but viewable post-hoc or via a companion). Requires: xDrip webhook/API config, a lightweight endpoint to receive and store readings, and a polling mechanism in the app.

---

## Backlog (Original Ideas)

### Segment-aligned glucose overlay

The app already fetches both workout stream data (time, HR, pace) and glucose data. But they're shown as separate concerns — glucose in the analysis section, workout structure in the stream graph. The real insight comes from seeing them together: glucose trace overlaid on the workout segments (warmup, main set, cooldown), so you can see exactly where BG drops relative to what you were doing.

### Actual vs planned fuel logging

The three-tier strategy is "experimental" and "actively being validated". But there's no structured way to record what actually happened. A simple input on completed events: actual carbs consumed, start BG, end BG, any hypo (y/n). Over 20-30 runs, this builds a real dataset.

### Pace zone auto-calibration from completed runs

`buildEasyPaceFromHistory` already exists and calculates easy pace from historical data. But it only covers easy zone, and the fallback table is hardcoded. Building a full pace table from actual data — and showing how it changes over time — would make the zone targets in generated workouts more accurate.
