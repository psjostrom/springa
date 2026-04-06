import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Client } from "@libsql/client";

const { holder } = vi.hoisted(() => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "dummy";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  return { holder: { db: null as unknown as Client } };
});

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { encrypt, decrypt, hashSecret } from "../credentials";
import { getUserCredentials, updateCredentials, validateApiSecretFromDB } from "../credentials";
import { getGoogleCalendarCredentials, updateGoogleRefreshToken, updateGoogleCalendarId } from "../credentials";
import { SCHEMA_DDL } from "../db";

const TEST_KEY = "a".repeat(64);
const EMAIL = "test@example.com";

describe("encrypt/decrypt", () => {
  it("round-trips a string", () => {
    const plaintext = "my-api-key-123";
    const ciphertext = encrypt(plaintext, TEST_KEY);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(plaintext);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("throws on wrong key", () => {
    const ciphertext = encrypt("secret", TEST_KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});

describe("hashSecret", () => {
  it("returns consistent SHA-1 hex", () => {
    const hash = hashSecret("my-secret");
    expect(hash).toBe(hashSecret("my-secret"));
    expect(hash).toHaveLength(40);
  });

  it("differs for different inputs", () => {
    expect(hashSecret("a")).not.toBe(hashSecret("b"));
  });
});

describe("getUserCredentials", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
  });

  it("returns null for missing user", async () => {
    expect(await getUserCredentials("nobody@example.com")).toBeNull();
  });

  it("returns decrypted credentials", async () => {
    const encKey = TEST_KEY;
    const encApiKey = encrypt("intervals-key-123", encKey);
    const encNsSecret = encrypt("ns-secret-456", encKey);

    await holder.db.execute({
      sql: `INSERT INTO user_settings (email, intervals_api_key, nightscout_url, nightscout_secret, timezone)
            VALUES (?, ?, ?, ?, ?)`,
      args: [EMAIL, encApiKey, "https://ns.example.com", encNsSecret, "Europe/London"],
    });

    const creds = await getUserCredentials(EMAIL);
    expect(creds).not.toBeNull();
    expect(creds!.intervalsApiKey).toBe("intervals-key-123");
    expect(creds!.nightscoutUrl).toBe("https://ns.example.com");
    expect(creds!.nightscoutSecret).toBe("ns-secret-456");
    expect(creds!.timezone).toBe("Europe/London");
  });

  it("returns null fields when credentials not set", async () => {
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email) VALUES (?)",
      args: [EMAIL],
    });

    const creds = await getUserCredentials(EMAIL);
    expect(creds!.intervalsApiKey).toBeNull();
    expect(creds!.nightscoutUrl).toBeNull();
    expect(creds!.nightscoutSecret).toBeNull();
  });
});

describe("updateCredentials", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email) VALUES (?)",
      args: [EMAIL],
    });
  });

  it("encrypts and stores credentials", async () => {
    await updateCredentials(EMAIL, {
      intervalsApiKey: "new-key",
      nightscoutUrl: "https://ns.example.com",
      nightscoutSecret: "new-secret",
    });

    const creds = await getUserCredentials(EMAIL);
    expect(creds!.intervalsApiKey).toBe("new-key");
    expect(creds!.nightscoutUrl).toBe("https://ns.example.com");
    expect(creds!.nightscoutSecret).toBe("new-secret");
  });

  it("can clear a field by passing null", async () => {
    await updateCredentials(EMAIL, { intervalsApiKey: "temp-key" });
    expect((await getUserCredentials(EMAIL))!.intervalsApiKey).toBe("temp-key");

    await updateCredentials(EMAIL, { intervalsApiKey: null });
    expect((await getUserCredentials(EMAIL))!.intervalsApiKey).toBeNull();
  });
});

describe("validateApiSecretFromDB", () => {
  beforeAll(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
  });

  beforeEach(async () => {
    await holder.db.execute("DELETE FROM user_settings");
    const hashed = hashSecret("valid-secret");
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email, nightscout_secret) VALUES (?, ?)",
      args: [EMAIL, hashed],
    });
  });

  it("returns email for raw plaintext secret", async () => {
    expect(await validateApiSecretFromDB("valid-secret")).toBe(EMAIL);
  });

  it("returns email for SHA-1 prehashed secret (NS protocol)", async () => {
    const sha1 = hashSecret("valid-secret");
    expect(await validateApiSecretFromDB(sha1)).toBe(EMAIL);
  });

  it("returns null for unknown secret", async () => {
    expect(await validateApiSecretFromDB("wrong-secret")).toBeNull();
  });

  it("returns null for null input", async () => {
    expect(await validateApiSecretFromDB(null)).toBeNull();
  });
});

describe("Google Calendar credentials", () => {
  beforeEach(async () => {
    await holder.db.executeMultiple(SCHEMA_DDL);
    await holder.db.execute({
      sql: "INSERT OR REPLACE INTO user_settings (email) VALUES (?)",
      args: [EMAIL],
    });
  });

  it("returns null refreshToken when not set", async () => {
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds).not.toBeNull();
    expect(creds!.refreshToken).toBeNull();
    expect(creds!.calendarId).toBeNull();
    expect(creds!.timezone).toBe("Europe/Stockholm");
  });

  it("round-trips encrypted refresh token", async () => {
    await updateGoogleRefreshToken(EMAIL, "1//refresh-token-abc");
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds!.refreshToken).toBe("1//refresh-token-abc");
  });

  it("clears refresh token when null", async () => {
    await updateGoogleRefreshToken(EMAIL, "1//token");
    await updateGoogleRefreshToken(EMAIL, null);
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds!.refreshToken).toBeNull();
  });

  it("stores and retrieves calendar ID", async () => {
    await updateGoogleCalendarId(EMAIL, "cal-id-xyz");
    const creds = await getGoogleCalendarCredentials(EMAIL);
    expect(creds!.calendarId).toBe("cal-id-xyz");
  });

  it("returns null for unknown email", async () => {
    const creds = await getGoogleCalendarCredentials("nobody@example.com");
    expect(creds).toBeNull();
  });
});
