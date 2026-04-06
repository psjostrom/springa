import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchConnectionStatus } from "../intervalsApi";

beforeEach(() => {
  vi.restoreAllMocks();
});

function athleteResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    sportSettings: [],
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        icu_garmin_health: true,
        icu_garmin_sync_activities: true,
        icu_garmin_upload_workouts: true,
      })),
    }));

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(athleteResponse()),
    }));

    const result = await fetchConnectionStatus("test-key");
    const linked = result.platforms.filter((p) => p.linked);
    expect(linked).toHaveLength(0);
  });

  it("does not false-positive on Strava sync_activities default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        strava_sync_activities: true,
        strava_id: null,
        strava_authorized: false,
      })),
    }));

    const result = await fetchConnectionStatus("test-key");
    const strava = result.platforms.find((p) => p.platform === "strava");
    expect(strava?.linked).toBe(false);
    expect(strava?.syncActivities).toBe(false);
  });

  it("detects Strava connected and authorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        strava_id: 12345,
        strava_authorized: true,
        strava_sync_activities: true,
      })),
    }));

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        polar_scope: "read",
        polar_sync_activities: false,
      })),
    }));

    const result = await fetchConnectionStatus("test-key");
    const polar = result.platforms.find((p) => p.platform === "polar");
    expect(polar?.linked).toBe(true);
    expect(polar?.syncActivities).toBe(false);
  });

  it("does not false-positive on Garmin sync_activities when not linked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(athleteResponse({
        icu_garmin_health: false,
        icu_garmin_sync_activities: true,
        icu_garmin_upload_workouts: true,
      })),
    }));

    const result = await fetchConnectionStatus("test-key");
    const garmin = result.platforms.find((p) => p.platform === "garmin");
    expect(garmin?.linked).toBe(false);
    expect(garmin?.syncActivities).toBe(false);
  });

  it("returns empty platforms on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await fetchConnectionStatus("bad-key");
    expect(result.platforms).toHaveLength(0);
  });
});
