# Google Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push planned workouts to a dedicated "Springa" Google Calendar alongside every Intervals.icu write, enabling Strimma's pre-activity BG guidance.

**Architecture:** Extend the existing NextAuth Google OAuth to request calendar scope and store refresh tokens. A new `lib/googleCalendar.ts` module handles all Google Calendar API calls. Each Intervals.icu write path (bulk upload, adapt sync, manual edit/move/delete, drag-drop) gets a parallel best-effort Google Calendar write. Events are matched by name+date on a dedicated "Springa" calendar.

**Tech Stack:** Next.js 16, NextAuth v5, Google Calendar API v3 (REST, no SDK), Turso/libsql, Vitest + MSW

**Spec:** `docs/specs/2026-03-26-google-calendar-sync-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `lib/googleCalendar.ts` | Google Calendar API client: token exchange, calendar CRUD, event CRUD, description formatting |
| `lib/__tests__/googleCalendar.test.ts` | Unit tests for googleCalendar module |

### Modified Files

| File | Change |
|------|--------|
| `lib/auth.ts` | Add calendar scope, offline access, dynamic consent prompt, store refresh token |
| `lib/credentials.ts` | Add `getGoogleCalendarCredentials()` and `updateGoogleCalendarCredentials()` |
| `lib/db.ts` | Add `google_refresh_token` and `google_calendar_id` columns to `SCHEMA_DDL` |
| `app/screens/PlannerScreen.tsx` | Add Google Calendar sync after bulk upload and adapt sync |
| `app/components/EventModal.tsx` | Add Google Calendar sync after manual date edit |
| `app/components/CalendarView.tsx` | Add Google Calendar sync after manual delete |
| `app/hooks/useDragDrop.ts` | Add Google Calendar sync after drag-drop move |
| `lib/__tests__/msw/handlers.ts` | Add Google Calendar API mock handlers |

---

### Task 1: Schema — Add Google Calendar columns

**Files:**
- Modify: `lib/db.ts:19-41` (SCHEMA_DDL)

- [ ] **Step 1: Add columns to SCHEMA_DDL**

In `lib/db.ts`, add two columns to the `user_settings` table inside `SCHEMA_DDL`:

```typescript
// After line 39 (nightscout_secret TEXT,)
// Add:
  google_refresh_token TEXT,
  google_calendar_id   TEXT,
```

So the full column list ends with:
```
  nightscout_secret  TEXT,
  google_refresh_token TEXT,
  google_calendar_id   TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0
```

- [ ] **Step 2: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All 1114 tests pass (schema DDL change is backwards-compatible — new columns have no NOT NULL constraint)

- [ ] **Step 3: Commit**

```
feat(schema): add google_refresh_token and google_calendar_id columns
```

---

### Task 2: Credentials — Google Calendar token storage

**Files:**
- Modify: `lib/credentials.ts:52-77`
- Test: `lib/__tests__/credentials.test.ts`

- [ ] **Step 1: Add GoogleCalendarCredentials type and getter to credentials.ts**

After the `UserCredentials` interface (line 58), add:

```typescript
export interface GoogleCalendarCredentials {
  refreshToken: string | null;
  calendarId: string | null;
  timezone: string;
}

