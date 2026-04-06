# Wizard Watch Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add watch connection verification to the setup wizard so users can't complete onboarding without activity data flowing, and explain what Intervals.icu is before asking for an API key.

**Architecture:** Single PR. Three areas: (1) new `fetchConnectionStatus()` in `lib/intervalsApi.ts` that extracts platform connection fields from the existing `GET /athlete/0` response, (2) new API route `GET /api/intervals/connections` that calls it, (3) wizard UI changes — "What you'll need" in WelcomeStep, data flow diagram in IntervalsStep, new WatchStep component, step numbering update from 7→8.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest, MSW, Tailwind

**Spec:** `docs/specs/2026-04-06-wizard-watch-connection.md`

**Prerequisite:** The `first-run-experience` branch must be merged to `main` first (or this branch must be based on it). The plan assumes the 7-step wizard with `DoneStep` generating a plan.

---

### Task 1: Extract `fetchAthleteRaw()` and add `fetchConnectionStatus()`

**Files:**
- Modify: `lib/intervalsApi.ts:24-44`
- Create: `lib/__tests__/connectionStatus.test.ts`

- [ ] **Step 1: Write the test for `fetchConnectionStatus`**

Create `lib/__tests__/connectionStatus.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchConnectionStatus } from "../intervalsApi";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function athleteResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    sportSettings: [],
    // Defaults: nothing connected
    icu_garmin_health: false,
    icu_garmin_sync_activities: false,
    icu_garmin_upload_workouts: false,
    polar_scope: null,
    polar_sync_activities: false,
    suunto_user_id: null,
    suunto_sync_activities: null,
    suunto_upload_workouts: null,
    coros_user_id: null,
    coros_sync_activities: false,
    coros_upload_workouts: false,
    wahoo_user_id: null,
    wahoo_sync_activities: false,
    wahoo_upload_workouts: false,
    zepp_user_id: null,
    zepp_sync_activities: false,
    zepp_upload_workouts: false,
    huawei_user_id: null,
    huawei_sync_activities: false,
    huawei_upload_workouts: false,
    strava_id: null,
    strava_authorized: false,
    strava_sync_activities: true, // true by default even when disconnected!
    ...overrides,
  };
}

describe("fetchConnectionStatus", () => {
  it("detects Garmin connected with sync and upload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        icu_garmin_health: true,
        icu_garmin_sync_activities: true,
        icu_garmin_upload_workouts: true,
      })),
    });

    const result = await fetchConnectionStatus("test-key");
    const garmin = result.platforms.find((p) => p.platform === "garmin");
    expect(garmin).toEqual({
      platform: "garmin",
      linked: true,
      syncActivities: true,
      uploadWorkouts: true,
    });
  });

  it("returns empty platforms when nothing is connected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(athleteResponse()),
    });

    const result = await fetchConnectionStatus("test-key");
    const linked = result.platforms.filter((p) => p.linked);
    expect(linked).toHaveLength(0);
  });

  it("does not false-positive on Strava sync_activities default", async () => {
    // strava_sync_activities is true by default even when strava_id is null
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        strava_sync_activities: true,
        strava_id: null,
        strava_authorized: false,
      })),
    });

    const result = await fetchConnectionStatus("test-key");
    const strava = result.platforms.find((p) => p.platform === "strava");
    expect(strava?.linked).toBe(false);
    expect(strava?.syncActivities).toBe(false);
  });

  it("detects Strava connected and authorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        strava_id: 12345,
        strava_authorized: true,
        strava_sync_activities: true,
      })),
    });

    const result = await fetchConnectionStatus("test-key");
    const strava = result.platforms.find((p) => p.platform === "strava");
    expect(strava).toEqual({
      platform: "strava",
      linked: true,
      syncActivities: true,
      uploadWorkouts: false,
    });
  });

  it("detects Polar linked but sync off", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        polar_scope: "read",
        polar_sync_activities: false,
      })),
    });

    const result = await fetchConnectionStatus("test-key");
    const polar = result.platforms.find((p) => p.platform === "polar");
    expect(polar?.linked).toBe(true);
    expect(polar?.syncActivities).toBe(false);
  });

  it("returns empty platforms on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await fetchConnectionStatus("bad-key");
    expect(result.platforms).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/connectionStatus.test.ts`
