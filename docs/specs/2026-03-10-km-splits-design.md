# Km Splits — Design Spec

## Summary

Add a per-km pace splits section to the completed run modal. Shows km number, pace, a zone-colored horizontal bar, elevation change, and average HR for each full kilometer — matching Strava's splits table layout.

This also includes renaming the `bg_cache` database table to `activity_streams` and adding a `distance` column to it.

## Design Decisions

### Columns (Strava-style)

| Column | Source | Notes |
|--------|--------|-------|
| Km | Computed from distance stream | 1-indexed |
| Pace | Time delta between km boundaries | min:sec /km |
| Bar | Derived from pace | Zone-colored, no background track |
| Elev | Altitude delta across km | meters, signed |
| HR | Average heartrate across km | bpm |

### Partial last km

Only show full km splits. A 6.02 km run shows 6 rows (km 1–6). A 5.89 km run shows 5 rows.

**Correction:** Looking at this again — a 6.02 km run has only 5 *full* kilometers (0→1, 1→2, 2→3, 3→4, 4→5). The remaining 1.02 km is partial. Show 5 rows.

Wait — need to reconsider. The 6th km boundary is at 6000m. If the run is 6028m, then km 6 (5000→6000) IS a full km. The leftover is 28m. So 6 full km rows. The rule: show rows for every km boundary the runner crosses. `Math.floor(totalDistance / 1000)` rows.

### Bar design

- **No background track.** Bars extend from the left edge with no container. Avoids implying a maximum that doesn't exist.
- **Color:** Determined by which pace zone the split falls in.
  - Green = Easy (≥7:00/km)
  - Blue = Race Pace (5:35–6:59/km)
  - Orange = Interval (5:05–5:34/km)
  - Red = Hard (<5:05/km)
  - Zone boundaries come from the runner's pace zones, not hardcoded.
- **Width:** `(speed / maxSpeed)²` where speed = 60/pace and maxSpeed = fastest split's speed. The squaring amplifies real pace differences while keeping tiny differences tight. Without it, speed-proportional bars compress a genuine 1 min/km difference (e.g., 6:52 vs 8:01) into a ~15% visual difference. With squaring, that becomes ~27%. Meanwhile a 3-second spread (5:15 vs 5:18) stays at ~98-100% — nearly identical, as it should be.

```
// Squared speed ratio: amplifies real pace differences (e.g. 6:52 vs 8:01)
// while keeping trivial ones tight (e.g. 5:15 vs 5:18).
// Linear speed ratio only shows ~15% visual difference for a full min/km gap
// because speed (km/h) compresses pace differences. Squaring restores
// perceptual proportion without distorting small variations.
const speed = 60 / paceMinPerKm;
const maxSpeed = 60 / fastestSplitPace;
const barWidth = Math.round(Math.pow(speed / maxSpeed, 2) * 100);
```

### Placement

Movable section — the user controls section ordering (same pattern as Intel screen widgets). No fixed position in the modal.

### Data source

**Distance stream from Intervals.icu API.** The `distance` stream key returns cumulative distance in meters at each second. Already confirmed available (tested with activity i130922785: 2659 points, 0.0 → 6028.21m).

Stored in the database alongside other streams. Used at render time to compute splits — no precomputation needed.

## Database Changes

### Rename `bg_cache` → `activity_streams`

The table stores glucose, HR, pace, cadence, altitude, category, fuel_rate, run_bg_context, and activity_date per activity. It hasn't been a "BG cache" for a long time. Rename to reflect what it actually holds.

**Migration:** `ALTER TABLE bg_cache RENAME TO activity_streams;`

All references in code:
- `lib/db.ts` — schema DDL
- `lib/bgCacheDb.ts` — read/write functions (rename file to `activityStreamsDb.ts`)
- `lib/intervalsApi.ts` — comment referencing bg_cache
- `lib/runAnalysisDb.ts` — JOIN query
- `app/api/debug/bg-coverage/route.ts` — debug query
- `scripts/clear-bg-cache.ts` — maintenance script (rename to `clear-activity-streams.ts`)
- `scripts/check-bg-coverage.ts` — debug script
- `lib/__tests__/routes.test.ts` — test cleanup

### Add `distance` column

Add `distance TEXT` to `activity_streams` (the renamed table). Stores JSON array of cumulative distance values in meters, matching the Intervals.icu `distance` stream.

**Migration:** `ALTER TABLE activity_streams ADD COLUMN distance TEXT;`

**Stream fetch:** Add `"distance"` to the keys array in `fetchStreams()` in `lib/intervalsApi.ts`.

**Cache write:** Add distance to the INSERT in `activityStreamsDb.ts`.

## Splits Computation

Pure function: `computeKmSplits(streams: { distance, time, pace, heartrate, altitude })` → `KmSplit[]`

```typescript
interface KmSplit {
  km: number;           // 1-indexed
  paceMinPerKm: number; // e.g. 6.95 = 6:57/km
  avgHr: number | null;
  elevChange: number;   // meters, signed
}
```

Algorithm:
1. Walk the distance array to find indices where cumulative distance crosses each 1000m boundary.
2. For each full km (boundary[n-1] to boundary[n]):
   - Pace = time delta in seconds / 1000m × (1000/60) → min/km
   - Avg HR = mean of heartrate values in that index range
   - Elev change = altitude[end] - altitude[start]
3. Skip the partial last segment.

## Component

`KmSplitsSection` — self-contained React component.

**Props:**
- `streamData: StreamData` (with distance added)
- `paceZones` or `hrZones` + `lthr` for bar coloring

**Renders:**
- Section header "Splits"
- Grid table: Km | Pace | Bar | Elev | HR
- Zone legend (colored dots)
- Skeleton loader when `isLoadingStreamData` is true
- Returns null if no distance stream available

## Files to Create/Modify

**New:**
- `lib/splits.ts` — `computeKmSplits()` pure function + `KmSplit` type
- `app/components/KmSplitsSection.tsx` — UI component

**Modify:**
- `lib/db.ts` — rename table in DDL, add distance column
- `lib/bgCacheDb.ts` → `lib/activityStreamsDb.ts` — rename file + all table refs + add distance
- `lib/intervalsApi.ts` — add "distance" to stream keys, update bg_cache comment
- `lib/types.ts` — add `distance?: DataPoint[]` to `StreamData`
- `lib/runAnalysisDb.ts` — update table name in query
- `app/components/EventModal.tsx` — add KmSplitsSection as movable section
- `app/api/debug/bg-coverage/route.ts` — update table name
- `scripts/clear-bg-cache.ts` → `scripts/clear-activity-streams.ts`
- `scripts/check-bg-coverage.ts` — update table name
- `lib/__tests__/routes.test.ts` — update table name
