# Effort Metric Plans — Design

**Date:** 2026-07-27  
**Status:** Approved for planning  
**Goal:** Let a training plan prescribe workouts by pace, heart rate, or feel — at plan create time and per workout — without reshuffling workout structure when only the metric changes.

## Problem

Springa currently generates all plans **by pace**. A one-way **By Feel** button in EventModal strips targets from a single planned workout. Heart-rate prescription still exists in code (`formatStep`) but is unwired after the pace-primary migration.

The runner wants:

1. Choose **by pace / by heart rate / by feel** when creating a plan (setup + Planner new program).
2. Change that plan metric later in Planner; on **Done**, if config changes require updating future workouts, confirm and apply.
3. Replace the By Feel button with a **dropdown** on each planned workout: pace / HR / feel.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Per-workout / metric-only bulk update | Keep existing workout structure; rewrite step targets (re-emit) |
| Plan-level storage | `effortMetric` on the active program (`UserSettings` / draft), not a forever global default |
| Where to set it | Setup wizard + Planner config + New Program wizard |
| Default | `"pace"` |
| Done after config edit | If applied config ≠ last generated and future planned workouts exist → confirm before updating |
| Metric-only vs structural | Metric (and ability/threshold that only affect targets) → re-emit in place; structural schedule/race fields → existing full regenerate path |
| Replace / on-demand | Use current plan `effortMetric` |
| HR without zones | Disable HR option; short reason (needs synced LTHR + HR zones) |
| Completed / past planned | Never rewrite |

## Historical inspiration

