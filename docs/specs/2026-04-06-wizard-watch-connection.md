# Wizard: Watch Connection & Intervals.icu Context

**Date:** 2026-04-06
**Status:** Draft
**Branch:** TBD

## Problem

The setup wizard validates the Intervals.icu API key but doesn't verify that the user's watch is actually connected to Intervals.icu. A valid API key ≠ activity data flowing. Users who complete the wizard without a watch connection land in a permanently empty app — Intel never populates, Coach has nothing to analyze, and the training plan can't track completion.

Additionally, the wizard doesn't explain *what* Intervals.icu is or *why* it's needed. Users who don't already know the platform are confused about creating yet another account.

## Solution

Two changes to the wizard:

1. **Enhance WelcomeStep** with a "What you'll need" checklist that sets expectations upfront: GPS running watch (required), Intervals.icu account (required), CGM + Nightscout (optional).
2. **Add a new WatchStep** (Step 3) that checks the user's Intervals.icu connection status via `GET /athlete/0` and guides them through connecting their specific watch platform.

## Revised Wizard Flow

| Step | Component | Purpose |
|------|-----------|---------|
| 1 | WelcomeStep | Name, timezone, "What you'll need" checklist |
| 2 | IntervalsStep | Data flow explainer + API key input + validation |
| 3 | **WatchStep (new)** | Connection verification + platform-specific guidance |
| 4 | ScheduleStep | Run days (unchanged) |
| 5 | GoalStep | Race name/date/distance (unchanged) |
| 6 | HRZonesStep | LTHR, maxHr, zones (unchanged) |
| 7 | DiabetesStep | Diabetes mode + NS credentials (unchanged) |
| 8 | DoneStep | Plan generation + redirect (unchanged) |

## Step 1: WelcomeStep Changes

Add a "What you'll need" section below the timezone selector, before the Next button. Three items:

### Required: GPS running watch

> **A GPS running watch**
> Garmin · Polar · Suunto · Coros · Wahoo · Apple Watch · Wear OS

### Required: Intervals.icu

> **A free Intervals.icu account**
> Bridges your watch data to Springa. We'll set this up next.

### Optional: CGM

> **CGM + Nightscout** *(optional)*
> Use a continuous glucose monitor? Connect it for live BG tracking during runs, smart fuel rate recommendations, and post-run glucose analysis.

No changes to inputs or validation. The checklist is informational only.

## Step 2: IntervalsStep Changes

### Data flow diagram

Add a visual diagram above the existing instructions showing:

```
[Watch icon] → [Intervals.icu] ↔ [Springa]
```

With a one-liner below it:

> Intervals.icu stores your training data and syncs workouts to your watch. Springa reads it to build and adjust your plan.

### Existing behavior preserved

The step instructions ("Step 1: Create a free Intervals.icu account", "Step 2: Get your API key"), input field, and validation logic remain unchanged. The diagram and explanation are added above them.

### Current IntervalsStep title

The current title is "Connect Your Watch" which is misleading — this step connects to Intervals.icu, not the watch. Rename to **"Connect to Intervals.icu"**. The subtitle becomes the data flow explanation above.

## Step 3: WatchStep (New)

### Data source

After the API key validates in Step 2, the WatchStep calls a new API endpoint that returns the user's connection status from Intervals.icu.

### API endpoint

**`GET /api/intervals/connections`**

Server-side: fetches `GET https://intervals.icu/api/v1/athlete/0` using the user's stored API key, extracts connection fields, returns a simplified response:

```typescript
interface ConnectionStatus {
  platforms: PlatformConnection[];  // all platforms that have a link (OAuth/connection exists)
}

interface PlatformConnection {
  platform: "garmin" | "polar" | "suunto" | "coros" | "wahoo" | "amazfit" | "strava" | "huawei";
  linked: boolean;            // platform connection exists (OAuth done, user_id set, etc.)
  syncActivities: boolean;    // activities actually syncing
  uploadWorkouts: boolean;    // planned workouts push to watch
}
```

The WatchStep derives its UI state from this:
- **Green:** any platform has `linked && syncActivities && platform !== "strava"`
- **Strava warning:** only Strava has `linked && syncActivities`
- **Connected but sync off:** any platform has `linked && !syncActivities`
- **Yellow:** no platform has `linked`
- **Red:** user explicitly selects "I don't have a running watch"

### Detection logic

The Intervals.icu `GET /athlete/0` response contains connection fields for every platform. Detection requires TWO conditions: the platform link exists AND activity sync is enabled.

**Important:** Some fields have misleading defaults. For example, `strava_sync_activities` is `true` by default even when Strava isn't connected (`strava_id === null`). Always check the connection field first, then the sync flag.

| Platform | Link exists if | Activities syncing if |
|----------|---------------|----------------------|
| Garmin | `icu_garmin_health === true` | `icu_garmin_sync_activities === true` |
| Polar | `polar_scope !== null` | `polar_scope !== null && polar_sync_activities === true` |
| Suunto | `suunto_user_id !== null` | `suunto_user_id !== null && suunto_sync_activities === true` |
| Coros | `coros_user_id !== null` | `coros_user_id !== null && coros_sync_activities === true` |
| Wahoo | `wahoo_user_id !== null` | `wahoo_user_id !== null && wahoo_sync_activities === true` |
| Amazfit/Zepp | `zepp_user_id !== null` | `zepp_user_id !== null && zepp_sync_activities === true` |
| Huawei | `huawei_user_id !== null` | `huawei_user_id !== null && huawei_sync_activities === true` |
| Strava | `strava_id !== null` | `strava_id !== null && strava_authorized === true` |

