# Springa

Training planner and workout tracker with T1D blood glucose management, synced to Intervals.icu.

Built for a Type 1 Diabetic runner targeting the EcoTrail 16km (2026-06-13). Generates structured training plans (pace-based, Ben Parkes–inspired) with three-tier diabetes fueling strategies, uploads them to Intervals.icu, and tracks completed workouts with HR zone breakdowns and stream graphs.

## Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Database:** Turso (libSQL/SQLite)
- **AI:** Anthropic Claude Sonnet (run analysis + coach chat)
- **Auth:** NextAuth.js (Google OAuth)
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Testing:** Vitest + React Testing Library + MSW
- **CGM:** xDrip+ via Nightscout API (live glucose data)
- **Integration:** Intervals.icu API → Garmin Connect → Garmin Forerunner 970

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests

```bash
npm test              # run all tests
npx vitest run        # same, explicit
npx tsc --noEmit      # type check
```
