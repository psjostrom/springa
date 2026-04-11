import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchCalendarData,
  updateEvent,
  uploadToIntervals,
  fetchActivityDetails,
  updateActivityCarbs,
  replaceWorkoutOnDate,
  fetchPaceCurves,
  updateThresholdPace,
  updatePaceZones,
} from "../intervalsApi";
import { API_BASE } from "../constants";
import type { WorkoutEvent } from "../types";
import { server } from "./msw/server";
import {
  capturedUploadPayload,
  capturedPutPayload,
  capturedDeleteEventIds,
  capturedActivityPutPayloads,
  capturedSportSettingsPayload,
} from "./msw/handlers";

describe("fetchCalendarData", () => {
  it("fetches activities and events in parallel", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "123",
            start_date: "2026-02-10T10:00:00",
            start_date_local: "2026-02-10T10:00:00",
            name: "W01 Short Intervals",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
            average_heartrate: 150,
            max_heartrate: 175,
            icu_training_load: 45,
            icu_intensity: 85,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 456,
            category: "WORKOUT",
            start_date_local: "2026-02-15T12:00:00",
            name: "W02 Easy",
            description: "PUMP ON - FUEL PER 10: 8g TOTAL: 32g",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2026-02-01"), new Date("2026-02-28"));
    expect(result.length).toBeGreaterThan(0);
    const completed = result.filter((e) => e.type === "completed");
    const planned = result.filter((e) => e.type === "planned");
    expect(completed.length).toBe(1);
    expect(planned.length).toBe(1);
  });

  it("deduplicates events that match completed activities", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "123",
            start_date: "2026-03-10T10:00:00",
            start_date_local: "2026-03-10T10:00:00",
            name: "W01 Short Intervals",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 789,
            category: "WORKOUT",
            start_date_local: "2026-03-10T12:00:00",
            name: "W01 Short Intervals",
            description: "some desc",
            paired_activity_id: "123",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2026-03-01"), new Date("2026-03-31"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
  });

  it("throws on fetch error", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.error();
      }),
    );

    await expect(
      fetchCalendarData("test-api-key-error", new Date("2026-01-01"), new Date("2026-01-31")),
    ).rejects.toThrow();
  });

  it("merges event description into matching completed activity", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "123",
            start_date: "2026-04-10T10:00:00",
            start_date_local: "2026-04-10T10:00:00",
            name: "W01 Easy",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 789,
            category: "WORKOUT",
            start_date_local: "2026-04-10T12:00:00",
            name: "W01 Easy",
            description: "PUMP ON - FUEL PER 10: 8g",
            paired_activity_id: "123",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2026-04-01"), new Date("2026-04-30"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    expect(result[0].description).toContain("FUEL PER 10: 8g");
  });

  it("matches activity and event within ±3 days with exact name", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "123",
            start_date: "2026-05-10T10:00:00",
            start_date_local: "2026-05-10T10:00:00",
            name: "W01 Easy",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 789,
            category: "WORKOUT",
            start_date_local: "2026-05-12T12:00:00",
            name: "W01 Easy",
            description: "PUMP ON - FUEL PER 10: 8g",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2026-05-01"), new Date("2026-05-31"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    expect(result[0].description).toContain("FUEL PER 10: 8g");
  });

  it("matches activity with Garmin location prefix to event name", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "456",
            start_date: "2026-06-10T10:00:00",
            start_date_local: "2026-06-10T10:00:00",
            name: "Järfälla - W03 Bonus Easy",
            type: "Run",
            distance: 6352,
            moving_time: 3200,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 999,
            category: "WORKOUT",
            start_date_local: "2026-06-10T12:00:00",
            name: "W03 Bonus Easy",
            description: "Easy run.",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    expect(result[0].description).toContain("Easy run.");
  });

  it("does not match activity and event more than 3 days apart", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "123",
            start_date: "2026-07-10T10:00:00",
            start_date_local: "2026-07-10T10:00:00",
            name: "W01 Easy",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 789,
            category: "WORKOUT",
            start_date_local: "2026-07-15T12:00:00",
            name: "W01 Easy",
            description: "PUMP ON - FUEL PER 10: 8g",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2026-07-01"), new Date("2026-07-31"));
    expect(result.length).toBe(2);
    expect(result.filter((e) => e.type === "completed").length).toBe(1);
    expect(result.filter((e) => e.type === "planned").length).toBe(1);
  });

  it("populates carbsIngested from activity carbs_ingested field", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "act-1",
            start_date: "2026-08-10T10:00:00",
            start_date_local: "2026-08-10T10:00:00",
            name: "W04 Easy",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
            carbs_ingested: 55,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 100,
            category: "WORKOUT",
            start_date_local: "2026-08-10T12:00:00",
            name: "W04 Easy",
            description: "Warmup\n- 10m 66-78% LTHR",
            paired_activity_id: "act-1",
            carbs_per_hour: 48,
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-key", new Date("2026-08-01"), new Date("2026-08-31"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("completed");
    expect(result[0].carbsIngested).toBe(55);
    expect(result[0].fuelRate).toBe(48);
  });

  it("defaults carbsIngested to planned totalCarbs when carbs_ingested is absent", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "act-2",
            start_date: "2026-09-10T10:00:00",
            start_date_local: "2026-09-10T10:00:00",
            name: "W04 Easy",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 101,
            category: "WORKOUT",
            start_date_local: "2026-09-10T12:00:00",
            name: "W04 Easy",
            description: "Warmup\n- 10m 66-78% LTHR",
            paired_activity_id: "act-2",
            carbs_per_hour: 48,
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-key", new Date("2026-09-01"), new Date("2026-09-30"));
    expect(result.length).toBe(1);
    expect(result[0].carbsIngested).toBe(result[0].totalCarbs);
    expect(result[0].activityId).toBe("act-2");
  });

  it("populates fuelRate from carbs_per_hour on planned events", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 500,
            category: "WORKOUT",
            start_date_local: "2026-10-20T12:00:00",
            name: "W05 Easy",
            description: "Warmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 30m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
            carbs_per_hour: 48,
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-key", new Date("2026-10-01"), new Date("2026-10-31"));
    expect(result.length).toBe(1);
    expect(result[0].fuelRate).toBe(48);
    expect(result[0].totalCarbs).toBeDefined();
  });

  it("returns null fuelRate when carbs_per_hour is absent", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 501,
            category: "WORKOUT",
            start_date_local: "2026-11-20T12:00:00",
            name: "W05 Easy",
            description: "Warmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 40m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-key", new Date("2026-11-01"), new Date("2026-11-30"));
    expect(result.length).toBe(1);
    expect(result[0].fuelRate).toBeNull();
    expect(result[0].totalCarbs).toBeNull();
  });

  it("marks race events with type 'race'", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 100,
            category: "WORKOUT",
            start_date_local: "2026-06-13T08:00:00",
            name: "RACE DAY",
            description: "Race day!",
          },
        ]);
      }),
    );

    const result = await fetchCalendarData("test-api-key-race", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("race");
  });

  it("calls pair API for fallback-matched activity", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "act-99",
            start_date: "2026-12-10T10:00:00",
            start_date_local: "2026-12-10T10:00:00",
            name: "W01 Easy",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([
          {
            id: 555,
            category: "WORKOUT",
            start_date_local: "2026-12-10T12:00:00",
            name: "W01 Easy",
            description: "Easy run",
            // No paired_activity_id — forces fallback matching
          },
        ]);
      }),
    );

    await fetchCalendarData("test-api-key", new Date("2026-12-01"), new Date("2026-12-31"));

    // Wait for fire-and-forget pair call to arrive at MSW
    await vi.waitFor(() => {
      const pairCall = capturedActivityPutPayloads.find(
        (c) => c.activityId === "act-99",
      );
      expect(pairCall).toBeDefined();
      expect(pairCall!.body).toEqual({ paired_event_id: 555 });
    });
  });

  it("filters to only Run and VirtualRun activities", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/activities`, () => {
        return HttpResponse.json([
          {
            id: "1",
            start_date: "2027-01-10T10:00:00",
            start_date_local: "2027-01-10T10:00:00",
            name: "Easy Run",
            type: "Run",
            distance: 5000,
            moving_time: 1800,
          },
          {
            id: "2",
            start_date: "2027-01-11T10:00:00",
            start_date_local: "2027-01-11T10:00:00",
            name: "Morning Ride",
            type: "Ride",
            distance: 20000,
            moving_time: 3600,
          },
        ]);
      }),
      http.get(`${API_BASE}/athlete/0/events`, () => {
        return HttpResponse.json([]);
      }),
    );

    const result = await fetchCalendarData("test-api-key", new Date("2027-01-01"), new Date("2027-01-31"));
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Easy Run");
  });
});

describe("updateEvent", () => {
  it("sends PUT request with correct payload", async () => {
    await updateEvent("test-key", 123, { start_date_local: "2026-02-15T12:00:00" });

    expect(capturedPutPayload).not.toBeNull();
    expect(capturedPutPayload!.url).toContain("/events/123");
    expect(capturedPutPayload!.body).toEqual({ start_date_local: "2026-02-15T12:00:00" });
  });

  it("throws on non-ok response", async () => {
    server.use(
      http.put(`${API_BASE}/athlete/0/events/:eventId`, () => {
        return new HttpResponse("Not found", { status: 404 });
      }),
    );

    await expect(updateEvent("test-key", 999, { name: "test" })).rejects.toThrow("Failed to update event");
  });
});

describe("uploadToIntervals", () => {
  it("deletes future workouts then uploads new plan", async () => {
    const callOrder: string[] = [];
    server.use(
      http.delete(`${API_BASE}/athlete/0/events`, () => {
        callOrder.push("delete");
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API_BASE}/athlete/0/events/bulk`, async ({ request }) => {
        callOrder.push("upload");
        const body = await request.json();
        return HttpResponse.json((body as unknown[]).map((_, i) => ({ id: 1000 + i })));
      }),
    );

    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test", description: "Test", external_id: "test-1", type: "Run" },
    ];

    const count = await uploadToIntervals("test-key", events);
    expect(count).toBe(1);
    expect(callOrder).toEqual(["delete", "upload"]);
  });

  it("includes carbs_per_hour in upload payload when fuelRate is set", async () => {
    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test", description: "Test", external_id: "test-1", type: "Run", fuelRate: 60 },
    ];

    await uploadToIntervals("test-key", events);
    expect((capturedUploadPayload[0] as Record<string, unknown>).carbs_per_hour).toBe(60);
  });

  it("omits carbs_per_hour when fuelRate is undefined", async () => {
    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test", description: "Test", external_id: "test-1", type: "Run" },
    ];

    await uploadToIntervals("test-key", events);
    expect((capturedUploadPayload[0] as Record<string, unknown>).carbs_per_hour).toBeUndefined();
  });

  it("throws on upload failure", async () => {
    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, () => {
        return new HttpResponse("Internal Server Error", { status: 500 });
      }),
    );

    const events: WorkoutEvent[] = [
      { start_date_local: new Date("2026-03-01T12:00:00"), name: "Test", description: "Test", external_id: "test-1", type: "Run" },
    ];
    await expect(uploadToIntervals("test-key", events)).rejects.toThrow("API Error 500");
  });
});

