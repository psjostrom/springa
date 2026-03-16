# Springa

Workout generator and BG management system for a T1D runner targeting EcoTrail 16km (2026-06-13). Generates training plans that sync to Intervals.icu → Garmin Connect → Garmin Forerunner 970.

Personal/medical data (runner profile, physiological metrics, T1D management, equipment) lives in `.claude.local.md`.

## Tech Stack

Next.js 16 (App Router) · TypeScript · Vitest · Turso (libsql) · Jotai · Tailwind · Vercel

**Commands:** `npm run dev` · `npm test` (`vitest run`) · `npm run lint` (`eslint`) · `npm run build`

## Workflow Rules

- **Mobile preview:** Push main to the `dev` branch with `git push origin main:dev`. Vercel deploys it to a fixed preview URL. Google OAuth is pre-configured for this URL. No need to create throwaway branches for testing.
- **Test locally first.** Don't suggest pushing to dev for testing when localhost is available. Dev deploys are for mobile/OAuth testing that can't run locally.
- **Worktrees:** Use Claude Code's built-in `--worktree` flag or `isolation: "worktree"` for subagents. Worktrees live at `.claude/worktrees/<name>/` (excluded in vitest, eslint, and gitignore).
- **Commits:** For multi-line commit messages, write the message to a temp file and use `git commit -F /tmp/commit-msg.txt`, then delete the temp file. Never use `$()` command substitution in bash — it triggers an approval prompt.
- **Specs:** Save design specs to `docs/specs/`, not `docs/superpowers/specs/`. Specs are project documentation, not tool artifacts.

## Language

- **Use plain language.** No medical/scientific jargon when a simple word exists. Say "lowest BG" not "nadir," "swing" not "amplitude," "spike" not "excursion." The runner is not a researcher — use words a runner would use mid-conversation.

## Key Files

**Workout generation:**
- `lib/workoutGenerators.ts` — workout generation logic
- `lib/descriptionBuilder.ts` — Intervals.icu workout description format
- `lib/constants.ts` — HR zones, pace zones, zone resolution

**BG & fuel system:**
- `lib/bgModel.ts` — BG response model, fuel rate targets, spike penalty
- `lib/fuelRate.ts` — fuel rate resolution per workout category
- `lib/postRunSpike.ts` — post-run spike extraction for model feedback
- `lib/bgSimulation.ts` — forward BG simulation engine
- `lib/bgPatterns.ts` — cross-run BG pattern analysis (AI-driven)
- `lib/runBGContext.ts` — pre/post-run BG context from xDrip readings

**T1D management:**
- `lib/prerun.ts` — pre-run readiness assessment and push notifications
- `lib/insulinContext.ts` — IOB modeling (Fiasp exponential decay)
- `lib/xdrip.ts` — xDrip+ data ingestion and direction recomputation
- `lib/reportCard.ts` — post-run scoring (BG + HR compliance)

**Infrastructure:**
- `lib/intervalsApi.ts` — Intervals.icu API client (fetch, upload, sync)
- `lib/calendarPipeline.ts` — calendar event processing pipeline
- `lib/adaptPlan.ts` — AI-driven plan adaptation

## Domain Reference

Read `docs/workout-reference.md` when working on workout generation, workout descriptions, or the fuel rate system. It contains workout types, examples, and the description format that Intervals.icu requires.

## Data Integrity

- **Treat every repo as if the data matters.** Springa manages diabetes and training for a T1D runner. Wrong data can cause real harm. Never treat architecture as disposable. Sloppy state management, redundant storage, and hot fixes compound.
- **NEVER cache external API data in the local DB when the API is the source of truth.** Store credentials (API keys) and data that's expensive to recompute (stream timeseries). Never store scalar metadata (distance, duration, HR, names, etc.) that can be fetched from the API in a single call.
- **NEVER store a database row that can't be retrieved by its intended lookup path.** If a required key isn't available yet, block the operation.
- **A write operation lives in exactly one place.** If two routes can write the same field, one of them is wrong.
- **API routes do one thing.** A route that analyzes runs does not link feedback or sync carbs. Side effects happen at the point of user action.

