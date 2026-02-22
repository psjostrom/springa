import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchCalendarData,
  updateEvent,
  uploadToIntervals,
  fetchActivityDetails,
  updateActivityCarbs,
} from "../intervalsApi";
import { API_BASE } from "../constants";
import type { WorkoutEvent } from "../types";

describe("fetchCalendarData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches activities and events in parallel", async () => {
    const mockActivities = [
      {
        id: "123",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "W01 Tue Short Intervals eco16",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
        average_heartrate: 150,
        max_heartrate: 175,
        icu_training_load: 45,
        icu_intensity: 85,
      },
    ];
    const mockEvents = [
      {
        id: 456,
        category: "WORKOUT",
        start_date_local: "2026-02-15T12:00:00",
        name: "W02 Thu Easy eco16",
        description: "PUMP ON - FUEL PER 10: 8g TOTAL: 32g",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEvents) });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBeGreaterThan(0);
    const completed = result.filter((e) => e.type === "completed");
    const planned = result.filter((e) => e.type === "planned");
    expect(completed.length).toBe(1);
    expect(planned.length).toBe(1);
  });

  it("deduplicates events that match completed activities", async () => {
    const mockActivities = [
      {
        id: "123",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "W01 Tue Short Intervals eco16",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
      },
    ];
    const mockEvents = [
      {
        id: 789,
        category: "WORKOUT",
        start_date_local: "2026-02-10T12:00:00",
        name: "W01 Tue Short Intervals eco16",
        description: "some desc",
        paired_activity_id: "123",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEvents) });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
  });

  it("throws on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    await expect(
      fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28")),
    ).rejects.toThrow("Network error");
  });

  it("merges event description into matching completed activity", async () => {
    const mockActivities = [
      {
        id: "123",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "W01 Tue Easy eco16",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
      },
    ];
    const mockEvents = [
      {
        id: 789,
        category: "WORKOUT",
        start_date_local: "2026-02-10T12:00:00",
        name: "W01 Tue Easy eco16",
        description: "PUMP ON - FUEL PER 10: 8g",
        paired_activity_id: "123",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEvents) });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    // The event's description should be merged into the completed activity
    expect(result[0].description).toContain("FUEL PER 10: 8g");
  });

  it("matches activity and event within ±3 days with exact name", async () => {
    const mockActivities = [
      {
        id: "123",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "W01 Tue Easy eco16",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
      },
    ];
    const mockEvents = [
      {
        id: 789,
        category: "WORKOUT",
        start_date_local: "2026-02-12T12:00:00",
        name: "W01 Tue Easy eco16",
        description: "PUMP ON - FUEL PER 10: 8g",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEvents) });
      }
      return Promise.resolve({ ok: false, text: () => Promise.resolve("") });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    // 2-day gap with exact name → should match (merged into completed)
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    expect(result[0].description).toContain("FUEL PER 10: 8g");
  });

  it("does not match activity and event more than 3 days apart", async () => {
    const mockActivities = [
      {
        id: "123",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "W01 Tue Easy eco16",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
      },
    ];
    const mockEvents = [
      {
        id: 789,
        category: "WORKOUT",
        start_date_local: "2026-02-15T12:00:00",
        name: "W01 Tue Easy eco16",
        description: "PUMP ON - FUEL PER 10: 8g",
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEvents) });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    // 5-day gap → no match
    expect(result.length).toBe(2);
    expect(result.filter((e) => e.type === "completed").length).toBe(1);
    expect(result.filter((e) => e.type === "planned").length).toBe(1);
  });

  it("populates carbsIngested from activity carbs_ingested field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: "act-1",
              start_date: "2026-02-10T10:00:00",
              start_date_local: "2026-02-10T10:00:00",
              name: "W04 Tue Easy eco16",
              type: "Run",
              distance: 5000,
              moving_time: 1800,
              carbs_ingested: 55,
            },
          ]),
        });
      }
      if (url.includes("/events")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 100,
              category: "WORKOUT",
              start_date_local: "2026-02-10T12:00:00",
              name: "W04 Tue Easy eco16",
              description: "Warmup\n- 10m 66-78% LTHR",
              paired_activity_id: "act-1",
              carbs_per_hour: 48,
            },
          ]),
        });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    expect(result[0].carbsIngested).toBe(55); // actual from activity
    expect(result[0].fuelRate).toBe(48); // planned rate from event (carbs_per_hour)
  });

  it("defaults carbsIngested to planned totalCarbs when carbs_ingested is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: "act-2",
              start_date: "2026-02-10T10:00:00",
              start_date_local: "2026-02-10T10:00:00",
              name: "W04 Tue Easy eco16",
              type: "Run",
              distance: 5000,
              moving_time: 1800,
            },
          ]),
        });
      }
      if (url.includes("/events")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 101,
              category: "WORKOUT",
              start_date_local: "2026-02-10T12:00:00",
              name: "W04 Tue Easy eco16",
              description: "Warmup\n- 10m 66-78% LTHR",
              paired_activity_id: "act-2",
              carbs_per_hour: 48,
            },
          ]),
        });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    // carbsIngested defaults to totalCarbs (planned)
    expect(result[0].carbsIngested).toBe(result[0].totalCarbs);
    expect(result[0].activityId).toBe("act-2");
  });

  it("populates fuelRate from carbs_per_hour on planned events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 500,
              category: "WORKOUT",
              start_date_local: "2026-02-20T12:00:00",
              name: "W05 Tue Easy eco16",
              description: "Warmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 30m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
              carbs_per_hour: 48,
            },
          ]),
        });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    expect(result[0].fuelRate).toBe(48); // carbs_per_hour directly
    expect(result[0].totalCarbs).toBeDefined();
  });

  it("falls back to description parsing when carbs_per_hour is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 501,
              category: "WORKOUT",
              start_date_local: "2026-02-20T12:00:00",
              name: "W05 Tue Easy eco16",
              description: "FUEL PER 10: 8g TOTAL: 44g\n\nWarmup\n- FUEL PER 10: 8g TOTAL: 44g 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 40m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
            },
          ]),
        });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    expect(result[0].fuelRate).toBe(48); // 8g/10min × 6 = 48g/h
    // totalCarbs computed from fuelRate (48g/h) × estimated duration (55min/60) = 44
    expect(result[0].totalCarbs).toBe(44);
  });

  it("marks race events with type 'race'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              id: 100,
              category: "WORKOUT",
              start_date_local: "2026-06-13T08:00:00",
              name: "RACE DAY eco16",
              description: "Race day!",
            },
          ]),
        });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("race");
  });

  it("calls pair API for fallback-matched activity", async () => {
    const mockActivities = [
      {
        id: "act-99",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "W01 Tue Easy eco16",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
      },
    ];
    const mockEvents = [
      {
        id: 555,
        category: "WORKOUT",
        start_date_local: "2026-02-10T12:00:00",
        name: "W01 Tue Easy eco16",
        description: "Easy run",
        // No paired_activity_id — forces fallback matching
      },
    ];

    const fetchCalls: { url: string; method?: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      fetchCalls.push({ url, method: opts?.method, body: opts?.body as string });
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events/555") && opts?.method === "PUT") {
        return Promise.resolve({ ok: true });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockEvents) });
      }
      return Promise.resolve({ ok: false, text: () => Promise.resolve("") });
    }));

    await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));

    // Wait for fire-and-forget pair call to resolve
    await new Promise((r) => setTimeout(r, 50));

    const pairCall = fetchCalls.find(
      (c) => c.url.includes("/events/555") && c.method === "PUT",
    );
    expect(pairCall).toBeDefined();
    expect(JSON.parse(pairCall!.body!)).toEqual({ paired_activity_id: "act-99" });
  });

  it("filters to only Run and VirtualRun activities", async () => {
    const mockActivities = [
      {
        id: "1",
        start_date: "2026-02-10T10:00:00",
        start_date_local: "2026-02-10T10:00:00",
        name: "Easy Run",
        type: "Run",
        distance: 5000,
        moving_time: 1800,
      },
      {
        id: "2",
        start_date: "2026-02-11T10:00:00",
        start_date_local: "2026-02-11T10:00:00",
        name: "Morning Ride",
        type: "Ride",
        distance: 20000,
        moving_time: 3600,
      },
    ];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/activities")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockActivities) });
      }
      if (url.includes("/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false });
    }));

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Easy Run");
  });
});

