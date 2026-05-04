import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/constants";
import { encrypt } from "@/lib/credentials";
import { resetCaptures, capturedDeleteEventIds } from "./msw/handlers";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return {
    holder: { db: null as unknown as Client },
  };
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

import { SCHEMA_DDL } from "@/lib/db";
import { server } from "./msw/server";
import { POST as bulkPOST } from "@/app/api/intervals/events/bulk/route";
import { POST as replacePOST } from "@/app/api/intervals/events/replace/route";
import { DELETE as deleteEventRoute } from "@/app/api/intervals/events/[id]/route";

async function insertIntervalsCreds() {
  await holder.db.execute({
    sql: `INSERT INTO user_settings (email, intervals_api_key, timezone)
          VALUES (?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET intervals_api_key = excluded.intervals_api_key, timezone = excluded.timezone`,
    args: ["test@example.com", encrypt("intervals-key", ENC_KEY), "Europe/Stockholm"],
  });
}

describe("/api/intervals/events routes", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    resetCaptures();
    await holder.db.execute("DELETE FROM workout_event_prescriptions");
    await holder.db.execute("DELETE FROM activity_streams");
    await holder.db.execute("DELETE FROM user_settings");
    await insertIntervalsCreds();
  });

  it("bulk route syncs current prescriptions and deletes stale prescription rows", async () => {
    await holder.db.execute({
      sql: `INSERT INTO workout_event_prescriptions (email, event_id, planned_duration_sec, prescribed_carbs_g, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["test@example.com", "555", 2400, 40, Date.now()],
    });

    server.use(
      http.get(`${API_BASE}/athlete/0/events`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("category") === "WORKOUT") {
          return HttpResponse.json([
            {
              id: 555,
              category: "WORKOUT",
              start_date_local: "2026-05-12T10:00:00",
              external_id: "easy-old",
              description: "Warmup\n- 10m 68-83% pace\n",
              carbs_per_hour: 60,
            },
          ]);
        }
        return HttpResponse.json([
          {
            id: 777,
            category: "WORKOUT",
            start_date_local: "2026-05-12T10:00:00",
            name: "W13 Easy",
            description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 27m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
            carbs_per_hour: 64,
            duration: 3120,
          },
        ]);
      }),
      http.post(`${API_BASE}/athlete/0/events/bulk`, () => {
        return HttpResponse.json([{ id: 1001 }]);
      }),
    );

    const response = await bulkPOST(new Request("http://localhost/api/intervals/events/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [{
          start_date_local: "2026-05-12T10:00:00.000Z",
          category: "easy",
          type: "Run",
          name: "W13 Easy",
          description: "Warmup\n- 10m 68-83% pace\n",
          fuelRate: 64,
          external_id: "easy-new",
        }],
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 1 });

    const stale = await holder.db.execute({
      sql: "SELECT event_id FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "555"],
    });
    expect(stale.rows).toEqual([]);

    const fresh = await holder.db.execute({
      sql: "SELECT event_id, planned_duration_sec FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "777"],
    });
    expect(fresh.rows).toEqual([{ event_id: "777", planned_duration_sec: 3120 }]);
  });

  it("replace route writes new prescription and removes old event prescription", async () => {
    await holder.db.execute({
      sql: `INSERT INTO workout_event_prescriptions (email, event_id, planned_duration_sec, prescribed_carbs_g, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["test@example.com", "201", 1800, 30, Date.now()],
    });

    server.use(
      http.post(`${API_BASE}/athlete/0/events/bulk`, () => {
        return HttpResponse.json([{ id: 999 }]);
      }),
      http.delete(`${API_BASE}/athlete/0/events/:eventId`, () => {
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const response = await replacePOST(new Request("http://localhost/api/intervals/events/replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        existingEventId: 201,
        workout: {
          start_date_local: "2026-05-13T10:00:00.000Z",
          category: "easy",
          type: "Run",
          name: "W13 Easy",
          description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 27m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
          fuelRate: 64,
          external_id: "new-ext-201",
        },
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ newId: 999 });

    const oldRow = await holder.db.execute({
      sql: "SELECT event_id FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "201"],
    });
    expect(oldRow.rows).toEqual([]);

    const newRow = await holder.db.execute({
      sql: "SELECT event_id FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "999"],
    });
    expect(newRow.rows).toEqual([{ event_id: "999" }]);
  });

  it("delete route removes the stored prescription for the deleted event", async () => {
    await holder.db.execute({
      sql: `INSERT INTO workout_event_prescriptions (email, event_id, planned_duration_sec, prescribed_carbs_g, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["test@example.com", "333", 2100, 35, Date.now()],
    });

    const response = await deleteEventRoute(
      new Request("http://localhost/api/intervals/events/333", { method: "DELETE" }),
      { params: Promise.resolve({ id: "333" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(capturedDeleteEventIds).toContain("333");

    const row = await holder.db.execute({
      sql: "SELECT event_id FROM workout_event_prescriptions WHERE email = ? AND event_id = ?",
      args: ["test@example.com", "333"],
    });
    expect(row.rows).toEqual([]);
  });
});