describe("fetchActivityDetails", () => {
  it("fetches and processes stream data", async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId/streams`, () => {
        return HttpResponse.json([
          { type: "time", data: [0, 60, 120, 180] },
          { type: "heartrate", data: [120, 135, 150, 140] },
          { type: "velocity_smooth", data: [2.5, 2.6, 2.8, 2.7] },
        ]);
      }),
    );

    const result = await fetchActivityDetails("123", "test-key");
    expect(result.streamData).toBeDefined();
    expect(result.avgHr).toBeDefined();
    expect(result.maxHr).toBe(150);
    expect(result.streamData!.heartrate).toBeDefined();
    expect(result.streamData!.pace).toBeDefined();
  });

  it("returns empty object on error", { timeout: 15000 }, async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId/streams`, () => {
        return HttpResponse.error();
      }),
    );

    const result = await fetchActivityDetails("123", "test-key");
    expect(result).toEqual({});
  });
});

describe("updateActivityCarbs", () => {
  it("sends PUT with carbs_ingested to activity endpoint", async () => {
    await updateActivityCarbs("test-key", "i125839480", 60);

    const putCall = capturedActivityPutPayloads.find(
      (c) => c.activityId === "i125839480",
    );
    expect(putCall).toBeDefined();
    expect(putCall!.body).toEqual({ carbs_ingested: 60 });
  });

  it("throws on non-ok response", async () => {
    server.use(
      http.put(`${API_BASE}/activity/:activityId`, () => {
        return new HttpResponse("Not found", { status: 404 });
      }),
    );

    await expect(updateActivityCarbs("test-key", "bad-id", 50)).rejects.toThrow("Failed to update activity carbs");
  });
});

