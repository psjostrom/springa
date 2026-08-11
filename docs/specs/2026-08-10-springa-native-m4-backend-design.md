# Springa Native Milestone 4 Backend Design

## Goal

Provide the server-owned API surface springa-native needs to display and manage a planned workout without calling Intervals.icu or SMHI directly or porting Springa workout, prescription, weather, or clothing logic.

## Scope

This change adds:

- Planned-workout detail by stable calendar event identity.
- Server-derived workout structure, duration, distance, fuel rate, and prescribed total carbs.
- Server-derived clothing recommendations for Kallhäll, Järfälla.
- Bearer-authenticated pre-run carbs, move, replace, and delete operations.
- Server-owned intent replacement using existing workout generation and plan context.

This change does not add configurable locations, geolocation, new dependencies, database schema, native code, deployment, or production access.

## API Shape

The existing Intervals proxy remains the single resource family. No parallel planned-workout API is added.

### Event identity

Routes that address a calendar event accept either the canonical Springa identity `event-123` or legacy numeric form `123`. Both resolve to positive safe integer `123`. Other prefixes, decimals, zero, negative values, and unsafe integers return `400`.

Responses always return both forms:

```json
{
  "id": "event-123",
  "intervalsEventId": 123
}
```

### Planned detail

`GET /api/intervals/events/{id}` reads the event from Intervals.icu and returns a stable, display-ready contract:

```ts
type PlannedWorkoutDetail = {
  event: {
    id: `event-${number}`;
    intervalsEventId: number;
    startDateLocal: string;
    name: string;
    category: "easy" | "long" | "interval" | "race" | "other";
    description: string;
  };
  structure: {
    sections: Array<{
      name: string;
      repeats: number | null;
      steps: Array<{
        label: string | null;
        duration: string;
        zone: "z1" | "z2" | "z3" | "z4" | "z5";
        detail: string;
      }>;
    }>;
    timeline: Array<{
      durationMinutes: number;
      intensityPercent: number;
      zone: "z1" | "z2" | "z3" | "z4" | "z5";
      estimated: boolean;
    }>;
  };
  metrics: {
    duration: { minutes: number; estimated: boolean } | null;
    distance: { km: number; estimated: boolean } | null;
    fuelRateGPerHour: number | null;
    prescribedCarbsG: number | null;
  };
  preRunCarbsG: number | null;
  clothing:
    | {
        status: "available";
        recommendation: ClothingRecommendation;
      }
    | {
        status: "unavailable";
        reason: "outside-window" | "forecast-unavailable";
      };
};
```

Example:

```http
GET /api/intervals/events/event-123
Authorization: Bearer <mobile-token>
```

```json
{
  "event": {
    "id": "event-123",
    "intervalsEventId": 123,
    "startDateLocal": "2026-08-13T12:00:00",
    "name": "W05 Easy",
    "category": "easy",
    "description": "Warmup\n- 10m 6:30-7:00/km Pace"
  },
  "structure": {
    "sections": [
      {
        "name": "Warmup",
        "repeats": null,
        "steps": [
          {
            "label": null,
            "duration": "10m",
            "zone": "z2",
            "detail": "6:30-7:00 /km"
          }
        ]
      }
    ],
    "timeline": [
      {
        "durationMinutes": 10,
        "intensityPercent": 79,
        "zone": "z2",
        "estimated": false
      }
    ]
  },
  "metrics": {
    "duration": { "minutes": 65, "estimated": false },
    "distance": { "km": 9.2, "estimated": true },
    "fuelRateGPerHour": 60,
    "prescribedCarbsG": 65
  },
  "preRunCarbsG": 25,
  "clothing": {
    "status": "available",
    "recommendation": {
      "upper": ["T-shirt"],
      "lower": ["Shorts"],
      "accessories": [],
      "weather": {
        "temp": 16,
        "feelsLike": 16,
        "windSpeed": 2,
        "precipitation": 0,
        "isRain": false,
        "isSnow": false
      }
    }
  }
}
```

A supported workout with an unparseable or uncalibrated prescription still returns `200`. Its raw event fields remain available; `sections` and `timeline` may be empty and derived metrics may be `null`. The server never guesses missing values.