Expected: FAIL — `fetchConnectionStatus` does not exist yet.

- [ ] **Step 3: Implement `fetchAthleteRaw` and `fetchConnectionStatus`**

In `lib/intervalsApi.ts`, replace the existing `fetchAthleteProfile` with a shared raw fetch, then build both consumers on top:

```typescript
// --- ATHLETE PROFILE ---

// The Intervals.icu athlete response has 100+ fields across 14 platforms.
// Typing them all would be maintenance burden with no safety gain — we access specific fields by name.
type AthleteRaw = Record<string, unknown>;

async function fetchAthleteRaw(apiKey: string): Promise<AthleteRaw | null> {
  try {
    const res = await fetch(`${API_BASE}/athlete/0`, {
      headers: { Authorization: authHeader(apiKey) },
    });
    if (!res.ok) return null;
    return (await res.json()) as AthleteRaw;
  } catch {
    return null;
  }
}

export async function fetchAthleteProfile(apiKey: string): Promise<{ lthr?: number; maxHr?: number; hrZones?: number[] }> {
  const data = await fetchAthleteRaw(apiKey);
  if (!data) return {};
  const runSettings = Array.isArray(data.sportSettings)
    ? (data.sportSettings as { types?: string[]; lthr?: number; max_hr?: number; hr_zones?: number[] }[]).find((s) => s.types?.includes("Run"))
    : null;
  if (!runSettings) return {};
  const result: { lthr?: number; maxHr?: number; hrZones?: number[] } = {};
  if (typeof runSettings.lthr === "number" && runSettings.lthr > 0) result.lthr = runSettings.lthr;
  if (typeof runSettings.max_hr === "number" && runSettings.max_hr > 0) result.maxHr = runSettings.max_hr;
  if (Array.isArray(runSettings.hr_zones) && runSettings.hr_zones.length === 5) result.hrZones = runSettings.hr_zones;
  return result;
}

export interface PlatformConnection {
  platform: "garmin" | "polar" | "suunto" | "coros" | "wahoo" | "amazfit" | "strava" | "huawei";
  linked: boolean;
  syncActivities: boolean;
  uploadWorkouts: boolean;
}

export interface ConnectionStatus {
  platforms: PlatformConnection[];
}

export async function fetchConnectionStatus(apiKey: string): Promise<ConnectionStatus> {
  const data = await fetchAthleteRaw(apiKey);
  if (!data) return { platforms: [] };

  const platforms: PlatformConnection[] = [
    {
      platform: "garmin",
      linked: data.icu_garmin_health === true,
      syncActivities: data.icu_garmin_sync_activities === true,
      uploadWorkouts: data.icu_garmin_upload_workouts === true,
    },
    {
      platform: "polar",
      linked: data.polar_scope != null,
      syncActivities: data.polar_scope != null && data.polar_sync_activities === true,
      uploadWorkouts: false, // Polar doesn't support workout upload via Intervals API
    },
    {
      platform: "suunto",
      linked: data.suunto_user_id != null,
      syncActivities: data.suunto_user_id != null && data.suunto_sync_activities === true,
      uploadWorkouts: data.suunto_upload_workouts === true,
    },
    {
      platform: "coros",
      linked: data.coros_user_id != null,
      syncActivities: data.coros_user_id != null && data.coros_sync_activities === true,
      uploadWorkouts: data.coros_upload_workouts === true,
    },
    {
      platform: "wahoo",
      linked: data.wahoo_user_id != null,
      syncActivities: data.wahoo_user_id != null && data.wahoo_sync_activities === true,
      uploadWorkouts: data.wahoo_upload_workouts === true,
    },
    {
      platform: "amazfit",
      linked: data.zepp_user_id != null,
      syncActivities: data.zepp_user_id != null && data.zepp_sync_activities === true,
      uploadWorkouts: data.zepp_upload_workouts === true,
    },
    {
      platform: "huawei",
      linked: data.huawei_user_id != null,
      syncActivities: data.huawei_user_id != null && data.huawei_sync_activities === true,
      uploadWorkouts: data.huawei_upload_workouts === true,
    },
    {
      platform: "strava",
      linked: data.strava_id != null,
      syncActivities: data.strava_id != null && data.strava_authorized === true,
      uploadWorkouts: false,
    },
  ];

  return { platforms };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/connectionStatus.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npm test`