describe("fetchPaceCurves", () => {
  it("fetches and processes pace curve data", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/pace-curves`, () => {
        return HttpResponse.json({
          list: [
            {
              id: "all",
              label: "All Time",
              distance: [1000, 5000, 10000],
              values: [300, 1650, 3600],
              activity_id: ["act-1", "act-2", "act-3"],
            },
          ],
          activities: {
            "act-1": { id: "act-1", name: "Fast 1k", distance: 1200, moving_time: 360, start_date_local: "2026-03-01" },
            "act-2": { id: "act-2", name: "Tempo 5k", distance: 5500, moving_time: 1800, start_date_local: "2026-03-02" },
            "act-3": { id: "act-3", name: "Long Run 10k", distance: 10500, moving_time: 3900, start_date_local: "2026-03-03" },
          },
        });
      }),
    );

    const result = await fetchPaceCurves("test-key");

    expect(result).not.toBeNull();
    expect(result!.bestEfforts.length).toBe(4); // 1km, 2km, 5km, 10km
    expect(result!.bestEfforts[0].label).toBe("1km");
    expect(result!.bestEfforts[0].timeSeconds).toBe(300);
    expect(result!.bestEfforts[0].pace).toBeCloseTo(5.0, 1);
    expect(result!.longestRun).not.toBeNull();
    expect(result!.longestRun!.distance).toBe(10500);
    expect(result!.curve.length).toBe(3);
  });

  it("interpolates time for standard distances not in data", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/pace-curves`, () => {
        return HttpResponse.json({
          list: [
            {
              id: "all",
              label: "All Time",
              distance: [900, 1100],
              values: [270, 330],
              activity_id: ["act-1", "act-1"],
            },
          ],
          activities: {
            "act-1": { id: "act-1", name: "Run", distance: 1100, moving_time: 330, start_date_local: "2026-03-01" },
          },
        });
      }),
    );

    const result = await fetchPaceCurves("test-key");

    expect(result).not.toBeNull();
    expect(result!.bestEfforts.length).toBe(1); // only 1km can be interpolated
    expect(result!.bestEfforts[0].timeSeconds).toBeCloseTo(300, 0);
  });

  it("returns null on non-ok response", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/pace-curves`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const result = await fetchPaceCurves("test-key");
    expect(result).toBeNull();
  });

  it("returns null when no 'all' curve exists", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/pace-curves`, () => {
        return HttpResponse.json({
          list: [{ id: "42d", label: "42 days", distance: [], values: [], activity_id: [] }],
          activities: {},
        });
      }),
    );

    const result = await fetchPaceCurves("test-key");
    expect(result).toBeNull();
  });
});