Loading is native client state while this request is pending. The API does not return a loading variant.

### Move

The existing update route remains compatible:

```http
PUT /api/intervals/events/event-123
Authorization: Bearer <mobile-token>
Content-Type: application/json

{ "start_date_local": "2026-08-14T12:00:00" }
```

```json
{ "ok": true }
```

The date must be a valid timezone-naive local ISO timestamp. Bearer callers may only update `start_date_local`. Cookie-session web callers retain the existing `name`, `description`, and `carbs_per_hour` fields used by current web behavior.

### Replace

Native sends intent only:

```http
POST /api/intervals/events/replace
Authorization: Bearer <mobile-token>
Content-Type: application/json

{ "existingEventId": "event-123", "category": "quality" }
```

Supported categories are `easy`, `quality`, `long`, and `club`. Unknown fields, missing identity, and other categories return `400`.

The server fetches the target event, resolves the user's complete generation context, calls `generateSingleWorkout`, and updates the same Intervals event in place. It writes the generated name, description, start time, external ID, type, and fuel rate. Stable identity prevents same-date upsert collisions and preserves create-first/delete-old data-loss safety by removing that sequence entirely.

After the Intervals update succeeds, saved pre-run carbs are reset. A reset failure returns `500` with `code: "LOCAL_CLEANUP_FAILED"`; retrying is safe because the Intervals update is idempotent.

The response keeps the current contract:

```json
{ "newId": 123 }
```

Cookie-session web callers retain the legacy `{ existingEventId, workout }` request. Bearer callers cannot use that request or submit generated descriptions, fuel calculations, or other workout output.

When no existing ID is supplied by a legacy cookie caller, existing create behavior remains unchanged.

### Delete

```http
DELETE /api/intervals/events/event-123
Authorization: Bearer <mobile-token>
```

```json
{ "ok": true }
```

After Intervals deletion succeeds, the server removes saved pre-run carbs. Intervals `404` means already deleted and still proceeds through local cleanup, making retries safe. Other upstream failures leave local carbs untouched.

### Pre-run carbs

Existing routes remain:

```http
GET /api/prerun-carbs?eventId=event-123
Authorization: Bearer <mobile-token>
```

```json
{ "carbsG": 25 }
```

```http
POST /api/prerun-carbs
Authorization: Bearer <mobile-token>
Content-Type: application/json

{ "eventId": "event-123", "carbsG": 25 }
```

```json
{ "ok": true }
```

`carbsG` must be `null` or a finite nonnegative integer. `DELETE /api/prerun-carbs?eventId=event-123` keeps `{ "ok": true }`. Storage always uses the normalized numeric event ID string.

## Authentication and Validation

Every affected handler passes the request's headers to existing `requireAuth({ headerList: req.headers })`. Cookie auth remains preferred. Without a valid cookie, a signed mobile Bearer token resolves the same user email.

Mobile-controlled input is validated before any database or Intervals mutation. Bearer presence also selects the restricted mobile field allowlist; it does not broaden authority.

Existing flat error strings remain compatible. Stable codes are added at top level when useful:

```json
{
  "error": "Event is not a planned workout",
  "code": "UNSUPPORTED_EVENT"
}
```

Status behavior:

| Condition | Status | Code |
| --- | ---: | --- |
| Missing or invalid auth | 401 | existing response, no code required |
| Invalid identity, JSON, field, date, carbs, or category | 400 | `INVALID_INPUT` |
| Intervals event does not exist | 404 | `EVENT_NOT_FOUND` |
| Event is not a planned workout | 422 | `UNSUPPORTED_EVENT` |
| Required plan settings or LTHR are absent | 422 | `PLAN_SETTINGS_REQUIRED` |
| Event date is outside configured plan | 422 | `DATE_OUTSIDE_PLAN` |
| Intervals request fails | 502 | `UPSTREAM_ERROR` |
| Optional SMHI request fails | 200 detail response | clothing `forecast-unavailable` |
| Intervals mutation succeeds but local reset fails | 500 | `LOCAL_CLEANUP_FAILED` |

## Server Ownership

### Planned detail resolver