/** Fetch Google Calendar credentials for a user. */
export async function getGoogleCalendarCredentials(email: string): Promise<GoogleCalendarCredentials | null> {
  const result = await db().execute({
    sql: "SELECT google_refresh_token, google_calendar_id, timezone FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const encKey = getEncryptionKey();

  return {
    refreshToken: row.google_refresh_token ? decrypt(row.google_refresh_token as string, encKey) : null,
    calendarId: row.google_calendar_id as string | null,
    timezone: (row.timezone as string | null) ?? "Europe/Stockholm",
  };
}
```

- [ ] **Step 2: Add updater functions**

After the getter, add:

```typescript
/** Store encrypted Google refresh token. Pass null to clear. */
export async function updateGoogleRefreshToken(email: string, refreshToken: string | null): Promise<void> {
  const encKey = getEncryptionKey();
  await db().execute({
    sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
    args: [refreshToken ? encrypt(refreshToken, encKey) : null, email],
  });
}

/** Store Google Calendar ID. */
export async function updateGoogleCalendarId(email: string, calendarId: string): Promise<void> {
  await db().execute({
    sql: "UPDATE user_settings SET google_calendar_id = ? WHERE email = ?",
    args: [calendarId, email],
  });
}
```

- [ ] **Step 3: Write tests for the new functions**

In `lib/__tests__/credentials.test.ts`, add a new describe block after the existing tests:

```typescript
describe("Google Calendar credentials", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute({
      sql: "INSERT OR REPLACE INTO user_settings (email, approved) VALUES (?, 1)",
      args: [EMAIL],
    });
  });

  it("returns null refreshToken when not set", async () => {
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds).not.toBeNull();
    expect(creds!.refreshToken).toBeNull();
    expect(creds!.calendarId).toBeNull();
    expect(creds!.timezone).toBe("Europe/Stockholm");
  });

  it("round-trips encrypted refresh token", async () => {
    await updateGoogleRefreshToken(EMAIL, "1//refresh-token-abc");
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds!.refreshToken).toBe("1//refresh-token-abc");
  });

  it("clears refresh token when null", async () => {
    await updateGoogleRefreshToken(EMAIL, "1//token");
    await updateGoogleRefreshToken(EMAIL, null);
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds!.refreshToken).toBeNull();
  });

  it("stores and retrieves calendar ID", async () => {
    await updateGoogleCalendarId(EMAIL, "cal-id-xyz");
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds!.calendarId).toBe("cal-id-xyz");
  });

  it("returns null for unknown email", async () => {
    const creds = await getGoogleCalendarCredentials("nobody@example.com");
    expect(creds).toBeNull();
  });
});
```

Add the new imports at the top of the test file:
```typescript
import { getGoogleCalendarCredentials, updateGoogleRefreshToken, updateGoogleCalendarId } from "../credentials";
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass including the new Google Calendar credentials tests

- [ ] **Step 5: Commit**

```
feat(credentials): add Google Calendar token storage with AES-256-GCM encryption
```

---

### Task 3: Auth — Extend Google OAuth for calendar scope

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Add calendar scope, offline access, and dynamic consent**

Replace the entire `lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";
import { encrypt, getEncryptionKey } from "./credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const result = await db().execute({
        sql: "SELECT approved, google_refresh_token FROM user_settings WHERE email = ?",
        args: [user.email],
      });
      if (result.rows.length === 0) return false;
      if ((result.rows[0].approved as number | null ?? 0) !== 1) return false;

      // Store refresh token when Google provides one (on consent)
      if (account?.refresh_token) {
        const encKey = getEncryptionKey();
        await db().execute({
          sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
          args: [encrypt(account.refresh_token, encKey), user.email],
        });
      }

      return true;
    },
  },
});
```

Note: We keep `prompt: "consent"` always for now (single user). The spec mentions dynamic consent — that optimization can be added when multi-user launches. For a single user, re-consenting on each sign-in is harmless and simpler.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass. Auth tests mock the DB, so the new column reads won't break them.

- [ ] **Step 3: Commit**

```
feat(auth): extend Google OAuth with calendar scope and refresh token storage
```

---

### Task 4: Google Calendar API client — token exchange and calendar management

**Files:**
- Create: `lib/googleCalendar.ts`
- Create: `lib/__tests__/googleCalendar.test.ts`
- Modify: `lib/__tests__/msw/handlers.ts`

- [ ] **Step 1: Add Google Calendar API MSW handlers**

In `lib/__tests__/msw/handlers.ts`, add these imports and handlers. First, add capture variables after the existing ones (line 8):

```typescript
export let capturedGoogleCalendarEvents: unknown[] = [];
export let capturedGoogleDeletedEventIds: string[] = [];
```

Update `resetCaptures()` to also reset these:
```typescript
export function resetCaptures() {
  capturedUploadPayload = [];
  capturedPutPayload = null;
  capturedDeleteEventIds = [];
  capturedGoogleCalendarEvents = [];
  capturedGoogleDeletedEventIds = [];
}
```

Add these handlers to the `handlers` array:

```typescript
  // Google OAuth token exchange
  http.post("https://oauth2.googleapis.com/token", async () => {
    return HttpResponse.json({
      access_token: "mock-access-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
  }),

  // Google Calendar — get calendar (verify it exists)
  http.get("https://www.googleapis.com/calendar/v3/calendars/:calendarId", ({ params }) => {
    if (params.calendarId === "existing-cal-id") {
      return HttpResponse.json({ id: "existing-cal-id", summary: "Springa" });
    }
    return new HttpResponse(null, { status: 404 });
  }),

  // Google Calendar — create calendar
  http.post("https://www.googleapis.com/calendar/v3/calendars", async () => {
    return HttpResponse.json({ id: "new-cal-id", summary: "Springa" });
  }),

  // Google Calendar — list events
  http.get("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    if (q) {
      // Search by summary — return matching event
      return HttpResponse.json({
        items: [{ id: "gcal-event-1", summary: q, start: { dateTime: "2026-04-01T12:00:00+02:00" } }],
      });
    }
    return HttpResponse.json({
      items: [
        { id: "gcal-event-1", summary: "W01 Easy", start: { dateTime: "2026-04-01T12:00:00+02:00" } },
        { id: "gcal-event-2", summary: "W01 Long", start: { dateTime: "2026-04-06T09:00:00+02:00" } },
      ],
    });
  }),

  // Google Calendar — create event
  http.post("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events", async ({ request }) => {
    const body = await request.json();
    capturedGoogleCalendarEvents.push(body);
    return HttpResponse.json({ id: `gcal-${capturedGoogleCalendarEvents.length}`, ...body });
  }),

  // Google Calendar — update event
  http.patch("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId", async () => {
    return HttpResponse.json({ id: "gcal-event-1", summary: "Updated" });
  }),

  // Google Calendar — delete event
  http.delete("https://www.googleapis.com/calendar/v3/calendars/:calendarId/events/:eventId", ({ params }) => {
    capturedGoogleDeletedEventIds.push(params.eventId as string);
    return new HttpResponse(null, { status: 204 });
  }),
```

- [ ] **Step 2: Write the test file**