Before pace-primary (`1ca0fab` / #139, April 2026), workouts were prescribed **only by heart rate** via `resolveZoneBand` + `formatStep` (`% LTHR (bpm)`). That path was removed from generators but **not deleted**:

- `formatStep` in `lib/descriptionBuilder.ts` — still correct Intervals.icu HR syntax
- `resolveZoneBand` / `classifyHR` in `lib/constants.ts` — still used for analysis and stripping
- Parser still understands HR lines in `lib/descriptionParser.ts`
- Specs/plans: `docs/specs/2026-04-07-pace-primary-plan.md`, zone redesign docs
- Pre-switch generator shape (recover from `1ca0fab^` / parents): `makeStep` called `formatStep` with LTHR bands

By Feel landed later (`76b311b` / #200): name suffix `" By Feel"` + `stripWorkoutTargets`. Reuse those helpers as the **feel** branch of a unified re-emit API; do not keep a one-way button.

**Implementation note:** Prefer resurrecting and re-threading the old HR `makeStep` path over inventing a new HR format. Prefer extending By Feel strip/name helpers over a parallel feel system.

## Data model

```ts
type EffortMetric = "pace" | "hr" | "feel";
```

- Add `effortMetric?: EffortMetric` to `UserSettings` (DB-backed, writable), `NewProgramDraft`, `PlanConfig` / `PlanContext`.
- Include in `buildCanonicalProgramConfig` / program config key (bump `PROGRAM_CONFIG_KEY_VERSION` as needed) so dirty detection covers metric changes.
- Default missing/undefined → `"pace"` (backward compatible).
- Replace generation flag `byFeel?: boolean` with `effortMetric` (`true` ≡ `"feel"` only for test migration).

**Per-workout persistence:** Intervals.icu `name` + `description` only (no new API field).

| Metric | Name | Description targets |
| --- | --- | --- |
| pace | no metric suffix | `/km Pace` or `% pace` |
| hr | no metric suffix | `% LTHR (bpm)` via `formatStep` |
| feel | no metric suffix (strip legacy ` By Feel` if present) | label + duration + `intensity=` only |

Detection for dropdown selected state: name suffix → feel; else description markers → pace or hr; else treat as feel/free.

## Generation

`createStepMaker(thresholdPace, effortMetric, hrCtx?)` (name may vary):

- **pace:** today’s `formatPaceStep` + `HM_ZONE_DEFAULTS` (absolute when threshold known)
- **hr:** `resolveZoneBand(zone, lthr, hrZones)` + `formatStep` (git-history path)
- **feel:** null min/max (targetless), same as current `byFeel`

Walks, strides, club-free steps, hill workouts, and uphill segments stay targetless in all modes.

Callers that must pass `effortMetric`:

- `generatePlan` / `generateSingleWorkout` / setup complete / Planner new program / Replace / on-demand WorkoutGenerator
- `adaptPlan` description builders that currently hardcode `formatPaceStep`

Fuel rates, distances, and periodization are unchanged.

## Re-emit (structure-preserving conversion)

Shared helper, e.g. `reemitWorkoutDescription(description, targetMetric, ctx) → description` (+ name helpers that strip legacy feel suffix):

1. Parse structure (sections, durations, labels, repeats, `intensity=` tags).
2. For each steppable line with a zone mapping, emit targets for `targetMetric` (or strip for feel).
3. Preserve effort-only steps as targetless.
4. On failure (unparseable): throw/return error — **no partial write**.

Used by:

- EventModal dropdown
- Planner Done confirm when only metric/ability targets need updating (bulk over **future** planned events)

Bulk apply: attempt every future planned event; report succeeded/failed counts; update `lastGeneratedConfig` only when every event succeeded; on any failure, surface which failed and leave the key unchanged so Done can retry.

## UI

### Setup

Effort control after ability / Intervals profile context is available (so HR can be enabled when zones exist). Default pace.

### Planner config panel & New Program wizard

Same three-option control. HR disabled without LTHR + `hrZones`.

### Done (existing program)

1. Persist dirty settings.
2. If config key ≠ `lastGeneratedConfig` and future planned workouts exist → modal asking to update the plan to match.
3. Confirm:
   - **Target-only diffs** (effort metric and/or ability/threshold that only change prescriptions) → bulk re-emit + Intervals (+ Google name/description sync as today’s By Feel path).
   - **Structural diffs** (run days, long-run day, club, race date/distance, weeks, start km, base phase, etc.) → existing full regenerate / schedule-changed flow.
   - If both kinds of dirty: structural path wins (full regenerate with new metric).
4. Decline: settings stay saved; workouts unchanged.

### EventModal

Replace **By Feel** button with dropdown: By Pace / By Heart Rate / By Feel. **Future planned only** — past-dated planned workouts must not re-emit, call `updateEvent`, apply optimistic calendar patches, or sync to Google. Completed activities stay untouched. HR gated.

### Summary bar

Optional quiet “By pace|HR|feel” label — nice-to-have, not required for v1.

## Authorization & integrity

- One write path for Intervals event name/description patches (reuse `updateEvent`).
- Do not cache Intervals scalar workout metadata in Turso; `effortMetric` is a user program setting, not a copy of Intervals data.
- Never rewrite completed activities.

## Testing

- Unit: step maker × three metrics; re-emit round-trips on easy, intervals, long, hills/strides; feel name suffix; HR gate; program config key includes metric.
- Integration: EventModal dropdown; Planner Done confirm → metric-only bulk re-emit; setup/new program passes metric into generation.
- Migrate existing By Feel tests to dropdown behavior.
- Keep parser/strip coverage for legacy HR and pace lines.

## Out of scope

- Changing post-run HR analysis / report card semantics
- Storing pre-strip description copies
- New Intervals.icu intensity-mode API fields
- Physical-device / production verification beyond normal local + preview rules

## Success criteria

1. New plans can be created entirely by pace, HR, or feel.
2. Planner can change plan metric; Done confirms and rewrites future targets without reshuffling session types when only metric/ability targets changed.
3. Each planned workout has a three-way metric dropdown that round-trips.
4. Replace/on-demand follows plan metric.
5. HR option blocked without synced zones.
6. Pace remains the default; existing plans without the setting behave as pace.
