# Demo Mode

Interactive read-only demo of the real Springa app, served at `springa.run/demo`. Uses a snapshot of real (scrambled) data. No external API calls. No authentication required.

## Entry Points

1. **Direct URL:** `springa.run/demo` — shareable link for LinkedIn, Strimma README, etc.
2. **Login page:** "Try the demo" link below the Google sign-in button, navigates to `/demo`.

## Architecture: Middleware Rewrite

Zero changes to existing API routes. Demo mode is fully isolated in three new files plus minimal edits to four existing files.

### 1. `/demo` page (`app/demo/page.tsx`)

Server action sets a `springa-demo` cookie (sameSite: lax, 24h expiry, NOT httpOnly — not security-sensitive, just a mode flag) and redirects to `/`. No OAuth, no database row.

### 2. Middleware (`middleware.ts`)

New file. Matches `/api/*` requests (excluding `/api/auth/*`). Single responsibility:

If `springa-demo` cookie is present, rewrite `/api/*` to `/api/demo/[...path]`. Real route handlers never execute for demo users.

No auth bypass logic needed — the app has no page-level auth redirect. Auth is enforced per API route via `requireAuth()`, and the middleware rewrite means demo requests never reach those routes.

### 3. Demo catch-all route (`app/api/demo/[...path]/route.ts`)

Single route handler serving all demo API responses:

- **GET requests:** Look up `path` in a fixture map. Return the matching fixture JSON. If no fixture exists for the path, return `{ error: "Not available in demo" }` with 404.
- **POST/PUT/DELETE requests:** Return `{ ok: true, demo: true }`. No side effects.
- **Parameterized routes:** The path array from `[...path]` is joined and matched. For routes with dynamic segments (`intervals/activity/[id]`, `intervals/events/[id]`, `bg/run`), the catch-all has a small switch that extracts the ID and looks up the fixture by ID. All other routes use exact-match lookup.
- **Special case — `chat`:** If the request body matches a pre-filled question, return the canned response as a text stream (matching the real `streamText` response format). For any other message, return a stream that says: "I'm in demo mode — questions beyond the pre-set ones aren't available. Sign in to chat with your personal coach."

### Date Shifting

The fixture data stores dates as offsets from a `snapshotDate`. The catch-all route shifts all dates relative to today before serving:

- `snapshotDate` = the day the snapshot was captured (stored in fixtures)
- `dayShift` = `today - snapshotDate`
- All date fields in calendar events, activities, BG readings shifted by `dayShift`

This keeps the plan looking "current" regardless of when someone views the demo.

## Client-Side

### Demo Detection

`isDemoAtom` — a derived atom in `app/atoms.ts`:

```ts
export const isDemoAtom = atom((get) => get(settingsAtom)?.demo === true);
```

The demo settings fixture includes `demo: true`. Detection flows through existing settings hydration — no new hooks, no cookie parsing, no new providers.

### Demo Banner

A persistent subtle pill visible in demo mode. Reads `isDemoAtom`. Includes a "Sign in" link to `/login`. Rendered conditionally in `page.tsx` when `isDemoAtom` is true.

### Mutation Feedback

When a POST/PUT/DELETE returns `{ demo: true }`, show a toast: "This is a demo — changes aren't saved." Alternatively, the write atoms (e.g., `updateSettingsAtom`) check `isDemoAtom` before the fetch and show the toast directly — either approach works since the response includes the flag.

### Existing Client Behavior in Demo Mode

- **`useSession()`** returns `{ status: "unauthenticated" }` — no real Google session. This is fine because the app doesn't redirect based on session status. The only place `session?.user?.email` is used is the `SettingsOverlay` email prop — fixed by falling back to `settings?.email`.
- **`useHydrateStore()`** calls `fetch("/api/settings")` — middleware rewrites to catch-all, returns fixture with `onboardingComplete: true` and `demo: true`. Existing hydration works unchanged.
- **`PushSubscriptionManager`** gates on `session?.user?.email` — no session means no push subscription attempt. No change needed.
- **`NotificationPrompt`** — suppress for demo users by checking `isDemoAtom`. One line.
- **SWR polling** (`useCurrentBG` polls `/api/bg` every 60s) — returns the same fixture data each time. Harmless, not worth suppressing.