Create `lib/__tests__/googleCalendar.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  getGoogleAccessToken,
  ensureSpringaCalendar,
  syncEventsToGoogle,
  clearFutureGoogleEvents,
  findGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  formatEventDescription,
} from "../googleCalendar";
import type { WorkoutEvent } from "../types";
import { capturedGoogleCalendarEvents, capturedGoogleDeletedEventIds } from "./msw/handlers";

describe("getGoogleAccessToken", () => {
  it("exchanges refresh token for access token", async () => {
    const token = await getGoogleAccessToken("1//mock-refresh-token");
    expect(token).toBe("mock-access-token");
  });
});

describe("ensureSpringaCalendar", () => {
  it("returns existing calendar ID when valid", async () => {
    const id = await ensureSpringaCalendar("mock-access-token", "existing-cal-id", "Europe/Stockholm");
    expect(id).toBe("existing-cal-id");
  });

  it("creates new calendar when stored ID is null", async () => {
    const id = await ensureSpringaCalendar("mock-access-token", null, "Europe/Stockholm");
    expect(id).toBe("new-cal-id");
  });

  it("creates new calendar when stored ID returns 404", async () => {
    const id = await ensureSpringaCalendar("mock-access-token", "deleted-cal-id", "Europe/Stockholm");
    expect(id).toBe("new-cal-id");
  });
});

describe("syncEventsToGoogle", () => {
  beforeEach(() => {
    capturedGoogleCalendarEvents.length = 0;
  });

  it("creates events with correct fields", async () => {
    const events: WorkoutEvent[] = [
      {
        start_date_local: new Date("2026-04-01T12:00:00"),
        name: "W01 Easy eco16",
        description: "Warmup 10m 60%-70% LTHR\nMain 30m 70%-80% LTHR\nCooldown 15m 60%-70% LTHR",
        external_id: "easy-1",
        type: "Run",
        fuelRate: 45,
      },
    ];
    await syncEventsToGoogle("mock-access-token", "cal-id", events, "Europe/Stockholm");
    expect(capturedGoogleCalendarEvents).toHaveLength(1);
    const created = capturedGoogleCalendarEvents[0] as Record<string, unknown>;
    expect(created.summary).toBe("W01 Easy eco16");
    expect(created.start).toEqual({ dateTime: "2026-04-01T12:00:00", timeZone: "Europe/Stockholm" });
    expect(created.description).toContain("Fuel: 45 g/h");
  });
});

describe("clearFutureGoogleEvents", () => {
  beforeEach(() => {
    capturedGoogleDeletedEventIds.length = 0;
  });

  it("deletes all listed events", async () => {
    await clearFutureGoogleEvents("mock-access-token", "cal-id");
    expect(capturedGoogleDeletedEventIds).toEqual(["gcal-event-1", "gcal-event-2"]);
  });
});

describe("findGoogleEvent", () => {
  it("returns event ID when found", async () => {
    const id = await findGoogleEvent("mock-access-token", "cal-id", "W01 Easy", "2026-04-01");
    expect(id).toBe("gcal-event-1");
  });
});

describe("updateGoogleEvent", () => {
  it("patches event without throwing", async () => {
    await expect(
      updateGoogleEvent("mock-access-token", "cal-id", "gcal-event-1", { summary: "Updated" }),
    ).resolves.toBeUndefined();
  });
});

describe("deleteGoogleEvent", () => {
  beforeEach(() => {
    capturedGoogleDeletedEventIds.length = 0;
  });

  it("deletes event by ID", async () => {
    await deleteGoogleEvent("mock-access-token", "cal-id", "gcal-event-1");
    expect(capturedGoogleDeletedEventIds).toEqual(["gcal-event-1"]);
  });
});

describe("formatEventDescription", () => {
  it("includes fuel rate and workout steps", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date("2026-04-01T12:00:00"),
      name: "W01 Easy eco16",
      description: "Warmup 10m\nMain 30m\nCooldown 15m",
      external_id: "easy-1",
      type: "Run",
      fuelRate: 45,
    };
    const desc = formatEventDescription(event);
    expect(desc).toContain("Fuel: 45 g/h");
    expect(desc).toContain("Warmup 10m");
    expect(desc).toContain("Main 30m");
    expect(desc).toContain("Cooldown 15m");
  });

  it("includes HR zone target when zones provided", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date("2026-04-01T12:00:00"),
      name: "W01 Easy eco16",
      description: "Warmup 10m\nMain 30m",
      external_id: "easy-1",
      type: "Run",
      fuelRate: 60,
    };
    const desc = formatEventDescription(event, [135, 153, 162, 172, 189], 168);
    expect(desc).toContain("HR target:");
  });

  it("omits fuel line when no fuel rate", () => {
    const event: WorkoutEvent = {
      start_date_local: new Date("2026-04-01T12:00:00"),
      name: "W01 Easy eco16",
      description: "Warmup 10m",
      external_id: "easy-1",
      type: "Run",
    };
    const desc = formatEventDescription(event);
    expect(desc).not.toContain("Fuel:");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --filter googleCalendar`
Expected: FAIL — module `../googleCalendar` does not exist

- [ ] **Step 4: Implement `lib/googleCalendar.ts`**

```typescript
import { format } from "date-fns";
import type { WorkoutEvent } from "./types";
import { estimateWorkoutDuration, getEstimatedDuration } from "./workoutMath";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Exchange a refresh token for a short-lived access token. */
export async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/** Verify a calendar exists, or create a new "Springa" calendar. Returns the calendar ID. */
export async function ensureSpringaCalendar(
  accessToken: string,
  storedCalendarId: string | null,
  timezone: string,
): Promise<string> {
  if (storedCalendarId) {
    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(storedCalendarId)}`, {
      headers: authHeaders(accessToken),
    });
    if (res.ok) return storedCalendarId;
    // 404 or other error — recreate
  }

  const res = await fetch(`${CALENDAR_API}/calendars`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ summary: "Springa", timeZone: timezone }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Springa calendar: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Create Google Calendar events from WorkoutEvents. Sequential to avoid rate limits. */
export async function syncEventsToGoogle(
  accessToken: string,
  calendarId: string,
  events: WorkoutEvent[],
  timezone: string,
): Promise<void> {
  for (const event of events) {
    const durationMin = estimateWorkoutDuration(event.description)?.minutes
      ?? getEstimatedDuration(event);
    const startDate = event.start_date_local;
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);

    const body = {
      summary: event.name,
      description: formatEventDescription(event),
      start: { dateTime: format(startDate, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: timezone },
      end: { dateTime: format(endDate, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: timezone },
    };

    const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`Failed to create Google Calendar event "${event.name}": ${res.status}`);
    }
  }
}