Upload workouts check (where supported): `icu_garmin_upload_workouts`, `suunto_upload_workouts`, `coros_upload_workouts`, `wahoo_upload_workouts`, `zepp_upload_workouts`, `huawei_upload_workouts`.

**Strava note:** Strava is detected but flagged as restricted. If Strava is the *only* activity source, the user gets a warning that data quality may be limited due to Strava API restrictions, and a recommendation to connect their watch directly instead.

**Edge case — connected but sync disabled:** If a platform link exists but activity sync is off (e.g. `polar_scope !== null` but `polar_sync_activities === false`), show: "Your **Polar** is connected but activity sync is turned off. Enable it in Intervals.icu → Settings → Connections." This is more helpful than "no connection detected."

### Three UI states

#### State 1: Direct watch connected (green)

At least one non-Strava platform has `syncActivities === true`.

Show: green checkmark, detected platform name(s), proceed via Next.

> ✓ Your **Garmin** is connected and syncing activities.

If `uploadWorkouts` is also true for the platform:

> Planned workouts will sync to your watch automatically.

If `uploadWorkouts` is false:

> Your runs will sync to Springa. To get planned workouts on your watch, enable "Upload planned workouts" in Intervals.icu settings.

#### State 2: No connection detected (yellow)

No platform has `syncActivities === true` (or only Strava is connected).

Show: "Springa needs your watch connected to Intervals.icu to read your runs."

Then: **"What watch do you use?"** with selectable options:

**Direct connection watches** (Garmin, Polar, Suunto, Coros, Wahoo, Amazfit):

> Go to **Intervals.icu → Settings → Connections** and connect your [platform]. Come back here when it's done.

With a link to `https://intervals.icu/settings` and a **"Check again"** button that re-fetches connection status.

**Apple Watch:**

> Install **HealthFit** ($7, one-time) on your iPhone. It auto-syncs Apple Watch runs to Intervals.icu in the background.

With a link to the App Store listing and a **"Check again"** button.

**Wear OS / Samsung Galaxy Watch:**

> Install **Health Sync** (~$3, one-time) on your phone. It auto-syncs your watch runs to Intervals.icu in the background.

With a link to the Google Play listing and a **"Check again"** button.

#### State 3: No watch

Triggered when the user selects **"I don't have a running watch"** from the watch selector in State 2. This is an explicit option at the bottom of the watch list, visually distinct from the watch brands.

> Springa needs run data from a GPS watch with a heart rate sensor to work. It generates structured workouts with HR zone targets and analyzes your compliance — that requires a watch on your wrist.

**Blocked.** Next button disabled. Back button available. No skip option.

### "Check again" behavior

The button calls `GET /api/intervals/connections` and updates the UI. If a connection is now detected, transition to State 1 (green). The user stays on this step until a connection is verified or they go back.

### Strava-only warning

If the only connected platform is Strava:

> ⚠ Strava is connected, but has API restrictions that limit data quality. For the best experience, connect your watch directly to Intervals.icu instead.

Show platform-specific instructions below (same as State 2), plus a **"Continue with Strava anyway"** link that allows proceeding. Not blocked, but warned.

## API Implementation

### New endpoint: `GET /api/intervals/connections`

```typescript
// app/api/intervals/connections/route.ts
// 1. Get user's API key from credentials
// 2. Fetch GET https://intervals.icu/api/v1/athlete/0
// 3. Extract connection fields
// 4. Return ConnectionStatus
```

### New function in `lib/intervalsApi.ts`

```typescript
export async function fetchConnectionStatus(apiKey: string): Promise<ConnectionStatus>
```

Extracts the platform connection fields from the athlete profile response. The profile is already fetched by `fetchAthleteProfile()` — this function reads additional fields from the same endpoint.

Implementation note: `fetchAthleteProfile()` already calls `GET /athlete/0` and discards most of the response. `fetchConnectionStatus()` should NOT make a second call to the same endpoint. Instead, create a shared `fetchAthleteRaw(apiKey)` that returns the full response, then have both `fetchAthleteProfile()` and `fetchConnectionStatus()` extract their respective fields from it. The wizard's IntervalsStep can call `fetchAthleteRaw()` once and pass the result to both consumers.

## Step Numbering

The wizard's `Step` type in `setup/page.tsx` changes from `1 | 2 | 3 | 4 | 5 | 6 | 7` to `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`. All steps after the new WatchStep (3) shift by one. The step indicator dots and "Step X of Y" text need updating.

## Non-Goals

- No persistent storage of connection status — always fetched live from Intervals.icu.
- No post-wizard monitoring or nudges (could be added later but not in this spec).
- No landing page changes — the watch requirement is communicated in the wizard only.
- No changes to steps 4-8.
- No Intervals Companion v3 support (still in beta as of April 2026). If/when it releases, Apple Watch users get a better option, but HealthFit works today.

## Testing

- **Unit test:** `fetchConnectionStatus()` with mocked API responses for each platform combination (Garmin connected, nothing connected, Strava-only, multiple platforms).
- **Integration test:** WatchStep renders correct state based on connection status (green/yellow/red).
- **Integration test:** "Check again" button re-fetches and updates UI.
- **Integration test:** WelcomeStep shows "What you'll need" checklist.
- **Integration test:** IntervalsStep shows data flow diagram and updated title.

All tests use MSW for network mocking per project conventions.
