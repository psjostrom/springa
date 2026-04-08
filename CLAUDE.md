# Springa

Workout generator and BG management system for a T1D runner targeting EcoTrail 16km (2026-06-13). Generates training plans that sync to Intervals.icu → Garmin Connect → Garmin Forerunner 970.

Personal/medical data (runner profile, physiological metrics, T1D management, equipment) lives in `.claude.local.md`.

## Tech Stack

Next.js 16 (App Router) · TypeScript · Vitest · Turso (libsql) · Jotai · Tailwind · Vercel

**Production URL:** `www.springa.run`

**Commands:** `npm run dev` · `npm test` (`vitest run`) · `npm run lint` (`eslint`) · `npm run build`

**Database queries from shell:** NEVER use raw `node -e` with `process.env.TURSO_*` — `.env.local` isn't loaded. Use `npm run db:query` instead. Note: `lib/db.ts` is ESM/TypeScript and can't be `require()`'d — use `@libsql/client` directly:
```sh
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('SELECT count(*) FROM bg_readings').then(r=>console.log(r.rows))"
```

## Accessibility

All text must meet **WCAG AA** contrast (4.5:1 normal text, 3:1 large text) against its background in both dark and light mode. Primary and muted text should target **AAA** (7:1). Never use a semantic color (brand, success, warning, error, glucose) as text on a light background without verifying contrast. The light mode token values in `globals.css` are tuned to meet these thresholds — don't lighten them.

## Workflow Rules

- **Mobile preview:** Push main to the `dev` branch with `git push origin main:dev`. Vercel deploys it to a fixed preview URL. Google OAuth is pre-configured for this URL. No need to create throwaway branches for testing.
- **Test locally first.** Don't suggest pushing to dev for testing when localhost is available. Dev deploys are for mobile/OAuth testing that can't run locally.
- **Worktrees:** Use Claude Code's built-in `--worktree` flag or `isolation: "worktree"` for subagents. Worktrees live at `.claude/worktrees/<name>/` (excluded in vitest, eslint, and gitignore).
- **Commits:** For multi-line commit messages, write the message to a temp file and use `git commit -F /tmp/commit-msg.txt`, then delete the temp file. Never use `$()` command substitution in bash — it triggers an approval prompt.
- **Specs:** Save design specs to `docs/specs/`, not `docs/superpowers/specs/`. Specs are project documentation, not tool artifacts.

## Testing

Vitest with three test projects: `unit` (`*.test.ts`), `integration` (`*.integration.test.tsx`), `flow` (`*.flow.test.ts`). All share the MSW setup at `lib/__tests__/msw/`.

### Test Infrastructure

- **MSW server:** `lib/__tests__/msw/server.ts` — shared MSW server instance.
- **MSW setup:** `lib/__tests__/msw/setup.ts` — lifecycle hooks (beforeAll/afterEach/afterAll). Loaded via `vitest.config.ts` setupFiles. `onUnhandledRequest: "error"` ensures every fetch hits a handler.
- **Default handlers:** `lib/__tests__/msw/handlers.ts` — happy-path responses for all Intervals.icu, Google Calendar, and internal API endpoints. Also exports capture arrays (`capturedUploadPayload`, `capturedPutPayload`, etc.) for asserting on request payloads.
- **Fixtures:** `lib/__tests__/msw/fixtures.ts` — sample activities, events, and streams.
- **Test utils:** `lib/__tests__/test-utils.tsx` — custom `render`/`renderHook` wrapping Jotai + SWR providers. Always import from here, not from `@testing-library/react` directly.

### Rules (enforced by ESLint)

- **No fetch mocking.** `vi.stubGlobal("fetch")` and `global.fetch = ...` are banned. Use `server.use()` for per-test response overrides.
- **No module mocking.** `vi.mock()` is banned. Exception: `vi.mock("@libsql/client")` to redirect to in-memory SQLite.
- **No mock assertions.** `mockResolvedValue`, `mockImplementation`, `mockReturnValue` are banned. Use MSW capture patterns or assert on outputs.
- **`vi.fn()` without chaining is allowed** for callback spies (`onClose`, `onChange`). If the callback returns a promise and needs `.mockResolvedValue()`, add an `eslint-disable-next-line` comment explaining it's a callback spy.

### Pattern: Per-Test MSW Override (local handler)

```ts
import { server } from "./msw/server";
import { http, HttpResponse } from "msw";

it("handles API error", async () => {
  server.use(
    http.get(`${API_BASE}/athlete/0`, () => {
      return new HttpResponse(null, { status: 401 });
    }),
  );
  // ... test code that calls the real function
});
```

### Pattern: In-Memory DB

```ts
const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  return { holder: { db: null as Client } };
});
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});
```

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
- `lib/runBGContext.ts` — pre/post-run BG context from CGM readings

**T1D management:**
- `lib/prerun.ts` — pre-run readiness assessment and push notifications
- `lib/insulinContext.ts` — IOB modeling (Fiasp exponential decay)
- `lib/cgm.ts` — CGM data ingestion (from Strimma) and direction recomputation
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
- **Step Format:** `[Duration] [Min%]-[Max%]% pace` for pace targets (e.g., `10m 80-88% pace`), or `[Note] [Duration]` for effort-based steps (walks, hills, strides).
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

## CGM Data Pipeline

**Source:** Strimma (Android CGM app) pushes to `/api/v1/entries` using standard Nightscout JSON format. xDrip+ has been retired — Strimma is the sole data source (validated equivalent coverage and accuracy in 14h side-by-side testing).

**Direction recomputation:** `recomputeDirections()` in `lib/cgm.ts` recomputes direction server-side using 3-point averaged sgv values ~5 min apart. This catches any stale direction fields from companion mode. Garmin side: SugarRun and SugarWave also compute delta and direction from sgv values on-device.

**Single table:** All readings live in `bg_readings`.
