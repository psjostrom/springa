import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchCalendarData,
  updateEvent,
  uploadToIntervals,
  fetchActivityDetails,
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
        description: "PUMP ON (EASE OFF) - FUEL PER 10: 8g TOTAL: 32g",
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

  it("returns empty array on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result).toEqual([]);
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

  it("returns empty object on error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
    const result = await fetchActivityDetails("123", "test-key");
    expect(result).toEqual({});
  });
});