Expected: All tests pass. The `fetchAthleteProfile` refactor must produce identical output.

- [ ] **Step 6: Commit**

```
feat: add fetchConnectionStatus to detect watch platform connections
```

---

### Task 2: API route `GET /api/intervals/connections`

**Files:**
- Create: `app/api/intervals/connections/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/intervals/connections/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireAuth, unauthorized, AuthError } from "@/lib/apiHelpers";
import { getUserCredentials } from "@/lib/credentials";
import { fetchConnectionStatus } from "@/lib/intervalsApi";

export async function GET() {
  let email: string;
  try {
    email = await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return unauthorized();
    throw e;
  }

  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) {
    return NextResponse.json({ error: "No Intervals.icu API key configured" }, { status: 400 });
  }

  const status = await fetchConnectionStatus(creds.intervalsApiKey);
  return NextResponse.json(status);
}
```

This follows the same auth pattern as `app/api/settings/route.ts`: `requireAuth()` → email → `getUserCredentials(email)` → `creds.intervalsApiKey`.

- [ ] **Step 2: Verify locally**

Run: `npm run dev`
Open: `http://localhost:3000/api/intervals/connections`
Expected: JSON response with platforms array showing Garmin connected (for Per's account).

- [ ] **Step 3: Commit**

```
feat: add GET /api/intervals/connections endpoint
```

---

### Task 3: WelcomeStep — "What you'll need" checklist

**Files:**
- Modify: `app/setup/WelcomeStep.tsx`

- [ ] **Step 1: Add the checklist section**

In `app/setup/WelcomeStep.tsx`, add the "What you'll need" section between the timezone `<select>` and the Next button (between the closing `</div>` of `space-y-4` and the `<button>`):

```tsx
      {/* What you'll need */}
      <div className="border-t border-border pt-4 mt-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">What you'll need</p>

        <div className="flex gap-3 items-start mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0 text-base">⌚</div>
          <div>
            <p className="text-sm font-medium text-text">A GPS running watch</p>
            <p className="text-xs text-muted">Garmin · Polar · Suunto · Coros · Wahoo · Apple Watch · Wear OS</p>
          </div>
        </div>

        <div className="flex gap-3 items-start mb-3">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-brand">ICU</div>
          <div>
            <p className="text-sm font-medium text-text">A free Intervals.icu account</p>
            <p className="text-xs text-muted">Bridges your watch data to Springa. We'll set this up next.</p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0 text-base">📈</div>
          <div>
            <p className="text-sm font-medium text-text">CGM + Nightscout <span className="text-xs text-muted font-normal">(optional)</span></p>
            <p className="text-xs text-muted">Use a continuous glucose monitor? Connect it for live BG tracking during runs, smart fuel rate recommendations, and post-run glucose analysis.</p>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`
Open: `http://localhost:3000/setup`
Expected: WelcomeStep shows name, timezone, then "What you'll need" with three items, then Next button.

- [ ] **Step 3: Commit**

```
feat: add "What you'll need" checklist to WelcomeStep
```

---

### Task 4: IntervalsStep — data flow diagram + title rename

**Files:**
- Modify: `app/setup/IntervalsStep.tsx`

- [ ] **Step 1: Replace the title and subtitle**

In `app/setup/IntervalsStep.tsx`, replace the current title block:

```tsx
      <h2 className="text-2xl font-bold text-text mb-2">Connect Your Watch</h2>
      <p className="text-muted mb-6">
        Springa syncs workouts to your Garmin watch via Intervals.icu.
      </p>
```

With the data flow diagram and new title:

```tsx
      <h2 className="text-2xl font-bold text-text mb-4">Connect to Intervals.icu</h2>

      {/* Data flow diagram */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="text-center">
          <div className="w-10 h-10 bg-brand/10 rounded-lg flex items-center justify-center mx-auto mb-1 text-lg">⌚</div>
          <span className="text-[10px] text-muted">Watch</span>
        </div>
        <span className="text-muted text-sm">→</span>
        <div className="text-center">
          <div className="w-10 h-10 bg-brand/20 rounded-lg flex items-center justify-center mx-auto mb-1 text-[10px] font-bold text-brand">ICU</div>
          <span className="text-[10px] text-muted">Intervals</span>
        </div>
        <span className="text-muted text-sm">↔</span>
        <div className="text-center">
          <div className="w-10 h-10 bg-brand/10 rounded-lg flex items-center justify-center mx-auto mb-1 text-[10px] font-bold text-brand">S</div>
          <span className="text-[10px] text-muted">Springa</span>
        </div>
      </div>
      <p className="text-muted text-xs text-center mb-6">
        Intervals.icu stores your training data and syncs workouts to your watch. Springa reads it to build and adjust your plan.
      </p>
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`
Expected: IntervalsStep shows "Connect to Intervals.icu" title, data flow diagram with three boxes, then the existing instructions and API key input.

- [ ] **Step 3: Commit**

```
feat: add data flow diagram and rename IntervalsStep title
```

---

### Task 5: WatchStep component

**Files:**
- Create: `app/setup/WatchStep.tsx`

- [ ] **Step 1: Create the WatchStep component**

Create `app/setup/WatchStep.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { ExternalLink, RefreshCw, Check, AlertTriangle } from "lucide-react";
import type { PlatformConnection } from "@/lib/intervalsApi";

type WatchType = "garmin" | "polar" | "suunto" | "coros" | "wahoo" | "amazfit" | "apple" | "wearos" | "none" | null;

interface WatchStepProps {
  onNext: () => void;
  onBack: () => void;
}

const DIRECT_WATCHES: { key: WatchType; label: string }[] = [
  { key: "garmin", label: "Garmin" },
  { key: "polar", label: "Polar" },
  { key: "suunto", label: "Suunto" },
  { key: "coros", label: "Coros" },
  { key: "wahoo", label: "Wahoo" },
  { key: "amazfit", label: "Amazfit" },
];

const PLATFORM_NAMES: Record<string, string> = {
  garmin: "Garmin",
  polar: "Polar",
  suunto: "Suunto",
  coros: "Coros",
  wahoo: "Wahoo",
  amazfit: "Amazfit",
  strava: "Strava",
  huawei: "Huawei",
};

export function WatchStep({ onNext, onBack }: WatchStepProps) {
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [selectedWatch, setSelectedWatch] = useState<WatchType>(null);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/intervals/connections");
      if (!res.ok) return;
      const data = (await res.json()) as { platforms: PlatformConnection[] };
      setPlatforms(data.platforms);
    } catch {
      // Network error — user can retry with "Check again"
    }
  };

  useEffect(() => {
    void fetchConnections().finally(() => { setLoading(false); });
  }, []);

  const handleCheckAgain = async () => {
    setChecking(true);
    await fetchConnections();
    setChecking(false);
  };

  const syncing = platforms.filter((p) => p.syncActivities);
  const directSyncing = syncing.filter((p) => p.platform !== "strava");
  const stravaOnly = syncing.length > 0 && directSyncing.length === 0;
  const linkedButNotSyncing = platforms.filter((p) => p.linked && !p.syncActivities);
  const hasUploadWorkouts = platforms.some((p) => p.syncActivities && p.uploadWorkouts);
  const isConnected = directSyncing.length > 0;

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
        <div className="flex items-center justify-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
          <span className="ml-3 text-muted text-sm">Checking watch connection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Connect Your Watch</h2>

      {/* State 1: Direct watch connected */}
      {isConnected && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-success/10 border border-success/20 rounded-lg p-4">
            <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-text font-medium">
                Your {directSyncing.map((p) => PLATFORM_NAMES[p.platform]).join(" & ")} is connected and syncing activities.
              </p>
              <p className="text-xs text-muted mt-1">
                {hasUploadWorkouts
                  ? "Planned workouts will sync to your watch automatically."
                  : "Your runs will sync to Springa. To get planned workouts on your watch, enable \"Upload planned workouts\" in Intervals.icu settings."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* State: Strava-only warning */}
      {stravaOnly && !isConnected && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-text font-medium">
                Strava is connected, but has API restrictions that limit data quality.
              </p>
              <p className="text-xs text-muted mt-1">
                For the best experience, connect your watch directly to Intervals.icu instead.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* State: Connected but sync disabled */}
      {!isConnected && !stravaOnly && linkedButNotSyncing.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-text font-medium">
                Your {linkedButNotSyncing.map((p) => PLATFORM_NAMES[p.platform]).join(" & ")} is connected but activity sync is turned off.
              </p>
              <p className="text-xs text-muted mt-1">
                Enable it in <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Intervals.icu → Settings → Connections</a>.
              </p>
            </div>
          </div>
          <button
            onClick={() => { void handleCheckAgain(); }}
            disabled={checking}
            className="flex items-center gap-2 text-sm text-brand hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Check again"}
          </button>
        </div>
      )}

      {/* State 2: No connection — show watch selector */}
      {!isConnected && linkedButNotSyncing.length === 0 && !stravaOnly && (
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Springa needs your watch connected to Intervals.icu to read your runs.
          </p>

          {selectedWatch === "none" ? (
            /* State 3: No watch */
            <div className="bg-error/10 border border-error/20 rounded-lg p-4">
              <p className="text-sm text-text font-medium mb-2">A running watch is required</p>
              <p className="text-xs text-muted">
                Springa needs run data from a GPS watch with a heart rate sensor to work. It generates structured workouts with HR zone targets and analyzes your compliance — that requires a watch on your wrist.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-text">What watch do you use?</p>
              <div className="flex flex-wrap gap-2">
                {DIRECT_WATCHES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setSelectedWatch(key); }}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                      selectedWatch === key
                        ? "border-brand bg-brand/10 text-brand font-medium"
                        : "border-border text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedWatch("apple"); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                    selectedWatch === "apple"
                      ? "border-brand bg-brand/10 text-brand font-medium"
                      : "border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  Apple Watch
                </button>
                <button
                  onClick={() => { setSelectedWatch("wearos"); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                    selectedWatch === "wearos"
                      ? "border-brand bg-brand/10 text-brand font-medium"
                      : "border-border text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  Wear OS / Samsung
                </button>
              </div>

              {/* Platform-specific instructions */}
              {selectedWatch && DIRECT_WATCHES.some((w) => w.key === selectedWatch) && (
                <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted">
                    Go to <strong className="text-text">Intervals.icu → Settings → Connections</strong> and connect your {PLATFORM_NAMES[selectedWatch] ?? selectedWatch}. Come back here when it's done.
                  </p>
                  <a href="https://intervals.icu/settings" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <ExternalLink size={14} />
                    Open Intervals.icu Settings
                  </a>
                </div>
              )}

              {selectedWatch === "apple" && (
                <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted">
                    Install <strong className="text-text">HealthFit</strong> ($7, one-time) on your iPhone. It auto-syncs Apple Watch runs to Intervals.icu in the background.
                  </p>
                  <a href="https://apps.apple.com/app/healthfit/id1202650514" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <ExternalLink size={14} />
                    HealthFit on App Store
                  </a>
                </div>
              )}

              {selectedWatch === "wearos" && (
                <div className="bg-surface-alt border border-border rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted">
                    Install <strong className="text-text">Health Sync</strong> (~$3, one-time) on your phone. It auto-syncs your watch runs to Intervals.icu in the background.
                  </p>
                  <a href="https://play.google.com/store/apps/details?id=nl.appyhapps.healthsync" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand hover:underline">
                    <ExternalLink size={14} />
                    Health Sync on Google Play
                  </a>
                </div>
              )}

              {selectedWatch && (
                <button
                  onClick={() => { void handleCheckAgain(); }}
                  disabled={checking}
                  className="flex items-center gap-2 text-sm text-brand hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                  {checking ? "Checking..." : "Check again"}
                </button>
              )}

              <button
                onClick={() => { setSelectedWatch("none"); }}
                className="text-xs text-muted hover:text-text transition"
              >
                I don't have a running watch
              </button>
            </>
          )}
        </div>
      )}

      {/* Strava "continue anyway" */}
      {stravaOnly && !isConnected && (
        <button
          onClick={onNext}
          className="text-xs text-muted hover:text-text transition mt-2"
        >
          Continue with Strava anyway →
        </button>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isConnected && !stravaOnly}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev`
The component isn't wired into the wizard yet (that's Task 6), but verify it renders by temporarily importing it in a test page or checking for TypeScript errors.

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```
feat: add WatchStep component with platform detection and guidance
```

