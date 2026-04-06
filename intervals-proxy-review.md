# PR #128 Review: intervals-proxy Branch

## Summary

Reviewed the `intervals-proxy` branch which refactors all Intervals.icu API calls to go through authenticated server-side proxy routes instead of direct client-side calls. The API key is removed from client code entirely.

## 1. Async Route Params ✅ CORRECT

All route handlers with `[id]` segments correctly implement Next.js 16 async params pattern:

**`app/api/intervals/activity/[id]/route.ts`:**
```typescript
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // ...
  const { id } = await params;
  // ...
}
```

**`app/api/intervals/events/[id]/route.ts`:**
```typescript
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // ...
  const { id } = await params;
  // ...
}
```

Both routes properly await the params promise before accessing the `id` property. This is the correct Next.js 16 pattern.

## 2. SWR Key Changes - POTENTIAL STALE DATA ISSUE ⚠️

### `useSharedCalendarData()`

**Before:**
```typescript
const { data: events } = useSWR<CalendarEvent[], Error>(
  apiKey ? ["calendar-data", apiKey] : null,
  async ([, key]: readonly [string, string]) => {
    // ...
  }
);
```

**After:**
```typescript
const { data: events } = useSWR<CalendarEvent[], Error>(
  "calendar-data",
  async () => {
    // ...
  }
);
```

**Problem:** The SWR key no longer includes user identity. In a multi-user app, this will cause cache collisions:

1. User A logs in → fetches calendar → cached as `"calendar-data"`
2. User A logs out
3. User B logs in → SWR returns cached data from User A's session

**Why this happens:**
- SWR cache is per-browser-tab, not per-server-session
- The proxy route (`/api/intervals/calendar`) correctly uses server-side auth to fetch the right user's data
- But SWR doesn't know a new user logged in — same key = same cached data

**Fix needed:** Include user identity in the SWR key:
```typescript
const email = useAtomValue(userEmailAtom); // or derive from settingsAtom
const { data: events } = useSWR<CalendarEvent[], Error>(
  email ? ["calendar-data", email] : null,
  async () => {
    // ...
  }
);
```

This same pattern issue exists in:
- `useActivityStream()` — key is `["activity-stream", activityId]`
- `usePaceCurves()` — key is `["pace-curves", curveId]`

All of these will serve stale data across user sessions unless the user identity is part of the key.

### `useStreamCache()` — NOT AN SWR HOOK

`useStreamCache` doesn't use SWR, so the removal of `apiKey` from its dependency array is fine. It's a custom hook with `useEffect` that manages its own cache. The dependency array change from `[apiKey, enabled, runs]` to `[enabled, runs]` is correct because:
- The hook no longer needs `apiKey` (calls proxy routes instead)
- The effect should re-run when `enabled` or `runs` changes
- Adding `apiKey` would be a stale closure bug if it were still in scope

## 3. `useStreamCache` Dependency Array ✅ CORRECT

**Before:**
```typescript
useEffect(() => {
  if (!apiKey || !enabled || loadedRef.current || runs.length === 0) return;
  // ...
}, [apiKey, enabled, runs]);
```

**After:**
```typescript
useEffect(() => {
  if (!enabled || loadedRef.current || runs.length === 0) return;
  // ...
}, [enabled, runs]);
```

This is correct. The hook no longer uses `apiKey`, so it's correctly removed from both the guard clause and the dependency array.

## 4. `useSharedCalendarData()` Before Auth Ready ⚠️ RACE CONDITION

**Current implementation:**
```typescript
export function useSharedCalendarData() {
  const { data: events } = useSWR<CalendarEvent[], Error>(
    "calendar-data",
    async () => {
      const start = startOfMonth(subMonths(new Date(), CALENDAR_LOOKBACK_MONTHS));
      const end = endOfMonth(addMonths(new Date(), 6));
      return fetchCalendar(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
    },
    // ...
  );
}
```

**The hook always fetches.** It doesn't check if the user is authenticated or if Intervals.icu is connected. This causes:

1. **On app load (no auth yet):** The fetch fires immediately, hits `/api/intervals/calendar`, which returns 401 Unauthorized
2. **After login:** The hook needs to be manually revalidated (via `calendarReloadAtom`) because the SWR key doesn't change

**Expected behavior:** The hook should be gated on auth/connection state:
```typescript
const connected = useAtomValue(intervalsConnectedAtom);
const { data: events } = useSWR<CalendarEvent[], Error>(
  connected ? "calendar-data" : null,
  async () => {
    // ...
  }
);
```

**But there's a chicken-and-egg problem:**
- `intervalsConnectedAtom` derives from `settingsAtom`
- `settingsAtom` is populated by `useHydrateStore()` which calls `/api/settings`
- Settings load is async — there's a window where `connected = false` even for authenticated users