describe("replaceWorkoutOnDate", () => {
  const workout: WorkoutEvent = {
    start_date_local: new Date("2026-04-01T12:00:00"),
    name: "W05 Easy",
    description: "Warmup\n- 10m",
    external_id: "ondemand-2026-04-01",
    type: "Run",
    fuelRate: 48,
  };

  it("creates new event without deleting when no existing ID", async () => {
    await replaceWorkoutOnDate("test-key", undefined, workout);

    expect(capturedUploadPayload.length).toBe(1);
    expect(capturedDeleteEventIds.length).toBe(0);
  });

  it("creates first then deletes old event", async () => {
    const callOrder: string[] = [];
    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, async ({ request }) => {
        callOrder.push("create");
        const body = await request.json();
        return HttpResponse.json((body as unknown[]).map((_, i) => ({ id: 2002 + i })));
      }),
      http.delete(`${API_BASE}/athlete/0/events/:eventId`, () => {
        callOrder.push("delete");
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const newId = await replaceWorkoutOnDate("test-key", 500, workout);
    expect(newId).toBe(2002);
    expect(callOrder).toEqual(["create", "delete"]);
  });

  it("includes carbs_per_hour in create payload", async () => {
    await replaceWorkoutOnDate("test-key", undefined, workout);

    expect((capturedUploadPayload[0] as Record<string, unknown>).carbs_per_hour).toBe(48);
  });

  it("throws when create fails (old event preserved)", async () => {
    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, () => {
        return new HttpResponse("Server error", { status: 500 });
      }),
    );

    await expect(replaceWorkoutOnDate("test-key", 500, workout)).rejects.toThrow("Failed to create event");
  });

  it("succeeds even when delete fails after create", async () => {
    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json((body as unknown[]).map((_, i) => ({ id: 2004 + i })));
      }),
      http.delete(`${API_BASE}/athlete/0/events/:eventId`, () => {
        return HttpResponse.error();
      }),
    );

    const newId = await replaceWorkoutOnDate("test-key", 500, workout);
    expect(newId).toBe(2004);
  });
});