---

### Task 6: Wire WatchStep into the wizard + update step numbering

**Files:**
- Modify: `app/setup/page.tsx`

- [ ] **Step 1: Add WatchStep import and update Step type**

In `app/setup/page.tsx`:

Add import:
```typescript
import { WatchStep } from "./WatchStep";
```

Change Step type:
```typescript
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
```

- [ ] **Step 2: Insert WatchStep at position 3, shift all subsequent steps**

Update the step rendering. The IntervalsStep (step 2) now advances to step 3 (WatchStep). All existing steps 3-7 shift to 4-8:

```tsx
        {step === 2 && (
          <IntervalsStep
            onNext={(intervalsApiKey, profile) => {
              updateData({ intervalsApiKey, ...profile });
              setStep(3);  // → WatchStep (was ScheduleStep)
            }}
            onBack={() => { setStep(1); }}
          />
        )}
        {step === 3 && (
          <WatchStep
            onNext={() => { setStep(4); }}
            onBack={() => { setStep(2); }}
          />
        )}
        {step === 4 && (
          <ScheduleStep
            runDays={data.runDays}
            onNext={(runDays) => {
              updateData({ runDays });
              setStep(5);
            }}
            onBack={() => { setStep(3); }}
          />
        )}
        {step === 5 && (
          <GoalStep
            raceDate={data.raceDate}
            raceName={data.raceName}
            raceDist={data.raceDist}
            onNext={(goal) => {
              updateData(goal);
              setStep(6);
            }}
            onSkip={() => { setStep(6); }}
            onBack={() => { setStep(4); }}
          />
        )}
        {step === 6 && (
          <HRZonesStep
            lthr={data.lthr}
            maxHr={data.maxHr}
            hrZones={data.hrZones}
            onNext={(zones) => {
              updateData(zones);
              setStep(7);
            }}
            onSkip={() => { setStep(7); }}
            onBack={() => { setStep(5); }}
          />
        )}
        {step === 7 && (
          <DiabetesStep
            diabetesMode={data.diabetesMode}
            nightscoutUrl={data.nightscoutUrl}
            nightscoutSecret={data.nightscoutSecret}
            onNext={(diabetesData) => {
              updateData(diabetesData);
              setStep(8);
            }}
            onBack={() => { setStep(6); }}
          />
        )}
        {step === 8 && (
          <DoneStep
            onComplete={handleComplete}
            generating={generating}
          />
        )}
```