/** Delete all future events on the Springa calendar. */
export async function clearFutureGoogleEvents(
  accessToken: string,
  calendarId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(now)}&maxResults=2500&singleEvents=true`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) return;

  const data = (await res.json()) as { items?: { id: string }[] };
  for (const item of data.items ?? []) {
    await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(item.id)}`,
      { method: "DELETE", headers: authHeaders(accessToken) },
    );
  }
}

/** Find a Google Calendar event by summary (name) and date. Returns the event ID or null. */
export async function findGoogleEvent(
  accessToken: string,
  calendarId: string,
  name: string,
  date: string,
): Promise<string | null> {
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59Z`;
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?q=${encodeURIComponent(name)}&timeMin=${encodeURIComponent(dayStart)}&timeMax=${encodeURIComponent(dayEnd)}&singleEvents=true`,
    { headers: authHeaders(accessToken) },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as { items?: { id: string; summary: string }[] };
  const match = data.items?.find((e) => e.summary === name);
  return match?.id ?? null;
}

export interface EventUpdates {
  summary?: string;
  description?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
}

/** Update a Google Calendar event by its ID. */
export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
  updates: EventUpdates,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify(updates),
    },
  );
  if (!res.ok) {
    console.warn(`Failed to update Google Calendar event ${googleEventId}: ${res.status}`);
  }
}

/** Delete a Google Calendar event by its ID. */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
  );
  if (!res.ok) {
    console.warn(`Failed to delete Google Calendar event ${googleEventId}: ${res.status}`);
  }
}

/** Build the Google Calendar event description text. */
export function formatEventDescription(
  event: WorkoutEvent,
  hrZones?: number[],
  lthr?: number,
): string {
  const lines: string[] = [];

  // HR zone target
  if (hrZones && hrZones.length === 5 && lthr) {
    const isInterval = /interval|hills|short|tempo|fartlek|threshold|speed/i.test(event.name);
    const isLong = /long/i.test(event.name);
    if (isInterval) {
      lines.push(`HR target: Z4 (${hrZones[3]}-${hrZones[4]} bpm)`);
    } else if (isLong) {
      lines.push(`HR target: Z2 (${hrZones[1]}-${hrZones[2]} bpm)`);
    } else {
      lines.push(`HR target: Z2 (${hrZones[1]}-${hrZones[2]} bpm)`);
    }
  }

  // Fuel rate
  if (event.fuelRate != null) {
    lines.push(`Fuel: ${Math.round(event.fuelRate)} g/h`);
  }

  // Separator + workout steps
  if (lines.length > 0 && event.description) {
    lines.push("");
  }
  if (event.description) {
    lines.push(event.description);
  }

  return lines.join("\n");
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass including the new googleCalendar tests

- [ ] **Step 6: Commit**

```
feat: add Google Calendar API client with token exchange, calendar CRUD, event CRUD
```

---

### Task 5: Context resolver — `getGoogleCalendarContext`

**Files:**
- Modify: `lib/googleCalendar.ts`
- Modify: `lib/__tests__/googleCalendar.test.ts`

- [ ] **Step 1: Write the test**

Add to `lib/__tests__/googleCalendar.test.ts`:

```typescript
import { vi, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  return { holder: { db: null as unknown as Client } };
});

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});
```

Note: These hoisted mocks must go at the very top of the file, before all other imports. The test file needs to be restructured with the DB mock first.

Add a test for the context resolver:

```typescript
import { getGoogleCalendarContext } from "../googleCalendar";
import { SCHEMA_DDL } from "../db";
import { encrypt } from "../credentials";

const TEST_KEY = "a".repeat(64);
const EMAIL = "test@example.com";

describe("getGoogleCalendarContext", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email, approved, google_refresh_token, google_calendar_id, timezone) VALUES (?, 1, ?, ?, ?)",
      args: [EMAIL, encrypt("1//mock-refresh", TEST_KEY), "existing-cal-id", "Europe/Stockholm"],
    });
  });

  it("returns accessToken and calendarId for valid user", async () => {
    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).not.toBeNull();
    expect(ctx!.accessToken).toBe("mock-access-token");
    expect(ctx!.calendarId).toBe("existing-cal-id");
  });

  it("returns null when user has no refresh token", async () => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET google_refresh_token = NULL WHERE email = ?",
      args: [EMAIL],
    });
    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).toBeNull();
  });

  it("returns null for unknown user", async () => {
    const ctx = await getGoogleCalendarContext("nobody@example.com");
    expect(ctx).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --filter googleCalendar`
Expected: FAIL — `getGoogleCalendarContext` is not exported

- [ ] **Step 3: Implement `getGoogleCalendarContext`**

Add to `lib/googleCalendar.ts`:

```typescript
import {
  getGoogleCalendarCredentials,
  updateGoogleRefreshToken,
  updateGoogleCalendarId,
} from "./credentials";

/** Resolve refresh token → access token → calendar ID. Call once per user action. */
export async function getGoogleCalendarContext(
  email: string,
): Promise<{ accessToken: string; calendarId: string; timezone: string } | null> {
  const creds = await getGoogleCalendarCredentials(email);
  if (!creds?.refreshToken) return null;

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(creds.refreshToken);
  } catch {
    // Token revoked or expired — clear it so next sign-in re-prompts consent
    await updateGoogleRefreshToken(email, null);
    return null;
  }

  const calendarId = await ensureSpringaCalendar(accessToken, creds.calendarId, creds.timezone);

  // Persist calendar ID if it changed (first creation or recreation after deletion)
  if (calendarId !== creds.calendarId) {
    await updateGoogleCalendarId(email, calendarId);
  }

  return { accessToken, calendarId, timezone: creds.timezone };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```
feat: add getGoogleCalendarContext resolver for single-call auth + calendar setup
```

---

### Task 6: Wire up bulk plan upload

**Files:**
- Modify: `app/screens/PlannerScreen.tsx`

- [ ] **Step 1: Add Google Calendar sync to `handleUpload`**

Import the needed functions at the top of PlannerScreen.tsx:

```typescript
import { getGoogleCalendarContext, clearFutureGoogleEvents, syncEventsToGoogle } from "@/lib/googleCalendar";
import { auth } from "@/lib/auth";
```

Wait — PlannerScreen is a client component (`"use client"`). It can't call server-side functions directly. The Google Calendar sync needs to happen server-side (refresh token decryption, DB access). We need an API route.

- [ ] **Step 2: Create API route for Google Calendar sync**

Create `app/api/google-calendar-sync/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getGoogleCalendarContext,
  clearFutureGoogleEvents,
  syncEventsToGoogle,
  findGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  formatEventDescription,
} from "@/lib/googleCalendar";
import type { WorkoutEvent } from "@/lib/types";
import { format } from "date-fns";
import { estimateWorkoutDuration, getEstimatedDuration } from "@/lib/workoutMath";