## Intervals.icu Integration Rules

To ensure the generated text is parsed correctly by the workout builder and displayed on the watch:

- **Duration:** ALWAYS use `m` (e.g., `10m`, `45m`). NEVER "min" or "mins".
- **Step Format:** `[Duration] [Min%]-[Max%] LTHR ([MinBPM]-[MaxBPM] bpm)`
- **Fuel Data:** Fuel info is sent via the `carbs_per_hour` API field on events, NOT embedded in descriptions. The `fuelRate` field on `WorkoutEvent` stores g/h; the upload function passes it directly as `carbs_per_hour` (rounded). Default is 60 g/h for all categories; the BG model overrides with per-category targets when data is available.
- **Descriptions:** Clean workout text only — no `FUEL PER 10:` or `PUMP` prefixes. Notes/flavor text goes before the Warmup section.
- **Workout Naming:**
  - MUST include the **Suffix** (e.g., "eco16") for analysis filtering.
  - Long runs MUST contain "Long" (e.g., "Sun Long"). DO NOT use "LR".
  - Saturday runs MUST include "Bonus" in the name (e.g., "Bonus Easy", "Bonus Easy + Strides"). The session type can vary, but must leave energy for Sunday's long run.

## Fuel Taper System

Extended cooldowns serve as a "stop fueling" signal. The Garmin watch vibrates on step transitions — when the runner hears "Cooldown," that's the last fuel. No more carbs after that.

- **Easy runs / Bonus:** 15m cooldown (~2 km at 7:00/km)
- **Long runs:** 2km cooldown
- **Easy + Strides:** 15m cooldown
- **Intervals:** No taper (5m CD unchanged). Interval spikes are hormonal, not carb absorption.

The BG model also applies a **spike penalty** — if post-run data shows BG spiking after runs at a given fuel rate, the model reduces the target. Uses per-fuel-rate grouping so the model can distinguish "old high rates cause spikes" from "new lower rates are working." See `docs/specs/2026-03-15-fuel-taper-design.md` for full spec and iteration guide.

## BG Model Overview

The BG model (`lib/bgModel.ts`) learns from completed runs to predict BG behavior and recommend fuel rates.

**Inputs:** HR + glucose streams from completed activities, aligned in 5-min sliding windows. Each window produces a `BGObservation` with BG rate (mmol/L per min), fuel rate, category, start BG, entry slope.

**Outputs:**
- Per-category BG response stats (avg/median drop rate, confidence)
- Target fuel rates via regression (2+ fuel rate groups) or extrapolation
- Post-run spike penalty (reduces targets when excess carbs cause post-run BG spikes)
- BG by start level, entry slope, and time bucket breakdowns

**Consumers:** Workout generator (fuel rates), adapt plan (fuel adjustments + workout swaps), BG simulation (forward prediction), coach AI, BG patterns (AI analysis).

## Post-Run Report Card

Scoring strip in `EventModal` rating each completed run. Logic in `lib/reportCard.ts`, UI in `app/components/RunReportCard.tsx`.

- **BG Score:** drop rate + hypo detection. Good/ok/bad based on mmol/L per min thresholds.
- **HR Zone Compliance:** % time in target zone by category (easy→Z2, interval→Z4).
- Additional context scores (entry trend, recovery) when BG context data is available.

## xDrip+ Companion Mode Bug

xDrip+ in **companion mode** returns stale/wrong `direction` and `delta` fields (31% mismatch rate). Root cause: [NightscoutFoundation/xDrip#3787](https://github.com/NightscoutFoundation/xDrip/issues/3787).

**Fix:** `recomputeDirections()` in `lib/xdrip.ts` recomputes direction using 3-point averaged sgv values ~5 min apart on ingestion. The xDrip+ `direction` field is never stored as-is. Garmin side: SugarRun and SugarWave also compute delta and direction from sgv values on-device.
