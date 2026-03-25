# Springa

Workout generator and blood glucose management system for runners with diabetes. Generates structured training plans, learns BG response patterns from completed runs, and adapts fueling guidance automatically. Syncs to Intervals.icu, Garmin Connect, and the Garmin watch.

## Features

- **Training plan generation** — periodized plans (base, build, taper, race) with pace-based zones, progressive long runs, and interval rotation (threshold, VO2max, lactic)
- **BG response model** — learns from HR + glucose streams across completed runs. Predicts per-category drop rates, recommends fuel targets, and applies spike penalties when post-run data shows excess carbs
- **BG simulation** — forward-predicts glucose during a hypothetical run. Interactive sliders for category, duration, start BG, fuel rate
- **Fuel rate optimization** — default 60 g/h, overridden per category by the BG model with confidence levels. Extended cooldowns signal "stop fueling" to the watch
- **Pre-run push notifications** — cron job fires 1.5-2.5h before workouts with current BG, trend, IOB (insulin on board via Fiasp decay model), TSB (training stress balance), and fueling guidance
- **AI run analysis** — Claude generates post-run analysis from pace, HR, BG context, and report card scores
- **AI plan adaptation** — rewrites upcoming workouts based on BG model, fitness trends, recent feedback, and cross-run BG patterns
- **Coach chat** — conversational AI with live context: calendar, wellness, BG model, phase info, pace calibration
- **Cross-run BG pattern analysis** — AI-driven pattern recognition across 5+ runs with statistically validated insights
- **Run report card** — scores each run on BG stability (drop rate, hypo detection) and HR zone compliance
- **Calendar** — visual grid with planned workouts and completed activities. Modal shows workout steps, BG context, report card, analysis, and feedback form
- **Intel dashboard** — tabbed widgets: weekly volume, live BG, pace PBs, phase tracker, fitness insights (CTL/ATL/TSB), BG response stats, pace calibration, BG patterns
- **CGM ingestion** — Nightscout-compatible API receives live glucose from Strimma (Android CGM app). Server-side direction recomputation
- **Treatment sync** — pulls insulin and carb events from mylife Cloud for IOB calculations
- **Clothing guidance** — SMHI weather data with warmth preference for race-day clothing suggestions

## Data Flow

```
Libre 3 sensor
  --> CamAPS FX (Android)
    --> Strimma (notification listener, Nightscout push)
      --> Springa /api/v1/entries (stores in Turso)
        --> BG model, fuel rates, simulation, coach AI
          --> Plan generation + adaptation
            --> Intervals.icu API (workout sync)
              --> Garmin Connect (auto-sync)
                --> Forerunner 970 (SugarField shows BG during run)
                  --> Run completed webhook
                    --> Push notification --> Feedback --> BG model learns
```

## Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** Turso (libSQL)
- **AI:** Anthropic Claude Sonnet 4.6
- **Auth:** NextAuth.js (Google OAuth)
- **State:** Jotai
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Testing:** Vitest + React Testing Library + MSW
- **Hosting:** Vercel

## Integrations

| Service | Role |
|---------|------|
| [Intervals.icu](https://intervals.icu) | Workout sync, activity data, wellness (CTL/ATL/TSB) |
| [Strimma](https://github.com/psjostrom/strimma) | CGM data source (Nightscout-compatible push) |
| [mylife Cloud](https://www.mylife-diabetescare.com) | Insulin doses, carb events (IOB calculation) |
| [SMHI](https://www.smhi.se) | Weather data for clothing guidance |
| Garmin Connect | Activity sync via Intervals.icu |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

1114 tests across 56 test files.

```bash
npm test           # run all tests
npm run lint       # eslint
npx tsc --noEmit   # type check
```

## License

Private. Not open source.