describe("updateThresholdPace", () => {
  it("converts min/km to m/s correctly", async () => {
    let capturedBody: unknown = null;

    server.use(
      http.put(`https://intervals.icu/api/v1/athlete/0/sport-settings/:sportSettingsId`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    await updateThresholdPace("test-api-key", 123, 6.0);

    expect(capturedBody).toMatchObject({
      threshold_pace: expect.closeTo(2.778, 0.001), // 1000 / (6 * 60) = 2.7777...
    });
  });

  it("handles different pace values", async () => {
    let capturedBody: unknown = null;

    server.use(
      http.put(`https://intervals.icu/api/v1/athlete/0/sport-settings/:sportSettingsId`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    // Test 5:00/km pace
    await updateThresholdPace("test-api-key", 123, 5.0);

    expect(capturedBody).toMatchObject({
      threshold_pace: expect.closeTo(3.333, 0.001), // 1000 / (5 * 60) = 3.3333...
    });
  });

  it("sends to the correct sport settings endpoint", async () => {
    let capturedUrl = "";

    server.use(
      http.put(`https://intervals.icu/api/v1/athlete/0/sport-settings/:sportSettingsId`, async ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );

    await updateThresholdPace("test-api-key", 456, 7.0);

    expect(capturedUrl).toContain("/sport-settings/456");
  });

  it("throws on non-ok response", async () => {
    server.use(
      http.put(`https://intervals.icu/api/v1/athlete/0/sport-settings/:sportSettingsId`, () => {
        return new HttpResponse("Server error", { status: 500 });
      }),
    );

    await expect(updateThresholdPace("test-api-key", 123, 6.0)).rejects.toThrow("Failed to update threshold pace: 500");
  });
});

describe("updatePaceZones", () => {
  it("pushes zone boundaries and names derived from constants", async () => {
    await updatePaceZones("test-api-key", 123);
    expect(capturedSportSettingsPayload).toEqual({
      pace_zones: [77, 90, 100, 107, 999],
      pace_zone_names: ["Recovery", "Endurance", "Tempo", "Threshold", "VO2 Max"],
    });
  });

  it("throws on non-ok response", async () => {
    server.use(
      http.put(`https://intervals.icu/api/v1/athlete/0/sport-settings/:sportSettingsId`, () => {
        return new HttpResponse("Server error", { status: 500 });
      }),
    );
    await expect(updatePaceZones("test-api-key", 123)).rejects.toThrow("Failed to update pace zones: 500");
  });

  it("threshold pace succeeds independently when pace zones would fail", async () => {
    // The threshold-pace route uses a best-effort pattern: updateThresholdPace
    // must resolve before updatePaceZones is called, so a pace zone failure
    // cannot affect the already-completed threshold pace write.
    server.use(
      http.put(`${API_BASE}/athlete/0/sport-settings/:settingsId`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        if (body.pace_zones) return new HttpResponse("Server error", { status: 500 });
        return HttpResponse.json({ id: 123, ...body });
      }),
    );

    await expect(updateThresholdPace("test-api-key", 123, 6.0)).resolves.toBeUndefined();
    await expect(updatePaceZones("test-api-key", 123)).rejects.toThrow("Failed to update pace zones: 500");
  });
});
