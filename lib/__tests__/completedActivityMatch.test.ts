import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import type { IntervalsActivity } from "@/lib/types";
import { API_BASE } from "@/lib/constants";
import {
  fetchActivityByIdStrict,
  IntervalsApiError,
} from "@/lib/intervalsApi";
import { findCompletedActivityMatch } from "@/lib/completedActivityMatch";
import { server } from "./msw/server";

function activity(overrides: Partial<IntervalsActivity> = {}): IntervalsActivity {
  return {
    id: "act-1",
    start_date: "2026-05-02T16:10:00Z",
    start_date_local: "2026-05-02T18:10:00",
    name: "W12 Easy",
    ...overrides,
  };
}

describe("findCompletedActivityMatch", () => {
  it("selects an authoritative event paired to the activity", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/events`, () =>
        HttpResponse.json([
          {
            id: 202,
            category: "WORKOUT",
            start_date_local: "2026-05-02T18:00:00",
            name: "W12 Easy",
            paired_activity_id: "act-1",
          },
        ]),
      ),
    );

    const result = await findCompletedActivityMatch("test-key", activity());

    expect(result.event?.id).toBe(202);
    expect(result.eventId).toBe(202);
  });

  it("rejects an unpaired nearby event instead of guessing", async () => {
    server.use(
      http.get(`${API_BASE}/athlete/0/events`, () =>
        HttpResponse.json([
          {
            id: 203,
            category: "WORKOUT",
            start_date_local: "2026-05-02T18:00:00",
            name: "W12 Easy",
          },
        ]),
      ),
    );

    await expect(
      findCompletedActivityMatch("test-key", activity()),
    ).resolves.toEqual({ event: null, eventId: null });
  });
});

describe("fetchActivityByIdStrict", () => {
  it("throws an IntervalsApiError with the upstream status for non-2xx responses", async () => {
    server.use(
      http.get(
        `${API_BASE}/activity/:activityId`,
        () => new HttpResponse("service unavailable", { status: 503 }),
      ),
    );

    const error = await fetchActivityByIdStrict("test-key", "act-1").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IntervalsApiError);
    expect(error).toMatchObject({
      status: 503,
      responseText: "service unavailable",
      resource: "activity",
    });
  });

  it("retains 404 for a missing activity", async () => {
    server.use(
      http.get(
        `${API_BASE}/activity/:activityId`,
        () => new HttpResponse("missing", { status: 404 }),
      ),
    );

    const error = await fetchActivityByIdStrict("test-key", "missing").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IntervalsApiError);
    expect(error).toMatchObject({
      status: 404,
      responseText: "missing",
      resource: "activity",
    });
  });

  it("classifies invalid JSON as an activity API error", async () => {
    server.use(
      http.get(
        `${API_BASE}/activity/:activityId`,
        () =>
          new HttpResponse("not-json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const error = await fetchActivityByIdStrict("test-key", "act-1").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IntervalsApiError);
    expect(error).toMatchObject({ status: 200, resource: "activity" });
  });

  it("classifies network failures with status zero", async () => {
    server.use(
      http.get(`${API_BASE}/activity/:activityId`, () => HttpResponse.error()),
    );

    const error = await fetchActivityByIdStrict("test-key", "act-1").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IntervalsApiError);
    expect(error).toMatchObject({ status: 0, resource: "activity" });
  });
});
