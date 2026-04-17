import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, waitFor } from "@/lib/__tests__/test-utils";
import { server } from "@/lib/__tests__/msw/server";
import type { CalendarEvent } from "@/lib/types";

// Stub localStorage — hooks read/write cache here
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: () => null,
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// Import AFTER localStorage is available
const { useStreamCache } = await import("../useStreamCache");

const RUN_START = new Date("2026-04-10T08:00:00Z");
const RUN_START_MS = RUN_START.getTime();

function makeRun(activityId: string): CalendarEvent & { activityId: string } {
  return {
    id: `event-${activityId}`,
    date: RUN_START,
    name: "Easy Run eco16",
    description: "",
    type: "completed" as const,
    activityId,
    category: "easy" as const,
  };
}

function setupHandlers(options?: { bgStatus?: number }) {
  server.use(
    // Remote cache — empty (force fresh fetch)
    http.get("/api/bg-cache", () => HttpResponse.json([])),
    http.put("/api/bg-cache", () => HttpResponse.json({ ok: true })),

    // Streams — return HR data
    http.post("/api/intervals/streams", () => {
      return HttpResponse.json({
        "act-1": [
          { type: "heartrate", data: [120, 125, 130, 128, 126] },
          { type: "time", data: [0, 60, 120, 180, 240] },
        ],
      });
    }),

    // BG readings for run window
    http.get("/api/bg/run", () => {
      if (options?.bgStatus) {
        return new HttpResponse(null, { status: options.bgStatus });
      }
      return HttpResponse.json({
        readings: [
          { ts: RUN_START_MS, mmol: 8.0, sgv: 144, direction: "Flat", delta: 0 },
          { ts: RUN_START_MS + 2 * 60_000, mmol: 7.5, sgv: 135, direction: "FortyFiveDown", delta: -0.5 },
          { ts: RUN_START_MS + 4 * 60_000, mmol: 7.0, sgv: 126, direction: "Flat", delta: 0 },
        ],
      });
    }),
  );
}

describe("useStreamCache BG fetch", () => {
  beforeEach(() => {
    store.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and aligns BG per run, producing glucose data", async () => {
    setupHandlers();
    const runs = [makeRun("act-1")];

    const { result } = renderHook(() => useStreamCache(true, runs));

    await waitFor(() => {
      expect(result.current.cached.length).toBe(1);
    });

    const cached = result.current.cached[0];
    expect(cached.activityId).toBe("act-1");
    expect(cached.glucose).toBeDefined();
    expect(cached.glucose!.length).toBeGreaterThanOrEqual(2);
    // Glucose values should be in the range of the BG readings
    expect(cached.glucose![0].value).toBeCloseTo(8.0, 0);

    // Should also be persisted to localStorage
    const persisted = JSON.parse(store.get("bgcache_v6") ?? "[]");
    expect(persisted).toHaveLength(1);
    expect(persisted[0].glucose).toBeDefined();
  });

  it("does not persist activity when BG fetch fails (retried on next load)", async () => {
    setupHandlers({ bgStatus: 500 });
    const runs = [makeRun("act-1")];

    const { result } = renderHook(() => useStreamCache(true, runs));

    await waitFor(() => {
      expect(result.current.cached.length).toBe(1);
    });

    // Current session still shows the activity (with HR but no glucose)
    expect(result.current.cached[0].glucose).toBeUndefined();

    // Should NOT be persisted — will be retried on next load
    const persisted = JSON.parse(store.get("bgcache_v6") ?? "[]");
    expect(persisted).toHaveLength(0);
  });
});
