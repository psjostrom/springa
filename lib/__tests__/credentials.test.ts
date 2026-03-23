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
  it("returns consistent SHA-256 hex", () => {
    const hash = hashSecret("my-secret");
    expect(hash).toBe(hashSecret("my-secret"));
    expect(hash).toHaveLength(64);
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
    const encPassword = encrypt("mylife-pass", encKey);

    await holder.db.execute({
      sql: `INSERT INTO user_settings (email, intervals_api_key, mylife_email, mylife_password, timezone)
            VALUES (?, ?, ?, ?, ?)`,
      args: [EMAIL, encApiKey, "user@mylife.com", encPassword, "Europe/London"],
    });

    const creds = await getUserCredentials(EMAIL);
    expect(creds).not.toBeNull();
    expect(creds!.intervalsApiKey).toBe("intervals-key-123");
    expect(creds!.mylifeEmail).toBe("user@mylife.com");
    expect(creds!.mylifePassword).toBe("mylife-pass");
    expect(creds!.timezone).toBe("Europe/London");
  });

  it("returns null fields when credentials not set", async () => {
    await holder.db.execute({
      sql: "INSERT INTO user_settings (email) VALUES (?)",
      args: [EMAIL],
    });

    const creds = await getUserCredentials(EMAIL);
    expect(creds!.intervalsApiKey).toBeNull();
    expect(creds!.mylifeEmail).toBeNull();
    expect(creds!.mylifePassword).toBeNull();
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
      mylifeEmail: "new@mylife.com",
      mylifePassword: "new-pass",
    });

    const creds = await getUserCredentials(EMAIL);
    expect(creds!.intervalsApiKey).toBe("new-key");
    expect(creds!.mylifeEmail).toBe("new@mylife.com");
    expect(creds!.mylifePassword).toBe("new-pass");
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
      sql: "INSERT INTO user_settings (email, cgm_secret) VALUES (?, ?)",
      args: [EMAIL, hashed],
    });
  });

  it("returns email for matching secret", async () => {
    expect(await validateApiSecretFromDB("valid-secret")).toBe(EMAIL);
  });

  it("returns null for unknown secret", async () => {
    expect(await validateApiSecretFromDB("wrong-secret")).toBeNull();
  });

  it("returns null for null input", async () => {
    expect(await validateApiSecretFromDB(null)).toBeNull();
  });
});