interface SyncRequest {
  action: "bulk-sync" | "update" | "delete";
  events?: WorkoutEvent[];
  eventName?: string;
  eventDate?: string;
  updates?: {
    name?: string;
    date?: string;
    description?: string;
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as SyncRequest;
  const ctx = await getGoogleCalendarContext(session.user.email);
  if (!ctx) {
    return NextResponse.json({ synced: false, reason: "no-token" });
  }

  try {
    if (body.action === "bulk-sync" && body.events) {
      // Deserialize dates (JSON stringifies Date objects)
      const events = body.events.map((e) => ({
        ...e,
        start_date_local: new Date(e.start_date_local),
      }));
      await clearFutureGoogleEvents(ctx.accessToken, ctx.calendarId);
      await syncEventsToGoogle(ctx.accessToken, ctx.calendarId, events, ctx.timezone);
      return NextResponse.json({ synced: true, count: events.length });
    }

    if (body.action === "update" && body.eventName && body.eventDate) {
      const googleEventId = await findGoogleEvent(ctx.accessToken, ctx.calendarId, body.eventName, body.eventDate);
      if (googleEventId && body.updates) {
        const updates: Record<string, unknown> = {};
        if (body.updates.name) updates.summary = body.updates.name;
        if (body.updates.description) updates.description = body.updates.description;
        if (body.updates.date) {
          updates.start = { dateTime: body.updates.date, timeZone: ctx.timezone };
        }
        await updateGoogleEvent(ctx.accessToken, ctx.calendarId, googleEventId, updates);
      }
      return NextResponse.json({ synced: true });
    }

    if (body.action === "delete" && body.eventName && body.eventDate) {
      const googleEventId = await findGoogleEvent(ctx.accessToken, ctx.calendarId, body.eventName, body.eventDate);
      if (googleEventId) {
        await deleteGoogleEvent(ctx.accessToken, ctx.calendarId, googleEventId);
      }
      return NextResponse.json({ synced: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Google Calendar sync error:", e);
    return NextResponse.json({ synced: false, error: String(e) });
  }
}
```

- [ ] **Step 3: Add sync helper function for client components**

Create a thin client-side helper. Add to the bottom of `lib/googleCalendar.ts`:

```typescript
/** Client-side helper: fire-and-forget Google Calendar sync via API route. */
export async function syncToGoogleCalendar(
  action: "bulk-sync" | "update" | "delete",
  payload: {
    events?: WorkoutEvent[];
    eventName?: string;
    eventDate?: string;
    updates?: { name?: string; date?: string; description?: string };
  },
): Promise<void> {
  try {
    await fetch("/api/google-calendar-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (e) {
    console.warn("Google Calendar sync failed:", e);
  }
}
```

- [ ] **Step 4: Wire into PlannerScreen bulk upload**

In `app/screens/PlannerScreen.tsx`, add import:

```typescript
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
```

In `handleUpload`, after the successful `uploadToIntervals` call (after line 88), add:

```typescript
      // Best-effort Google Calendar sync
      syncToGoogleCalendar("bulk-sync", { events: planEvents });
```

This is fire-and-forget — it doesn't block the UI or affect the status message.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass (the new API route doesn't break existing tests, and `syncToGoogleCalendar` is just a fetch call)

- [ ] **Step 6: Commit**

```
feat: wire Google Calendar bulk sync into plan upload
```

---

### Task 7: Wire up adapt sync, manual edit, manual delete, and drag-drop

**Files:**
- Modify: `app/screens/PlannerScreen.tsx` (adapt sync)
- Modify: `app/components/EventModal.tsx` (manual date edit)
- Modify: `app/components/CalendarView.tsx` (manual delete)
- Modify: `app/hooks/useDragDrop.ts` (drag-drop move)

- [ ] **Step 1: Adapt sync in PlannerScreen**

In `handleSync` (line 206-221), after the successful `Promise.all` for Intervals.icu updates, add Google Calendar sync. The adapt flow has `adaptedEvents` with `original.name` and `original.date`.

After the `await Promise.all(...)` call on line 213 and before `setAdaptStatus(...)` on line 215, add:

```typescript
      // Best-effort Google Calendar sync for adapted events
      for (const adapted of adaptedEvents) {
        if (!adapted.original.id.startsWith("event-")) continue;
        const eventDate = format(adapted.original.date, "yyyy-MM-dd");
        syncToGoogleCalendar("update", {
          eventName: adapted.original.name,
          eventDate,
          updates: { description: adapted.description },
        });
      }
```

Add the `format` import from `date-fns` if not already present, and `syncToGoogleCalendar` import:

```typescript
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
```

- [ ] **Step 2: Manual date edit in EventModal**

In `app/components/EventModal.tsx`, add import:

```typescript
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
import { format } from "date-fns";
```

In `saveEventEdit` (line 148-167), after the successful `updateEvent` call (line 158) and before `onDateSaved` (line 161), add:

```typescript
      // Best-effort Google Calendar sync
      syncToGoogleCalendar("update", {
        eventName: selectedEvent.name,
        eventDate: format(selectedEvent.date, "yyyy-MM-dd"),
        updates: { date: newDateLocal },
      });
```

- [ ] **Step 3: Manual delete in CalendarView**

In `app/components/CalendarView.tsx`, add import:

```typescript
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
import { format } from "date-fns";
```

In `handleDeleteEvent` (line 145-156), before `setEvents((prev) => ...)` on line 154, add:

```typescript
    // Best-effort Google Calendar sync
    const eventToDelete = events.find((e) => e.id === eventId);
    if (eventToDelete) {
      syncToGoogleCalendar("delete", {
        eventName: eventToDelete.name,
        eventDate: format(eventToDelete.date, "yyyy-MM-dd"),
      });
    }
```

Note: `events` is the local state, and `format` is likely already imported from `date-fns` in CalendarView. Check before adding the import.

- [ ] **Step 4: Drag-drop move in useDragDrop**

In `app/hooks/useDragDrop.ts`, add imports:

```typescript
import { syncToGoogleCalendar } from "@/lib/googleCalendar";
```

In `handleDrop` (line 45-76), after the successful `updateEvent` call (line 63) and inside the try block, add:

```typescript
      // Best-effort Google Calendar sync
      syncToGoogleCalendar("update", {
        eventName: draggedEvent.name,
        eventDate: format(draggedEvent.date, "yyyy-MM-dd"),
        updates: { date: newDateLocal },
      });
```

`format` is already imported from `date-fns` in this file.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass. Existing tests mock fetch via MSW — the `syncToGoogleCalendar` calls will either hit MSW handlers or silently fail (fire-and-forget pattern).

- [ ] **Step 6: Commit**

```
feat: wire Google Calendar sync into adapt, manual edit, delete, and drag-drop
```

---

### Task 8: Add Google Calendar MSW handler for API route tests

**Files:**
- Modify: `lib/__tests__/msw/handlers.ts`

- [ ] **Step 1: Add handler for the sync API route**

The existing integration tests (flows.integration.test.tsx) test the full UI flows. The `syncToGoogleCalendar` calls in the wired-up components will hit `/api/google-calendar-sync` during tests. Add an MSW handler so these calls don't fail:

In the handlers array in `lib/__tests__/msw/handlers.ts`, add:

```typescript
  // Google Calendar sync API route (fire-and-forget, always succeeds in tests)
  http.post("/api/google-calendar-sync", () => {
    return HttpResponse.json({ synced: true });
  }),
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All 1114+ tests pass

- [ ] **Step 3: Commit**

```
test: add MSW handler for Google Calendar sync API route
```

---

### Task 9: Database migration — add columns to production

**Files:**
- Create: `scripts/migrate-google-calendar.ts`

- [ ] **Step 1: Create migration script**

```typescript
/**
 * One-time migration: add Google Calendar columns to user_settings.
 *
 * Run: npx tsx scripts/migrate-google-calendar.ts
 *
 * Safe to run multiple times — ALTER TABLE IF NOT EXISTS
 * is not supported by SQLite, but adding a column that already
 * exists will throw, so we catch and ignore.
 */
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required");
    process.exit(1);
  }

  const db = createClient({ url, authToken: token });

  const columns = [
    "ALTER TABLE user_settings ADD COLUMN google_refresh_token TEXT",
    "ALTER TABLE user_settings ADD COLUMN google_calendar_id TEXT",
  ];

  for (const sql of columns) {
    try {
      await db.execute(sql);
      console.log(`OK: ${sql}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate column")) {
        console.log(`SKIP (already exists): ${sql}`);
      } else {
        throw e;
      }
    }
  }

  console.log("Migration complete.");
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```
chore: add migration script for Google Calendar columns
```

---

### Task 10: Enable Google Calendar API in Google Cloud Console

This is a manual step — not code.

- [ ] **Step 1: Enable the Google Calendar API**

Go to the Google Cloud Console project that owns `GOOGLE_CLIENT_ID`. Enable the "Google Calendar API" in APIs & Services.

- [ ] **Step 2: Verify OAuth consent screen includes calendar scope**

Check that the OAuth consent screen lists `https://www.googleapis.com/auth/calendar` in the scopes. If not, add it.

- [ ] **Step 3: Run the database migration**

```bash
TURSO_DATABASE_URL=<prod-url> TURSO_AUTH_TOKEN=<prod-token> npx tsx scripts/migrate-google-calendar.ts
```

- [ ] **Step 4: Deploy**

Push to main, verify Vercel deployment succeeds.

- [ ] **Step 5: Sign out and back in**

Sign out of Springa, sign back in. Google will show the updated consent screen with "Manage your calendar events" permission. Accept it.

- [ ] **Step 6: Generate and upload a plan**

Generate a plan and click Upload. Verify:
1. Workouts sync to Intervals.icu (existing behavior)
2. A "Springa" calendar appears in Google Calendar
3. Workout events appear with correct titles, times, and descriptions

- [ ] **Step 7: Verify on phone**

Open Google Calendar on Android. Verify the Springa calendar synced and events are visible. Open Strimma, go to Exercise Settings, pick the "Springa" calendar. Verify upcoming workout guidance appears.