- [ ] **Step 3: Update progress indicator and step counter**

Update the progress dots array:
```tsx
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
```

Update the step counter text:
```tsx
          Step {step} of 8
```

- [ ] **Step 4: Verify the full wizard flow**

Run: `npm run dev`
Navigate through all 8 steps. Verify:
- Step 1: name, timezone, "What you'll need" checklist
- Step 2: data flow diagram, API key input
- Step 3: watch connection check (shows green for connected accounts, yellow for new accounts)
- Steps 4-8: unchanged behavior
- Back buttons navigate correctly
- Progress dots show 8 steps

- [ ] **Step 5: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 6: Commit**

```
feat: wire WatchStep into wizard as step 3, update numbering to 8 steps
```

---

### Task 7: Integration tests for WatchStep

**Files:**
- Create: `app/setup/__tests__/WatchStep.test.tsx`

- [ ] **Step 1: Write integration tests**

Create `app/setup/__tests__/WatchStep.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchStep } from "../WatchStep";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function connectionsResponse(platforms: Array<{ platform: string; linked: boolean; syncActivities: boolean; uploadWorkouts: boolean }>) {
  return {
    ok: true,
    json: () => Promise.resolve({ platforms }),
  };
}

describe("WatchStep", () => {
  const onNext = vi.fn();
  const onBack = vi.fn();

  beforeEach(() => {
    onNext.mockReset();
    onBack.mockReset();
    mockFetch.mockReset();
  });

  it("shows green state when Garmin is connected", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: true },
    ]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Garmin is connected and syncing/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Planned workouts will sync/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("shows watch selector when nothing is connected", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/What watch do you use/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows Garmin instructions when selected", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/What watch do you use/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Garmin" }));
    expect(screen.getByText(/Intervals.icu → Settings → Connections/)).toBeInTheDocument();
  });

  it("shows HealthFit instructions for Apple Watch", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/What watch do you use/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Apple Watch" }));
    expect(screen.getByText(/HealthFit/)).toBeInTheDocument();
  });

  it("shows Health Sync instructions for Wear OS", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/What watch do you use/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Wear OS/ }));
    expect(screen.getByText(/Health Sync/)).toBeInTheDocument();
  });

  it("shows blocked state when user selects no watch", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/What watch do you use/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/I don't have a running watch/));
    expect(screen.getByText(/A running watch is required/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows Strava warning when only Strava is connected", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([
      { platform: "strava", linked: true, syncActivities: true, uploadWorkouts: false },
    ]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Strava is connected, but has API restrictions/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Continue with Strava anyway/)).toBeInTheDocument();
  });

  it("re-fetches on Check again click", async () => {
    // First fetch: nothing connected
    mockFetch.mockResolvedValueOnce(connectionsResponse([]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText(/What watch do you use/)).toBeInTheDocument();
    });

    // Select Garmin to show Check again button
    await user.click(screen.getByRole("button", { name: "Garmin" }));

    // Second fetch: Garmin now connected
    mockFetch.mockResolvedValueOnce(connectionsResponse([
      { platform: "garmin", linked: true, syncActivities: true, uploadWorkouts: true },
    ]));

    await user.click(screen.getByText(/Check again/));

    await waitFor(() => {
      expect(screen.getByText(/Garmin is connected and syncing/)).toBeInTheDocument();
    });
  });

  it("shows sync-off warning when platform linked but not syncing", async () => {
    mockFetch.mockResolvedValueOnce(connectionsResponse([
      { platform: "polar", linked: true, syncActivities: false, uploadWorkouts: false },
    ]));

    render(<WatchStep onNext={onNext} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/Polar is connected but activity sync is turned off/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run app/setup/__tests__/WatchStep.test.tsx`
Expected: All 9 tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass. No regressions from the refactored `fetchAthleteProfile`.

- [ ] **Step 4: Commit**

```
test: add WatchStep integration tests for all connection states
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Run full lint, type check, and test suite**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: All clean.

- [ ] **Step 2: Test the complete wizard flow end-to-end**

Run: `npm run dev`
Walk through the entire 8-step wizard:
1. Welcome — see checklist with watch, Intervals.icu, CGM
2. Intervals.icu — see data flow diagram, enter API key
3. Watch — see connection status (green/yellow depending on account)
4. Schedule — pick run days
5. Goal — set race
6. HR Zones — verify zones imported
7. Diabetes — toggle mode
8. Done — generate plan, redirect

- [ ] **Step 3: Verify mobile responsiveness**

Push to dev branch and test on phone:
```bash
git push origin HEAD:dev
```

Check each new/modified wizard step renders correctly on mobile.

- [ ] **Step 4: Commit any final adjustments**

If any visual tweaks are needed from the mobile test, fix and commit.
