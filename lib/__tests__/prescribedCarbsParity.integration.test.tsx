/** Cross-route parity: the same workout shows the same prescribed grams at every
 *  point in the user journey — pre-run calendar (planned event), post-run
 *  calendar (completed activity), and the feedback page. All three paths feed
 *  the same `calculateCanonicalPlannedPrescription(description, fuelRate, context)`
 *  call with the same inputs derived from the planned event, so the gram totals
 *  MUST agree. Guards against the regression where stored DB values went stale
 *  and the post-run screen drifted from pre-run (97g vs 135g for the same run). */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { render, screen, waitFor } from "./test-utils";
import FeedbackPage from "@/app/feedback/page";
import { searchParamsState } from "./setup-dom";

import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

const ENC_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY!;

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { email: "test@example.com" }, expires: "" }),
}));

import { GET as calendarGET } from "@/app/api/intervals/calendar/route";
import { GET as feedbackGET } from "@/app/api/run-feedback/route";
import { server } from "./msw/server";
import { SCHEMA_DDL } from "../db";

const PLANNED_EVENT_ID = 104924876;
const ACTIVITY_ID = "i147005108";
const FUEL_RATE_GH = 60;

// Minute-based step → duration is fixed by the description, not estimated from
// pace. Keeps the test independent of pace-table calibration: 56m × 60g/h ÷ 60 = 56g.
const WORKOUT_DESCRIPTION = [
  "Easy run.",
  "",
  "- 56m 68-83% pace intensity=active",
  "",
].join("\n");

async function insertCreds() {
  // current_ability_dist + current_ability_secs give the user a thresholdPace,
  // which the pipeline gate requires before computing any prescription. Without
  // them every prescribedCarbsG would be null and the parity check would be
  // trivially true on null == null.
  await holder.db.execute({
    sql: `INSERT INTO user_settings (
            email, intervals_api_key, timezone,
            current_ability_dist, current_ability_secs
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            intervals_api_key = excluded.intervals_api_key,
            timezone = excluded.timezone,
            current_ability_dist = excluded.current_ability_dist,
            current_ability_secs = excluded.current_ability_secs`,
    args: [
      "test@example.com",
      encrypt("intervals-key", ENC_KEY),
      "Europe/Stockholm",
      21097,
      6600,
    ],
  });
}

const plannedEventBase = {
  id: PLANNED_EVENT_ID,
  category: "WORKOUT",
  start_date_local: "2026-05-10T12:00:00",
  name: "W13 Easy",
  description: WORKOUT_DESCRIPTION,
  carbs_per_hour: FUEL_RATE_GH,
  moving_time: 3360,
};

const pairedActivity = {
  id: ACTIVITY_ID,
  type: "Run",
  name: "W13 Easy",
  start_date: "2026-05-10T08:00:00Z",
  start_date_local: "2026-05-10T10:00:00",
  distance: 8000,
  moving_time: 3360,
  average_hr: 142,
  paired_event_id: PLANNED_EVENT_ID,
};

function preRunHandlers() {
  // Pre-run: planned event exists, no activity yet, no pairing.
  return [
    http.get(`${API_BASE}/athlete/0`, () =>
      HttpResponse.json({
        icu_resting_hr: 50,
        sportSettings: [{ types: ["Run"], hr_zones: [120, 145, 165, 175, 185] }],
      }),
    ),
    http.get(`${API_BASE}/athlete/0/activities`, () => HttpResponse.json([])),
    http.get(`${API_BASE}/athlete/0/events`, () =>
      HttpResponse.json([plannedEventBase]),
    ),
  ];
}

