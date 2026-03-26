import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  return { holder: { db: null as unknown as Client } };
});

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { getGoogleCalendarContext } from "../googleCalendar";
import { SCHEMA_DDL } from "../db";
import { encrypt } from "../credentials";

const TEST_KEY = "a".repeat(64);
const EMAIL = "test@example.com";

describe("getGoogleCalendarContext", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email, approved, google_refresh_token, google_calendar_id, timezone) VALUES (?, 1, ?, ?, ?)",
      args: [EMAIL, encrypt("1//mock-refresh", TEST_KEY), "existing-cal-id", "Europe/Stockholm"],
    });
  });

  it("returns accessToken and calendarId for valid user", async () => {
    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).not.toBeNull();
    expect(ctx!.accessToken).toBe("mock-access-token");
    expect(ctx!.calendarId).toBe("existing-cal-id");
    expect(ctx!.timezone).toBe("Europe/Stockholm");
  });

  it("returns null when user has no refresh token", async () => {
    await holder.db.execute({
      sql: "UPDATE user_settings SET google_refresh_token = NULL WHERE email = ?",
      args: [EMAIL],
    });
    const ctx = await getGoogleCalendarContext(EMAIL);
    expect(ctx).toBeNull();
  });

  it("returns null for unknown user", async () => {
    const ctx = await getGoogleCalendarContext("nobody@example.com");
    expect(ctx).toBeNull();
  });
});
