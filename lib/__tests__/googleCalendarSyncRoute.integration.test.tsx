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

function makeUpdateRequest(updates: { name?: string; date?: string; description?: string }) {
  return new Request("http://localhost/api/google-calendar-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update",
      eventName: "W11 Long",
      eventDate: "2026-04-26",
      updates,
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

  it("shifts end by the same delta as start when date changes", async () => {
    // MSW handler returns existing event Sun 2026-04-26 12:00 → 13:34 (1h34m).
    // Drag to Wed 2026-04-22 12:00 should produce 12:00 → 13:34 the same day.
    await insertGoogleCreds();

    const res = await POST(makeUpdateRequest({ date: "2026-04-22T12:00:00" }));
    expect(res.status).toBe(200);

    expect(capturedGooglePatchedEvents).toHaveLength(1);
    const patched = capturedGooglePatchedEvents[0].body as Record<string, { dateTime: string; timeZone: string }>;
    expect(patched.start).toEqual({ dateTime: "2026-04-22T12:00:00", timeZone: "Europe/Stockholm" });
    expect(patched.end).toEqual({ dateTime: "2026-04-22T13:34:00", timeZone: "Europe/Stockholm" });
  });

  it("does not patch end when only the description changes", async () => {
    await insertGoogleCreds();

    const res = await POST(makeUpdateRequest({ description: "new notes" }));
    expect(res.status).toBe(200);

    expect(capturedGooglePatchedEvents).toHaveLength(1);
    const patched = capturedGooglePatchedEvents[0].body as Record<string, unknown>;
    expect(patched.description).toBe("new notes");
    expect(patched.start).toBeUndefined();
    expect(patched.end).toBeUndefined();
  });
});
