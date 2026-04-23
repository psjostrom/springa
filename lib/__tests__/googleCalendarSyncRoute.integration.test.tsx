import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  return { holder: { db: null as unknown as Client } };
});

// eslint-disable-next-line no-restricted-syntax -- in-memory DB redirect
vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

const EMAIL = "test@example.com";

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: () => Promise.resolve({ user: { email: EMAIL }, expires: "" }),
}));

import { POST } from "@/app/api/google-calendar-sync/route";
import { encrypt } from "../credentials";
import { SCHEMA_DDL } from "../db";
import { capturedGooglePatchedEvents } from "./msw/handlers";

const ENC_KEY = "a".repeat(64);

async function insertGoogleCreds() {
  await holder.db.execute({
    sql: `INSERT INTO user_settings (email, google_refresh_token, google_calendar_id, timezone)
          VALUES (?, ?, ?, ?)`,
    args: [EMAIL, encrypt("1//mock-refresh", ENC_KEY), "existing-cal-id", "Europe/Stockholm"],
  });
}

function makeUpdateRequest(event: {
  name: string;
  description: string;
  startLocal: string;
  fuelRate?: number;
}) {
  return new Request("http://localhost/api/google-calendar-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update",
      eventName: "W11 Long",
      eventDate: "2026-04-26",
      event,
    }),
  });
}

describe("/api/google-calendar-sync update", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
    capturedGooglePatchedEvents.length = 0;
  });

  it("rebuilds the full Google event when moving a workout", async () => {
    await insertGoogleCreds();

    const res = await POST(makeUpdateRequest({
      name: "W11 Long",
      description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 60m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
      startLocal: "2026-04-22T12:00:00",
      fuelRate: 60,
    }));
    expect(res.status).toBe(200);

    expect(capturedGooglePatchedEvents).toHaveLength(1);
    const patched = capturedGooglePatchedEvents[0].body as Record<string, unknown>;
    expect(patched.summary).toBe("W11 Long");
    expect(patched.start).toEqual({ dateTime: "2026-04-22T12:00:00", timeZone: "Europe/Stockholm" });
    expect(patched.end).toEqual({ dateTime: "2026-04-22T13:25:00", timeZone: "Europe/Stockholm" });
    expect(String(patched.description)).toContain("Fuel: 60 g/h");
  });

  it("recomputes duration when the workout description changes", async () => {
    await insertGoogleCreds();

    const res = await POST(makeUpdateRequest({
      name: "W11 Long",
      description: "Warmup\n- 10m 68-83% pace\n\nMain set\n- 45m 68-83% pace\n\nCooldown\n- 15m 68-83% pace\n",
      startLocal: "2026-04-26T12:00:00",
      fuelRate: 72,
    }));
    expect(res.status).toBe(200);

    expect(capturedGooglePatchedEvents).toHaveLength(1);
    const patched = capturedGooglePatchedEvents[0].body as Record<string, unknown>;
    expect(patched.start).toEqual({ dateTime: "2026-04-26T12:00:00", timeZone: "Europe/Stockholm" });
    expect(patched.end).toEqual({ dateTime: "2026-04-26T13:10:00", timeZone: "Europe/Stockholm" });
    expect(String(patched.description)).toContain("Fuel: 72 g/h");
    expect(String(patched.description)).toContain("Main set");
    expect(String(patched.description)).toContain("- 45m 68-83% pace");
  });
});