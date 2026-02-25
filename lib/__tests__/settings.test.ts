import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock hoisting — safe to create the shared db here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { holder } = vi.hoisted(() => ({ holder: { db: null as any } }));

vi.mock("@libsql/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@libsql/client")>();
  holder.db = actual.createClient({ url: "file::memory:" });
  return { ...actual, createClient: () => holder.db };
});

import { SCHEMA_DDL } from "../db";
import { getUserSettings, saveUserSettings } from "../settings";

const testDb = () => holder.db;

beforeAll(async () => {
  await testDb().executeMultiple(SCHEMA_DDL);
});

beforeEach(async () => {
  await testDb().execute("DELETE FROM user_settings");
});

describe("getUserSettings", () => {
  it("returns empty object when no data stored", async () => {
    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({});
  });

  it("returns stored settings", async () => {
    await testDb().execute({
      sql: "INSERT INTO user_settings (email, intervals_api_key, google_ai_api_key) VALUES (?, ?, ?)",
      args: ["user@example.com", "abc123", "gai-key"],
    });

    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({
      intervalsApiKey: "abc123",
      googleAiApiKey: "gai-key",
    });
  });

  it("only returns fields that have values", async () => {
    await testDb().execute({
      sql: "INSERT INTO user_settings (email, intervals_api_key) VALUES (?, ?)",
      args: ["user@example.com", "abc123"],
    });

    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({ intervalsApiKey: "abc123" });
    expect(result).not.toHaveProperty("googleAiApiKey");
    expect(result).not.toHaveProperty("xdripSecret");
  });
});

describe("saveUserSettings", () => {
  it("merges partial settings with existing", async () => {
    await saveUserSettings("user@example.com", { intervalsApiKey: "existing-key" });
    await saveUserSettings("user@example.com", { googleAiApiKey: "new-ai-key" });

    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({
      intervalsApiKey: "existing-key",
      googleAiApiKey: "new-ai-key",
    });
  });

  it("creates new entry when none exists", async () => {
    await saveUserSettings("new@user.com", { intervalsApiKey: "first-key" });

    const result = await getUserSettings("new@user.com");
    expect(result).toEqual({ intervalsApiKey: "first-key" });
  });

  it("overwrites existing key values", async () => {
    await saveUserSettings("user@example.com", {
      intervalsApiKey: "old",
      googleAiApiKey: "old-ai",
    });
    await saveUserSettings("user@example.com", { intervalsApiKey: "new" });

    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({
      intervalsApiKey: "new",
      googleAiApiKey: "old-ai",
    });
  });
});