describe("updateEvent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends PUT request with correct payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await updateEvent("test-key", 123, { start_date_local: "2026-02-15T12:00:00" });

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/athlete/0/events/123`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ start_date_local: "2026-02-15T12:00:00" }),
      }),
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 404, text: () => Promise.resolve("Not found"),
    }));
    await expect(updateEvent("test-key", 999, { name: "test" })).rejects.toThrow("Failed to update event");
  });
});

describe("uploadToIntervals", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes future workouts then uploads new plan", async () => {
    const calls: string[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") { calls.push("delete"); return Promise.resolve({ ok: true }); }
      if (opts?.method === "POST") { calls.push("upload"); return Promise.resolve({ ok: true, json: () => Promise.resolve([]) }); }
      return Promise.resolve({ ok: false });
    }));

    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test eco16", description: "Test", external_id: "test-1", type: "Run" },
    ];

    const count = await uploadToIntervals("test-key", events);
    expect(count).toBe(1);
    expect(calls).toEqual(["delete", "upload"]);
  });

  it("includes carbs_per_hour in upload payload when fuelRate is set", async () => {
    let capturedBody: unknown[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true });
      if (opts?.method === "POST") {
        capturedBody = JSON.parse(opts?.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false });
    }));

    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test eco16", description: "Test", external_id: "test-1", type: "Run", fuelRate: 60 },
    ];

    await uploadToIntervals("test-key", events);
    expect((capturedBody[0] as Record<string, unknown>).carbs_per_hour).toBe(60);
  });

  it("omits carbs_per_hour when fuelRate is undefined", async () => {
    let capturedBody: unknown[] = [];

    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true });
      if (opts?.method === "POST") {
        capturedBody = JSON.parse(opts?.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false });
    }));

    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test eco16", description: "Test", external_id: "test-1", type: "Run" },
    ];

    await uploadToIntervals("test-key", events);
    expect((capturedBody[0] as Record<string, unknown>).carbs_per_hour).toBeUndefined();
  });

  it("throws on upload failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === "DELETE") return Promise.resolve({ ok: true });
      if (opts?.method === "POST") return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("Internal Server Error") });
      return Promise.resolve({ ok: false });
    }));

    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test eco16", description: "Test", external_id: "test-1", type: "Run" },
    ];
    await expect(uploadToIntervals("test-key", events)).rejects.toThrow("API Error 500");
  });
});

describe("fetchActivityDetails", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and processes stream data", async () => {
    const mockStreams = [
      { type: "time", data: [0, 60, 120, 180] },
      { type: "heartrate", data: [120, 135, 150, 140] },
      { type: "velocity_smooth", data: [2.5, 2.6, 2.8, 2.7] },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockStreams),
    }));

    const result = await fetchActivityDetails("123", "test-key");
    expect(result.hrZones).toBeDefined();
    expect(result.streamData).toBeDefined();
    expect(result.avgHr).toBeDefined();
    expect(result.maxHr).toBe(150);
    expect(result.streamData!.heartrate).toBeDefined();
    expect(result.streamData!.pace).toBeDefined();
  });

  it("returns empty object on error", { timeout: 15000 }, async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
    const result = await fetchActivityDetails("123", "test-key");
    expect(result).toEqual({});
  });
});

describe("updateActivityCarbs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends PUT with carbs_ingested to activity endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await updateActivityCarbs("test-key", "i125839480", 60);

    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE}/activity/i125839480`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ carbs_ingested: 60 }),
      }),
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 404, text: () => Promise.resolve("Not found"),
    }));
    await expect(updateActivityCarbs("test-key", "bad-id", 50)).rejects.toThrow("Failed to update activity carbs");
  });
});