**Current mitigation in `useHydrateStore`:**
```typescript
const cal = useSharedCalendarData();
// ...
useEffect(() => {
  setCalEvents(cal.events);
  setCalLoading(cal.isLoading);
  setCalError(cal.error);
}, [cal.events, cal.isLoading, cal.error, /* ... */]);
```

The hook runs immediately on mount. If the user is authenticated, the server-side route will succeed. If not, it fails with 401, and `cal.error` will be set. The app handles this gracefully (shows empty state), but it's a wasted request.

**Recommendation:** Gate the SWR key on `intervalsConnectedAtom`:
```typescript
export function useSharedCalendarData() {
  const connected = useAtomValue(intervalsConnectedAtom);
  const { data: events, error, isLoading, mutate } = useSWR<CalendarEvent[], Error>(
    connected ? "calendar-data" : null,
    async () => {
      // ...
    }
  );
}
```

This prevents the fetch until settings confirm the user has an API key configured.

## 5. `intervalsConnectedAtom` Usage ✅ CORRECT

**Definition:**
```typescript
export const intervalsConnectedAtom = atom((get) => get(settingsAtom)?.intervalsConnected ?? false);
```

**Settings route populates it:**
```typescript
// app/api/settings/route.ts
const creds = await getUserCredentials(email);
if (creds?.intervalsApiKey) {
  settings.intervalsConnected = true;
  // ...
}
```

**Components use it correctly:**
- `PlannerScreen`: Guards plan generation with `if (!connected) { setStatusMsg("Intervals.icu not connected"); return; }`
- `CalendarView`: No direct usage (uses `initialEvents` prop)

The atom correctly reflects whether the user has an Intervals.icu API key configured. Components that need to check connection status are using it properly.

## Additional Findings

### Missing User Email Atom

The app tracks `settingsAtom` and `intervalsConnectedAtom`, but doesn't expose a `userEmailAtom` for SWR keys. The email is available server-side via `requireAuth()`, but there's no client-side atom for it. This is the missing piece for fixing the SWR cache collision issue.

**Suggested addition to `app/atoms.ts`:**
```typescript
export const userEmailAtom = atom<string | null>(null);
```

**Populate in `useHydrateStore`:**
```typescript
useEffect(() => {
  fetch("/api/settings")
    .then((r) => r.json())
    .then((data: UserSettings) => {
      setSettings(data);
      if (data.email) setUserEmail(data.email); // if settings route returns it
      // ...
    });
}, []);
```

Or create a dedicated `/api/whoami` route that returns `{ email: string }`.

### Test Coverage

The tests correctly remove `apiKey` props and update mock endpoints to use proxy routes (`/api/intervals/*`). MSW handlers cover both the external Intervals.icu API (used by server routes) and the proxy routes (used by client hooks). This is good architecture.

## Summary of Issues

| Issue | Severity | Files Affected |
|-------|----------|----------------|
| SWR keys missing user identity → cache collisions across sessions | **HIGH** | `useSharedCalendarData`, `useActivityStream`, `usePaceCurves` |
| `useSharedCalendarData` fetches before auth ready | **LOW** | `useSharedCalendarData` |
| No client-side user email atom for SWR keys | **MED** | `app/atoms.ts`, need `/api/whoami` or extend `/api/settings` |

## Recommendations

1. **Add user email to SWR keys** to prevent cache collisions in multi-user scenarios
2. **Gate `useSharedCalendarData` on `intervalsConnectedAtom`** to avoid wasted 401 requests
3. **Expose user email client-side** via a dedicated atom populated from `/api/settings` or `/api/whoami`
4. **Apply the same pattern** to `useActivityStream` and `usePaceCurves`

## Files Reviewed

- `/Users/persjo/code/private/Springa/app/api/intervals/activity/[id]/route.ts`
- `/Users/persjo/code/private/Springa/app/api/intervals/events/[id]/route.ts`
- `/Users/persjo/code/private/Springa/app/api/intervals/calendar/route.ts`
- `/Users/persjo/code/private/Springa/app/hooks/useSharedCalendarData.ts`
- `/Users/persjo/code/private/Springa/app/hooks/useStreamCache.ts`
- `/Users/persjo/code/private/Springa/app/hooks/useActivityStream.ts`
- `/Users/persjo/code/private/Springa/app/hooks/usePaceCurves.ts`
- `/Users/persjo/code/private/Springa/app/hooks/useHydrateStore.ts`
- `/Users/persjo/code/private/Springa/app/atoms.ts`
- `/Users/persjo/code/private/Springa/lib/intervalsClient.ts`
- `/Users/persjo/code/private/Springa/lib/apiHelpers.ts`
- `/Users/persjo/code/private/Springa/lib/settings.ts`
