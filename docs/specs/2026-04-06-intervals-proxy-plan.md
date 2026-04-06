# Intervals.icu API Key Proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Intervals.icu API key off the client. All Intervals calls go through authenticated Springa API routes.

**Architecture:** Client functions in `lib/intervalsClient.ts` call proxy routes under `app/api/intervals/`. Proxy routes authenticate, resolve credentials, delegate to existing `lib/intervalsApi.ts` functions. The API key never leaves the server.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, MSW

---

### Task 1: Create `lib/intervalsClient.ts` — client-side wrapper functions

**Files:**
- Create: `lib/intervalsClient.ts`
- Test: `lib/__tests__/intervalsClient.test.ts`

These are thin functions that call Springa proxy routes. No API key parameter. They replace direct `intervalsApi.ts` imports in client code.

- [ ] **Step 1: Write the tests**

```typescript
// lib/__tests__/intervalsClient.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("intervalsClient", () => {
  it("fetchCalendar calls proxy with date params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: "event-1", name: "Easy" }]),
    });

    const { fetchCalendar } = await import("../intervalsClient");
    const result = await fetchCalendar("2026-01-01", "2026-06-01");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/intervals/calendar?oldest=2026-01-01&newest=2026-06-01"
    );
    expect(result).toEqual([{ id: "event-1", name: "Easy" }]);
  });

  it("fetchCalendar throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("err") });

    const { fetchCalendar } = await import("../intervalsClient");
    await expect(fetchCalendar("2026-01-01", "2026-06-01")).rejects.toThrow();
  });

  it("fetchActivity calls proxy with activity ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ avgHr: 150, streamData: {} }),
    });

    const { fetchActivity } = await import("../intervalsClient");
    const result = await fetchActivity("i123");

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/activity/i123");
    expect(result).toEqual({ avgHr: 150, streamData: {} });
  });

  it("fetchStreams posts batch of IDs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ "i1": { hr: [1, 2] } }),
    });

    const { fetchStreams } = await import("../intervalsClient");
    const result = await fetchStreams(["i1", "i2"]);

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityIds: ["i1", "i2"] }),
    });
    expect(result).toEqual({ "i1": { hr: [1, 2] } });
  });

  it("fetchPaceCurves calls proxy with curve param", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ bestEfforts: [] }),
    });

    const { fetchPaceCurves } = await import("../intervalsClient");
    await fetchPaceCurves("all");

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/pace-curves?curve=all");
  });

  it("updateEvent sends PUT with updates", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { updateEvent } = await import("../intervalsClient");
    await updateEvent(42, { description: "test" });

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/events/42", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "test" }),
    });
  });

  it("uploadPlan posts events to bulk endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ count: 3 }),
    });

    const { uploadPlan } = await import("../intervalsClient");
    const events = [{ name: "Easy", description: "10m warmup", start_date_local: new Date("2026-04-10") }];
    const count = await uploadPlan(events as never[]);

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/events/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expect(count).toBe(3);
  });

  it("replaceWorkout posts to replace endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ newId: 99 }),
    });

    const { replaceWorkout } = await import("../intervalsClient");
    const workout = { name: "Easy", description: "test", start_date_local: new Date("2026-04-10") };
    const newId = await replaceWorkout(5, workout as never);

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/events/replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expect(newId).toBe(99);
  });

  it("deleteEvent sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { deleteEvent } = await import("../intervalsClient");
    await deleteEvent(42);

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/events/42", { method: "DELETE" });
  });

  it("deleteActivity sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { deleteActivity } = await import("../intervalsClient");
    await deleteActivity("i123");

    expect(mockFetch).toHaveBeenCalledWith("/api/intervals/activity/i123", { method: "DELETE" });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run lib/__tests__/intervalsClient.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// lib/intervalsClient.ts
//
// Client-side wrappers for Intervals.icu operations.
// All calls go through authenticated Springa proxy routes.
// The API key never leaves the server.

import type { CalendarEvent, WorkoutEvent, PaceCurveData } from "./types";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCalendar(oldest: string, newest: string): Promise<CalendarEvent[]> {
  const res = await fetch(`/api/intervals/calendar?oldest=${oldest}&newest=${newest}`);
  return jsonOrThrow(res);
}

export async function fetchActivity(activityId: string): Promise<{
  avgHr?: number;
  maxHr?: number;
  streamData?: Record<string, unknown>;
}> {
  const res = await fetch(`/api/intervals/activity/${activityId}`);
  return jsonOrThrow(res);
}

export async function fetchStreams(
  activityIds: string[],
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/intervals/streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activityIds }),
  });
  return jsonOrThrow(res);
}

export async function fetchPaceCurves(curveId = "all"): Promise<PaceCurveData | null> {
  const res = await fetch(`/api/intervals/pace-curves?curve=${curveId}`);
  if (!res.ok) return null;
  return res.json() as Promise<PaceCurveData | null>;
}

export async function updateEvent(
  eventId: number,
  updates: { start_date_local?: string; name?: string; description?: string; carbs_per_hour?: number },
): Promise<void> {
  const res = await fetch(`/api/intervals/events/${eventId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update event: ${res.status}`);
  }
}

export async function uploadPlan(events: WorkoutEvent[]): Promise<number> {
  const res = await fetch("/api/intervals/events/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  const data = await jsonOrThrow<{ count: number }>(res);
  return data.count;
}

export async function replaceWorkout(
  existingEventId: number | undefined,
  workout: WorkoutEvent,
): Promise<number> {
  const res = await fetch("/api/intervals/events/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ existingEventId, workout }),
  });
  const data = await jsonOrThrow<{ newId: number }>(res);
  return data.newId;
}

export async function deleteEvent(eventId: number): Promise<void> {
  const res = await fetch(`/api/intervals/events/${eventId}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to delete event: ${res.status}`);
  }
}

export async function deleteActivity(activityId: string): Promise<void> {
  const res = await fetch(`/api/intervals/activity/${activityId}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to delete activity: ${res.status}`);
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run lib/__tests__/intervalsClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add intervalsClient — client-side proxy wrappers
```

---

### Task 2: Create proxy routes — calendar, activity, streams

**Files:**
- Create: `app/api/intervals/calendar/route.ts`
- Create: `app/api/intervals/activity/[id]/route.ts`
- Create: `app/api/intervals/streams/route.ts`

All follow the same pattern as the existing `app/api/intervals/connections/route.ts` and `app/api/wellness/route.ts`: authenticate → get credentials → delegate → return JSON.

- [ ] **Step 1: Create calendar proxy**

```typescript
// app/api/intervals/calendar/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchCalendarData } from "@/lib/intervalsApi";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const url = new URL(req.url);
  const oldest = url.searchParams.get("oldest");
  const newest = url.searchParams.get("newest");
  if (!oldest || !newest) {
    return NextResponse.json({ error: "Missing oldest/newest params" }, { status: 400 });
  }

  try {
    const events = await fetchCalendarData(creds.intervalsApiKey, new Date(oldest), new Date(newest));
    return NextResponse.json(events);
  } catch (err) {
    console.error("[intervals/calendar]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch calendar" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Create activity proxy**

```typescript
// app/api/intervals/activity/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchActivityDetails, deleteActivity } from "@/lib/intervalsApi";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const details = await fetchActivityDetails(id, creds.intervalsApiKey);
    return NextResponse.json(details);
  } catch (err) {
    console.error("[intervals/activity]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch activity" },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;
  try {
    await deleteActivity(creds.intervalsApiKey, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/activity/delete]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete activity" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Create streams proxy**

```typescript
// app/api/intervals/streams/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchStreamBatch } from "@/lib/intervalsApi";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const body = (await req.json()) as { activityIds: string[] };
  if (!Array.isArray(body.activityIds) || body.activityIds.length === 0) {
    return NextResponse.json({ error: "Missing activityIds array" }, { status: 400 });
  }

  // Cap batch size to prevent abuse
  const ids = body.activityIds.slice(0, 50);

  try {
    const streamMap = await fetchStreamBatch(creds.intervalsApiKey, ids, 3);
    // Convert Map to plain object for JSON serialization
    const result: Record<string, unknown> = {};
    for (const [id, streams] of streamMap) {
      result[id] = streams;
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[intervals/streams]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch streams" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All existing tests pass (new routes don't break anything)

- [ ] **Step 5: Commit**

```
feat: add intervals proxy routes — calendar, activity, streams
```

---

### Task 3: Create proxy routes — events and pace-curves

**Files:**
- Create: `app/api/intervals/events/[id]/route.ts`
- Create: `app/api/intervals/events/bulk/route.ts`
- Create: `app/api/intervals/events/replace/route.ts`
- Create: `app/api/intervals/pace-curves/route.ts`

- [ ] **Step 1: Create events/[id] proxy (PUT + DELETE)**

```typescript
// app/api/intervals/events/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { updateEvent, deleteEvent } from "@/lib/intervalsApi";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;
  const eventId = Number(id);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  const updates = (await req.json()) as {
    start_date_local?: string;
    name?: string;
    description?: string;
    carbs_per_hour?: number;
  };

  try {
    await updateEvent(creds.intervalsApiKey, eventId, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events/update]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event" },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const { id } = await params;
  const eventId = Number(id);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
  }

  try {
    await deleteEvent(creds.intervalsApiKey, eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[intervals/events/delete]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Create events/bulk proxy**

```typescript
// app/api/intervals/events/bulk/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { uploadToIntervals } from "@/lib/intervalsApi";
import type { WorkoutEvent } from "@/lib/types";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const body = (await req.json()) as { events: WorkoutEvent[] };
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ error: "Missing events array" }, { status: 400 });
  }

  try {
    // Rehydrate Date objects from JSON strings
    const events = body.events.map((e) => ({
      ...e,
      start_date_local: new Date(e.start_date_local),
    }));
    const count = await uploadToIntervals(creds.intervalsApiKey, events);
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[intervals/events/bulk]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload plan" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Create events/replace proxy**

```typescript
// app/api/intervals/events/replace/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { replaceWorkoutOnDate } from "@/lib/intervalsApi";
import type { WorkoutEvent } from "@/lib/types";

export async function POST(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const body = (await req.json()) as {
    existingEventId?: number;
    workout: WorkoutEvent;
  };

  if (!body.workout) {
    return NextResponse.json({ error: "Missing workout" }, { status: 400 });
  }

  try {
    const workout = {
      ...body.workout,
      start_date_local: new Date(body.workout.start_date_local),
    };
    const newId = await replaceWorkoutOnDate(creds.intervalsApiKey, body.existingEventId, workout);
    return NextResponse.json({ newId });
  } catch (err) {
    console.error("[intervals/events/replace]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to replace workout" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 4: Create pace-curves proxy**

```typescript
// app/api/intervals/pace-curves/route.ts
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchPaceCurves } from "@/lib/intervalsApi";

export async function GET(req: Request) {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
  }

  const url = new URL(req.url);
  const curveId = url.searchParams.get("curve") ?? "all";

  try {
    const data = await fetchPaceCurves(creds.intervalsApiKey, curveId);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[intervals/pace-curves]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch pace curves" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```
feat: add intervals proxy routes — events, pace-curves
```

---

### Task 4: Remove API key from settings response and atoms

**Files:**
- Modify: `app/api/settings/route.ts:24-25` — stop returning intervalsApiKey
- Modify: `lib/settings.ts:27` — change `intervalsApiKey` to `intervalsConnected`
- Modify: `app/atoms.ts:30` — replace `apiKeyAtom` with `intervalsConnectedAtom`

- [ ] **Step 1: Update settings API — stop returning the key**

In `app/api/settings/route.ts`, replace line 24-25:

```typescript
// Before:
if (creds?.intervalsApiKey) {
  settings.intervalsApiKey = creds.intervalsApiKey;

// After:
if (creds?.intervalsApiKey) {
  settings.intervalsConnected = true;
```

Remove: the line `settings.intervalsApiKey = creds.intervalsApiKey;`
The profile fetch (lines 26-33) stays — LTHR/maxHR/zones still come from the server.

- [ ] **Step 2: Update UserSettings type**

In `lib/settings.ts`, replace line 27:

```typescript
// Before:
intervalsApiKey?: string;

// After:
intervalsConnected?: boolean;
```

- [ ] **Step 3: Update atoms**

In `app/atoms.ts`, replace line 30:

```typescript
// Before:
export const apiKeyAtom = atom((get) => get(settingsAtom)?.intervalsApiKey ?? "");

// After:
export const intervalsConnectedAtom = atom((get) => get(settingsAtom)?.intervalsConnected ?? false);
```

Also update `calendarReloadAtom` (lines 53-56) — it currently uses `apiKeyAtom` in the SWR key:

```typescript
// Before:
export const calendarReloadAtom = atom(null, (get) => {
  const apiKey = get(apiKeyAtom);
  if (apiKey) void mutate(["calendar-data", apiKey]);
});

// After:
export const calendarReloadAtom = atom(null, (get) => {
  const connected = get(intervalsConnectedAtom);
  if (connected) void mutate("calendar-data");
});
```

- [ ] **Step 4: Run tsc and lint**

Run: `npx tsc --noEmit 2>&1 | head -50`

Expected: TypeScript errors in files that still reference `apiKeyAtom` or `intervalsApiKey` — these are the files we'll fix in the next tasks.

- [ ] **Step 5: Commit**

```
refactor: remove API key from settings response and client atoms
```

---

### Task 5: Update hooks — remove apiKey parameter

**Files:**
- Modify: `app/hooks/useSharedCalendarData.ts`
- Modify: `app/hooks/useStreamCache.ts`
- Modify: `app/hooks/usePaceCurves.ts`
- Modify: `app/hooks/useActivityStream.ts`
- Modify: `app/hooks/useDragDrop.ts`
- Modify: `app/hooks/useRunData.ts`
- Modify: `app/hooks/useHydrateStore.ts`

- [ ] **Step 1: Update useSharedCalendarData**

Replace the entire file:

```typescript
// app/hooks/useSharedCalendarData.ts
"use client";

import useSWR from "swr";
import { startOfMonth, subMonths, endOfMonth, addMonths, format } from "date-fns";
import { fetchCalendar } from "@/lib/intervalsClient";
import { CALENDAR_LOOKBACK_MONTHS } from "@/lib/constants";
import type { CalendarEvent } from "@/lib/types";

export function useSharedCalendarData() {
  const { data: events, error, isLoading, mutate } = useSWR<CalendarEvent[], Error>(
    "calendar-data",
    async () => {
      const start = startOfMonth(subMonths(new Date(), CALENDAR_LOOKBACK_MONTHS));
      const end = endOfMonth(addMonths(new Date(), 6));
      return fetchCalendar(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"));
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  return {
    events: events ?? [],
    isLoading,
    error: error?.message ?? null,
    reload: () => { void mutate(); },
  };
}
```

- [ ] **Step 2: Update useStreamCache — remove apiKey param, use intervalsClient**

Replace `fetchStreamBatch` import and usage. The hook still does client-side batching for progress, but calls `fetchStreams` from `intervalsClient` per batch.

Key changes:
- Remove `apiKey` parameter
- Replace `import { fetchStreamBatch } from "@/lib/intervalsApi"` with `import { fetchStreams } from "@/lib/intervalsClient"`
- Replace the `fetchStreamBatch(apiKey, uncachedIds, 3, onProgress)` call — since the proxy doesn't support progress callbacks, batch on the client:

```typescript
// app/hooks/useStreamCache.ts
"use client";

import { useState, useEffect, useRef } from "react";
import { fetchStreams } from "@/lib/intervalsClient";
import { extractHRStream, extractExtraStreams, extractRawStreams } from "@/lib/streams";
import {
  readLocalCache,
  writeLocalCache,
  fetchBGCache,
  saveBGCacheRemote,
} from "@/lib/activityStreamsCache";
import type { CachedActivity } from "@/lib/activityStreamsDb";
import type { CalendarEvent } from "@/lib/types";
import type { IntervalsStream } from "@/lib/types";
import { getWorkoutCategory } from "@/lib/constants";

type CompletedRun = CalendarEvent & { activityId: string };

const BATCH_SIZE = 5;

export function useStreamCache(
  enabled: boolean,
  runs: CompletedRun[],
) {
  const [cached, setCached] = useState<CachedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const loadedRef = useRef(false);

  // L1: instant render from localStorage (once)
  const l1DoneRef = useRef(false);
  useEffect(() => {
    if (l1DoneRef.current) return;
    l1DoneRef.current = true;
    const local = readLocalCache();
    if (local.length > 0) setCached(local);
  }, []);

  // L2: fetch remote cache, diff, fetch uncached streams, merge, save
  useEffect(() => {
    if (!enabled || loadedRef.current || runs.length === 0) return;
    loadedRef.current = true;
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;

    void (async () => {
      setLoading(true);
      try {
        const wantedIds = new Set(runs.map((e) => e.activityId));

        const remoteCached = await fetchBGCache();
        if (aborted()) return;

        const cachedMap = new Map(
          remoteCached
            .filter((c) => wantedIds.has(c.activityId))
            .map((c) => [c.activityId, c]),
        );

        const uncachedRuns = runs.filter(
          (e) => !cachedMap.has(e.activityId),
        );

        const newCached: CachedActivity[] = [];

        if (uncachedRuns.length > 0) {
          const uncachedIds = uncachedRuns.map((e) => e.activityId);
          setProgress({ done: 0, total: uncachedIds.length });

          // Batch fetches for progress reporting
          const allStreams = new Map<string, IntervalsStream[]>();
          for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
            if (aborted()) return;
            const batch = uncachedIds.slice(i, i + BATCH_SIZE);
            const result = await fetchStreams(batch);
            for (const [id, streams] of Object.entries(result)) {
              allStreams.set(id, streams as IntervalsStream[]);
            }
            if (!aborted()) setProgress({ done: Math.min(i + BATCH_SIZE, uncachedIds.length), total: uncachedIds.length });
          }
          if (aborted()) return;

          for (const e of uncachedRuns) {
            if (aborted()) return;

            const streams = allStreams.get(e.activityId);
            const hrPoints = streams ? extractHRStream(streams) : [];
            const extra = streams ? extractExtraStreams(streams) : { pace: [], cadence: [], altitude: [] };
            const rawStreams = streams ? extractRawStreams(streams) : { distance: [], time: [] };
            const cat = getWorkoutCategory(e.name);

            newCached.push({
              activityId: e.activityId,
              name: e.name,
              category: cat === "other" ? "easy" : cat,
              fuelRate: e.fuelRate ?? null,
              hr: hrPoints,
              pace: extra.pace,
              cadence: extra.cadence,
              altitude: extra.altitude,
              activityDate: e.date.toISOString().slice(0, 10),
              runStartMs: e.date.getTime(),
              distance: rawStreams.distance.length > 0 ? rawStreams.distance : undefined,
              rawTime: rawStreams.time.length > 0 ? rawStreams.time : undefined,
            });
          }
        }

        const allCached = [...cachedMap.values(), ...newCached];

        if (newCached.length > 0) {
          writeLocalCache(allCached);
          void saveBGCacheRemote(allCached);
        }

        if (!aborted()) setCached(allCached);
      } catch (err) {
        console.error("useStreamCache: fetch failed", err);
        loadedRef.current = false;
      } finally {
        if (!aborted()) setLoading(false);
      }
    })();

    return () => { controller.abort(); };
  }, [enabled, runs]);

  return { cached, loading, progress };
}
```

- [ ] **Step 3: Update usePaceCurves — remove apiKey param**

```typescript
// app/hooks/usePaceCurves.ts
"use client";

import useSWR from "swr";
import { fetchPaceCurves } from "@/lib/intervalsClient";
import type { PaceCurveData } from "@/lib/types";

export interface PaceCurvesHookResult {
  data: PaceCurveData | null;
  isLoading: boolean;
  error: Error | null;
}

export function usePaceCurves(curveId = "all"): PaceCurvesHookResult {
  const { data, error, isLoading } = useSWR<PaceCurveData | null, Error>(
    ["pace-curves", curveId],
    () => fetchPaceCurves(curveId),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  );

  return {
    data: data ?? null,
    isLoading,
    error: error ?? null,
  };
}
```

- [ ] **Step 4: Update useActivityStream — remove apiKey param**

```typescript
// app/hooks/useActivityStream.ts
"use client";

import useSWR from "swr";
import { fetchActivity } from "@/lib/intervalsClient";
import type { StreamData } from "@/lib/types";

export interface ActivityStreamData {
  streamData: StreamData;
  avgHr?: number;
  maxHr?: number;
}

export function useActivityStream(
  activityId: string | null,
): { data: ActivityStreamData | null; isLoading: boolean; error: Error | null } {
  const { data, error, isLoading } = useSWR<ActivityStreamData, Error>(
    activityId ? ["activity-stream", activityId] : null,
    async ([, id]: readonly [string, string]) => {
      const details = await fetchActivity(id);
      return {
        streamData: (details.streamData ?? {}) as StreamData,
        avgHr: details.avgHr,
        maxHr: details.maxHr,
      };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  return {
    data: data ?? null,
    isLoading,
    error: error ?? null,
  };
}
```

- [ ] **Step 5: Update useDragDrop — remove apiKey param**

In `app/hooks/useDragDrop.ts`:
- Replace `import { updateEvent } from "@/lib/intervalsApi"` with `import { updateEvent } from "@/lib/intervalsClient"`
- Remove `apiKey` from function signature: `useDragDrop(setEvents)` instead of `useDragDrop(apiKey, setEvents)`
- Update line 64: `await updateEvent(numericId, { start_date_local: newDateLocal })` (drop `apiKey`)

- [ ] **Step 6: Update useRunData — remove apiKey param**

In `app/hooks/useRunData.ts`:
- Remove `apiKey` parameter from function signature
- Update line 35: `useStreamCache(enabled, completedRuns)` (drop `apiKey`)

- [ ] **Step 7: Update useHydrateStore — remove apiKey usage**

In `app/hooks/useHydrateStore.ts`:
- Remove `import apiKeyAtom` from atoms import (line 9)
- Remove `const apiKey = useAtomValue(apiKeyAtom)` (line 70)
- Line 73: `useSharedCalendarData()` instead of `useSharedCalendarData(apiKey)`
- Line 103: `useRunData(true, cal.events, bg.readings, settings?.diabetesMode)` (drop `apiKey`)
- Line 141: `usePaceCurves()` instead of `usePaceCurves(apiKey)`

- [ ] **Step 8: Commit**

```
refactor: remove apiKey from all hooks — use proxy via intervalsClient
```

---

### Task 6: Update screens and components — remove apiKey usage

**Files:**
- Modify: `app/screens/CalendarScreen.tsx`
- Modify: `app/screens/PlannerScreen.tsx`
- Modify: `app/screens/IntelScreen.tsx`
- Modify: `app/components/CalendarView.tsx`
- Modify: `app/components/WorkoutGenerator.tsx`
- Modify: `app/components/EventModal.tsx`

- [ ] **Step 1: Update CalendarScreen — remove apiKey**

In `app/screens/CalendarScreen.tsx`:
- Remove `apiKeyAtom` from imports (line 5)
- Remove `const apiKey = useAtomValue(apiKeyAtom)` (line 18)
- Remove `apiKey={apiKey}` from CalendarView props (line 32)

- [ ] **Step 2: Update CalendarView — remove apiKey prop**

In `app/components/CalendarView.tsx`:
- Remove `apiKey: string` from CalendarViewProps (line 39)
- Remove `apiKey` from destructured props (line 54)
- Replace `import { deleteEvent, deleteActivity } from "@/lib/intervalsApi"` with `import { deleteEvent, deleteActivity } from "@/lib/intervalsClient"`
- Line 111: `useDragDrop(setEvents)` instead of `useDragDrop(apiKey, setEvents)`
- Line 115: `useActivityStream(selectedActivityId ?? null)` instead of `useActivityStream(selectedActivityId ?? null, apiKey)`
- Lines 180, 184: `deleteActivity(activityId)` and `deleteEvent(numericId)` (drop `apiKey` first arg)
- Line 402: Remove `apiKey={apiKey}` from EventModal props

- [ ] **Step 3: Update PlannerScreen — use intervalsClient**

In `app/screens/PlannerScreen.tsx`:
- Replace `import { uploadToIntervals, updateEvent } from "@/lib/intervalsApi"` with `import { uploadPlan, updateEvent } from "@/lib/intervalsClient"`
- Replace `apiKeyAtom` import with `intervalsConnectedAtom`
- Line 41: `const connected = useAtomValue(intervalsConnectedAtom)`
- Lines 81, 97, 206: Check `!connected` instead of `!apiKey`
- Line 103: `await uploadPlan(planEvents)` instead of `await uploadToIntervals(apiKey, planEvents)`
- Line 228: `updateEvent(eventId, { description, ...(fuelRate != null && { carbs_per_hour: Math.round(fuelRate) }) })` (drop `apiKey`)

- [ ] **Step 4: Update IntelScreen — use intervalsClient**

In `app/screens/IntelScreen.tsx`:
- Replace `import { fetchActivityById } from "@/lib/intervalsApi"` with `import { fetchActivity } from "@/lib/intervalsClient"`
- Replace `apiKeyAtom` import with `intervalsConnectedAtom` (if needed for UI gating, otherwise just remove)
- Line 185: Remove or replace `const apiKey = useAtomValue(apiKeyAtom)`
- Line 240: `fetchActivity(selectedActivityId)` instead of `fetchActivityById(apiKey, selectedActivityId)`
- Line 261-263: `useActivityStream(selectedEvent?.activityId ?? null)` (drop `apiKey`)
- Line 281: `usePaceCurves("all")` instead of `usePaceCurves(apiKey, "all")`

- [ ] **Step 5: Update WorkoutGenerator — use intervalsClient**

In `app/components/WorkoutGenerator.tsx`:
- Replace `import { replaceWorkoutOnDate } from "@/lib/intervalsApi"` with `import { replaceWorkout } from "@/lib/intervalsClient"`
- Replace `apiKeyAtom` import with `intervalsConnectedAtom`
- Line 45: `const connected = useAtomValue(intervalsConnectedAtom)` instead of `apiKeyAtom`
- Line 87: `await replaceWorkout(existingEventId, workout)` instead of `await replaceWorkoutOnDate(apiKey, existingEventId, workout)`

- [ ] **Step 6: Update EventModal — use intervalsClient**

In `app/components/EventModal.tsx`:
- Replace `import { updateEvent } from "@/lib/intervalsApi"` with `import { updateEvent } from "@/lib/intervalsClient"`
- Remove `apiKey` from props if it's passed as a prop (check EventModal interface)
- Line 164: `await updateEvent(numericId, { start_date_local: newDateLocal })` (drop `apiKey`)

- [ ] **Step 7: Run tsc, lint, tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: All pass — no remaining references to `apiKeyAtom` or client-side `intervalsApiKey`

- [ ] **Step 8: Commit**

```
refactor: remove apiKey from all screens and components
```

---

### Task 7: Cleanup — verify no remaining client-side API key references

- [ ] **Step 1: Search for straggling references**

Run: `grep -r "apiKeyAtom\|apiKey" app/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."`

Expected: Zero matches referencing the old `apiKeyAtom`. The only `apiKey` references should be in server-side code (API routes using credentials).

- [ ] **Step 2: Search for direct intervalsApi imports from client code**

Run: `grep -r "from.*intervalsApi" app/ --include="*.ts" --include="*.tsx" | grep -v ".test." | grep -v "route.ts"`

Expected: Zero matches — client code should only import from `intervalsClient`, not `intervalsApi`.

- [ ] **Step 3: Verify intervalsApiKey is no longer in settings response**

Check that `lib/settings.ts` UserSettings type has `intervalsConnected?: boolean` not `intervalsApiKey?: string`.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All 1087+ tests pass

- [ ] **Step 5: Run the app locally and verify calendar loads**

Run: `npm run dev`
- Open browser, sign in
- Calendar should load (via proxy now)
- Generate a workout, sync it — should work through proxy

- [ ] **Step 6: Final commit if any cleanup was needed**

```
chore: remove remaining apiKey references from client code
```
