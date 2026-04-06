# Multi-User Audit — 2026-04-06

Full data flow audit of all integrations for multi-user correctness.

## What's Solid

- **Auth layer:** Every API route calls `requireAuth()`, returns 401 on failure, scopes DB queries by email.
- **Credential storage:** AES-256-GCM encrypted in Turso, per-user, decrypted on-demand.
- **Nightscout:** `fetchFromNS(url, secret)` takes explicit params — no globals, no module-level state.
- **Google Calendar:** `getGoogleCalendarContext(email)` resolves refresh token per-user.
- **Cron job:** Iterates per-user with isolated credentials per iteration.
- **BG model:** Computed per-user from their own activity streams. No shared state.
- **DB isolation:** All tables keyed by email. Parameterized queries everywhere.

## Issues Found

### 1. Intervals.icu API Key on the Client (HIGH)

The Intervals.icu API key is decrypted server-side and returned to the browser via `GET /api/settings`. The client stores it in `apiKeyAtom` and uses it for direct client-to-Intervals.icu calls.

**Affected callers:**

| Client file | Function | Read/Write |
|---|---|---|
| `useSharedCalendarData.ts:21` | `fetchCalendarData(key, ...)` | Read |
| `useStreamCache.ts:69` | `fetchStreamBatch(apiKey, ...)` | Read |
| `usePaceCurves.ts:16` | `fetchPaceCurves(apiKey, ...)` | Read |
| `useActivityStream.ts:22` | SWR fetch with apiKey | Read |
| `IntelScreen.tsx:240` | `fetchActivityById(apiKey, ...)` | Read |
| `useDragDrop.ts:64` | `updateEvent(apiKey, ...)` | Write |
| `PlannerScreen.tsx:103` | `uploadToIntervals(apiKey, ...)` | Write |
| `PlannerScreen.tsx:228` | `updateEvent(apiKey, ...)` | Write |
| `WorkoutGenerator.tsx:87` | `replaceWorkoutOnDate(apiKey, ...)` | Write |
| `EventModal.tsx:164` | `updateEvent(apiKey, ...)` | Write |

**Why it matters:**
- Key visible in browser memory and devtools network tab
- Any XSS exposes full Intervals.icu account access
- Prevents server-side rate limiting or auditing
- Conflates client and server responsibilities

**Fix:** Proxy all Intervals.icu calls through Springa API routes. Key never leaves the server.

### 2. No middleware.ts (MEDIUM)

No auth guard at the edge. Auth is per-route via `requireAuth()`, which works but:
- Every new route must remember the auth check
- No redirect-to-login for unauthenticated page requests (client-side redirect only)
- A new route without `requireAuth()` = open endpoint

### 3. No Approval Gate (MEDIUM)

Any Google account gets full access after the wizard. No admin approval. The memory mentions an `approved` flag but it doesn't exist in the schema. Matters if Springa should be invite-only.

### 4. localStorage Not Scoped to User (LOW)

Keys `bgcache_v2`, `springa:modal-widget-layout`, `springa-theme` are global. If user A logs out and user B logs in on the same browser, B briefly sees A's cached data before server response overwrites it.

### 5. No Atom Cleanup on Sign-Out (LOW)

`SettingsModal.tsx:158` calls `signOut()` without clearing Jotai atoms. Brief window where stale user data sits in memory during redirect.

### 6. Double requireAuth in run-feedback POST (TRIVIAL)

`app/api/run-feedback/route.ts:158` calls `requireAuth()` and discards the result, then calls it again at line 177. Wasteful.

### 7. Google Calendar Silent Failures (UX)

`syncToGoogleCalendar()` catches all errors and only `console.warn`s. If the refresh token expires or calendar is deleted, the user has no idea syncing stopped.

### 8. validateApiSecretFromDB Correctness (UNKNOWN)

`credentials.ts:138-161` tries to match incoming API secret against `nightscout_secret` in DB. But NS secrets are stored encrypted (AES-256-GCM), while this function compares SHA-1 hashes. May be dead code from old architecture — needs verification.

## Priority

| # | Issue | Effort |
|---|---|---|
| 1 | API key on client → proxy | Large |
| 2 | Add middleware.ts | Small |
| 3 | Approval gate | Small |
| 4 | Scope localStorage | Small |
| 5 | Atom cleanup on signout | Small |
| 6 | Double requireAuth | Trivial |
| 7 | Google Calendar errors | Medium |
| 8 | validateApiSecretFromDB | Small |