One resolver owns the response contract. It calls existing Springa functions rather than reimplementing their rules:

- `parseWorkoutStructure` for display sections.
- `parseWorkoutSegments` and existing zone classifiers for the timeline.
- `resolveWorkoutMetrics` for duration and distance.
- `calculateCanonicalPlannedPrescription` for prescribed carbs.
- `recommendClothing` for clothing.

The route fetches the source Intervals event on every request. It does not cache event metadata in Turso.

### Replacement context resolver

One server resolver owns every `PlanConfig` input:

| Field | Resolution |
| --- | --- |
| `bgModel` | `null` when diabetes mode is off or no cached activities exist; otherwise `buildBGModelFromCached(getActivityStreams(email))` |
| `raceDateStr` | Required stored `raceDate` |
| `raceDist` | Stored value or `16` |
| `totalWeeks` | Required stored value |
| `startKm` | Stored value or `8` |
| `lthr` | Required live Intervals running-profile value |
| `hrZones` | `computeMaxHRZones(profile.maxHr ?? DEFAULT_MAX_HR)`, matching current web settings semantics |
| `effortMetric` | `normalizeEffortMetric(settings.effortMetric)` |
| Remaining plan fields | Stored `includeBasePhase`, `diabetesMode`, `runDays`, `longRunDay`, `clubDay`, `clubType`, `currentAbilitySecs`, and `currentAbilityDist`; generator defaults remain authoritative |

Fuel rate continues through existing `getCurrentFuelRate`. Phase and pace remain inside existing generator functions. `generateSingleWorkout` returning `null` maps to `DATE_OUTSIDE_PLAN`.

### Pre-run carbs

One persistence library owns all pre-run-carb reads, saves, and deletes. Planned detail, `/api/prerun-carbs`, replacement cleanup, event deletion cleanup, and run-feedback use it. No route duplicates SQL.

## Weather and Clothing

SMHI coordinates become fixed Kallhäll, Järfälla coordinates:

```ts
const LAT = 59.45;
const LON = 17.81;
```

This replaces Enskede for both existing web weather and the new backend. No user setting or geolocation is introduced.

Eligibility remains identical to current web behavior: planned/race workouts from 12 hours ago through 3 days ahead. The server preserves raw `start_date_local` in JSON and converts it with `localToUtcMs(start_date_local, userTimezone)` before eligibility and nearest-forecast matching. This avoids Vercel UTC, CET, CEST, and DST drift.

No forecast within three hours, an empty forecast, or an SMHI error returns clothing `forecast-unavailable`; planned detail remains usable.

## Mutation Consistency

Native refreshes `GET /api/intervals/calendar` after successful move, replacement, or deletion. No additional invalidation endpoint or server-side calendar cache is added.

Replacement and deletion order external mutation before local cleanup. This prevents removing pre-run carbs while the original Intervals event still exists. Explicit partial-failure responses make safe retries possible.

## Testing

Mostly route-handler integration tests, with real Springa logic and mocked boundaries only:

- In-memory libsql for user settings, credentials, activity streams, and pre-run carbs.
- MSW for Intervals.icu and SMHI.
- Real mobile JWT signing and verification through `requireAuth`.

Coverage includes:

- Detail success with parsed structure, calibrated metrics, prescription, pre-run carbs, and clothing.
- Empty/null derived fields and unavailable weather.
- Kallhäll forecast URL.
- CET, CEST, and clothing-window boundaries.
- Invalid, missing, unsupported, and upstream event responses.
- Cookie-first, valid Bearer, invalid Bearer, and missing-auth behavior.
- Bearer rejection of descriptions, fuel, and legacy replacement payloads.
- Valid and invalid move, pre-run carbs, replacement, and deletion.
- In-place replacement identity and regression coverage for same-ID/same-date collision.
- Server-generated replacement across pace, HR, and feel; diabetes on/off; BG model/no model; incomplete settings; and out-of-plan dates.
- Pre-run-carb reset on replacement and cleanup on deletion.
- Existing web client request and error contracts.

Verification runs focused tests first, then test discovery comparison, full Vitest suite, TypeScript, ESLint, Next production build, and isolated backend request flows.