function postRunHandlers() {
  // Post-run: Intervals.icu has paired the activity to the event. Per the run-
  // feedback route comment, intervals.icu also overwrites event.moving_time with
  // the activity's actual time after pairing — simulate that to prove the
  // canonical calc is robust against it.
  const pairedEvent = {
    ...plannedEventBase,
    moving_time: pairedActivity.moving_time,
    paired_activity_id: ACTIVITY_ID,
  };
  return [
    http.get(`${API_BASE}/athlete/0`, () =>
      HttpResponse.json({
        icu_resting_hr: 50,
        sportSettings: [{ types: ["Run"], hr_zones: [120, 145, 165, 175, 185] }],
      }),
    ),
    http.get(`${API_BASE}/athlete/0/activities`, () =>
      HttpResponse.json([pairedActivity]),
    ),
    http.get(`${API_BASE}/athlete/0/events`, () =>
      HttpResponse.json([pairedEvent]),
    ),
    http.get(`${API_BASE}/activity/:activityId`, ({ params }) => {
      if (params.activityId !== ACTIVITY_ID)
        return new HttpResponse(null, { status: 404 });
      return HttpResponse.json(pairedActivity);
    }),
  ];
}

describe("Prescribed carbs parity — full user journey", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM prerun_carbs");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
    await insertCreds();
  });

  it("returns the same prescribedCarbsG on the planned, completed, and feedback paths", async () => {
    // Step 1 — pre-run: calendar fetch sees the unpaired planned event.
    server.use(...preRunHandlers());
    const preRunRes = await calendarGET(
      new Request(
        "http://localhost/api/intervals/calendar?oldest=2026-05-01&newest=2026-05-31",
      ),
    );
    expect(preRunRes.status).toBe(200);
    const preRunEvents = (await preRunRes.json()) as {
      id: string;
      type: string;
      prescribedCarbsG?: number | null;
    }[];
    const planned = preRunEvents.find((e) => e.type === "planned");
    expect(planned).toBeDefined();
    const plannedGrams = planned?.prescribedCarbsG ?? null;
    expect(plannedGrams).not.toBeNull();

    // Step 2 — activity completes and intervals.icu auto-pairs it. Calendar
    // fetch now returns the workout as a completed event, NOT a planned one.
    server.resetHandlers();
    server.use(...postRunHandlers());
    const postRunRes = await calendarGET(
      new Request(
        "http://localhost/api/intervals/calendar?oldest=2026-05-01&newest=2026-05-31",
      ),
    );
    expect(postRunRes.status).toBe(200);
    const postRunEvents = (await postRunRes.json()) as {
      id: string;
      type: string;
      activityId?: string;
      prescribedCarbsG?: number | null;
    }[];
    const completed = postRunEvents.find(
      (e) => e.type === "completed" && e.activityId === ACTIVITY_ID,
    );
    expect(completed).toBeDefined();
    const completedGrams = completed?.prescribedCarbsG ?? null;

    // Step 3 — user opens the feedback page for the activity.
    const feedbackRes = await feedbackGET(
      new Request(
        `http://localhost/api/run-feedback?activityId=${ACTIVITY_ID}`,
      ),
    );
    expect(feedbackRes.status).toBe(200);
    const feedback = (await feedbackRes.json()) as {
      prescribedCarbsG: number | null;
    };

    // The whole point of the change: every stage of the journey reports the
    // same gram total for the same workout.
    expect(completedGrams).toBe(plannedGrams);
    expect(feedback.prescribedCarbsG).toBe(plannedGrams);
  });

  it("displays the same prescribed grams on the feedback page that the calendar planned event reported", async () => {
    server.use(...preRunHandlers());
    const preRunRes = await calendarGET(
      new Request(
        "http://localhost/api/intervals/calendar?oldest=2026-05-01&newest=2026-05-31",
      ),
    );
    const preRunEvents = (await preRunRes.json()) as {
      type: string;
      prescribedCarbsG?: number | null;
    }[];
    const expectedGrams = preRunEvents.find((e) => e.type === "planned")
      ?.prescribedCarbsG;
    expect(expectedGrams).toBeTypeOf("number");

    server.resetHandlers();
    server.use(
      ...postRunHandlers(),
      http.get("/api/run-feedback", ({ request }) => feedbackGET(request)),
    );
    searchParamsState.current = new URLSearchParams(`activityId=${ACTIVITY_ID}`);

    render(<FeedbackPage />);

    await waitFor(() => {
      expect(
        screen.getByText(`Prescribed: ${expectedGrams!}g`),
      ).toBeInTheDocument();
    });
  });
});
