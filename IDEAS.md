# Feature Ideas

## 1. Segment-aligned glucose overlay

The app already fetches both workout stream data (time, HR, pace) and glucose data. But they're shown as separate concerns — glucose in the analysis section, workout structure in the stream graph. The real insight comes from seeing them together: glucose trace overlaid on the workout segments (warmup, main set, cooldown), so you can see exactly where BG drops relative to what you were doing. "BG crashes 25 minutes into the easy portion of long runs" is actionable. "BG trend: -2.1/hr" is not — it's an average over the entire run. The data is already there. It's a presentation problem.

## 2. Race readiness snapshot

A small, honest widget: longest completed distance, current weekly volume trend, weeks to race, how current long run distance compares to target (16km). No predictions, no motivational nonsense — just the numbers that answer "am I going to make it?" Right now you'd have to mentally piece this together from the calendar.

## 3. Pre-run protocol card [x]

The fueling strategy is embedded as text in workout descriptions — `PUMP OFF - FUEL PER 10: 10g TOTAL: 75g`. It's designed for the Garmin display. But when reviewing a planned workout the night before or morning of, what you actually want is a structured, glanceable card: pump action, meal timing reminder, target start BG, how many gels/tabs to carry, intake schedule (every 10 min). All derivable from what's already in the description + workout duration. Zero new data, much better presentation for the planning use case.

## 4. Actual vs planned fuel logging

The three-tier strategy is "experimental" and "actively being validated". But there's no structured way to record what actually happened. A simple input on completed events: actual carbs consumed, start BG, end BG, any hypo (y/n). Over 20-30 runs, this builds a real dataset. The glucose analysis does trend detection, but trend alone doesn't tell you whether 8g/10min was enough or too much — only comparing planned vs actual intake vs outcome does. Without this, the strategy stays experimental indefinitely.

## 5. Weekly volume trend chart [x]

A bar chart — one bar per week across the entire plan duration — split into completed (solid) vs remaining planned (faded). This makes the periodization visible: build phases growing, recovery weeks dropping, taper shrinking. It also immediately reveals if you're consistently missing sessions or falling behind volume targets. The existing `WeeklyVolumeChart` component only shows the current week.

## 6. Pace zone auto-calibration from completed runs

`buildEasyPaceFromHistory` already exists and calculates easy pace from historical data. But it only covers easy zone, and the fallback table is hardcoded. Completed interval sessions and race-pace runs have distance, duration, and HR data. Building a full pace table from actual data — and showing how it changes over time — would make the zone targets in generated workouts more accurate as fitness improves. The infrastructure is there; it just stops at easy zone.