## Snapshot Script

`scripts/demo-snapshot.ts` — run manually whenever the demo data should be refreshed.

### What it captures

| Source | Data | Fixture key |
|--------|------|-------------|
| Intervals.icu API | Calendar events (planned + completed) | `intervals/calendar` |
| Intervals.icu API | Activities with HR/pace streams | `intervals/activity/{id}`, `intervals/streams` |
| Intervals.icu API | Athlete profile (zones, LTHR, etc.) | Merged into `settings` |
| Intervals.icu API | Wellness (ATL/CTL/TSB) | `wellness` |
| Intervals.icu API | Pace curves | `intervals/pace-curves` |
| Scout API | BG readings (last 24h + historical for runs) | `bg`, `bg/run` |
| Scout API | IOB | `insulin-context` |
| Computed | BG model | `bg-cache` |
| Computed | BG patterns | `bg-patterns` |
| Canned | Coach responses for pre-filled questions | `chat` |
| Local DB | User settings (race, schedule, zones, etc.) | `settings` |

### Scrambling Rules

1. **Workout names:** Normalize to current `W{nn} Type` format, consistent English naming. Manual curation step after snapshot.
2. **Comments/notes:** Replace with generic running commentary.
3. **Display name:** Replace with a generic name or fun alias.
4. **Dates:** Store as offset from snapshot date (see Date Shifting above).
5. **BG values:** Keep as-is — no PII, and they're the whole point.
6. **HR/pace streams:** Keep as-is. Trim to 1-minute resolution to keep fixture size manageable.
7. **Race name/goal:** Keep — EcoTrail is public and makes the demo compelling.
8. **Credentials:** Excluded entirely. Settings fixture has `intervalsConnected: true`, `nightscoutConnected: true`, no actual keys.
9. **Email:** Replace with `demo@springa.run`.

### Output

Single file: `lib/demo/fixtures.ts` — exports the snapshot date and a `Record<string, unknown>` keyed by API path. The catch-all route imports this directly. No runtime file I/O.

## What the Demo Shows

The demo user lands on the app with diabetes mode ON, seeing:

- **Planner:** Race goal, schedule config, volume chart, upcoming plan
- **Calendar:** ~20 weeks of training history with completed runs, upcoming workouts, BG overlays
- **Intel:** BG model stats, fuel rate recommendations, pace zones, report cards
- **Coach:** Pre-filled questions with canned AI responses, freeform input shows demo message
- **Simulate:** BG simulation with fixture data

## Files Changed

| File | Change |
|------|--------|
| `middleware.ts` | **New.** Demo cookie detection, API rewrite (~15 lines). |
| `app/demo/page.tsx` | **New.** Sets demo cookie, redirects to `/` (~15 lines). |
| `app/api/demo/[...path]/route.ts` | **New.** Catch-all serving fixtures (~50 lines). |
| `lib/demo/fixtures.ts` | **New.** Generated snapshot data. |
| `scripts/demo-snapshot.ts` | **New.** Captures and scrambles data. |
| `app/atoms.ts` | Add `isDemoAtom` — one derived atom (1 line). |
| `app/page.tsx` | Email prop fallback: `settings?.email ?? session?.user?.email` (1 line). |
| `app/login/page.tsx` | Add "Try the demo" link (3 lines). |
| `app/components/DemoBanner.tsx` | **New.** Persistent demo mode indicator. |

No changes to any existing API route. No changes to any existing hook or data-fetching logic.

## Maintenance

- **New GET route added:** Demo returns 404 for that endpoint — graceful degradation, no crash. Add a fixture entry when you want it in the demo, or re-run the snapshot script.
- **New POST/PUT/DELETE route added:** Already handled by the catch-all. Zero work.
- **New page/tab added:** Just works — fetches go through middleware rewrite.
- **Response shape changes:** Re-run the snapshot script.
- **Refresh demo data:** `npm run demo:snapshot`, curate workout names, done.
