import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @upstash/redis before importing settings
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class {
    get = mockGet;
    set = mockSet;
  },
}));

// Set env vars before importing
process.env.KV_REST_API_URL = "https://fake.upstash.io";
process.env.KV_REST_API_TOKEN = "fake-token";

// Dynamic import so we can reset the module-level singleton
let getUserSettings: typeof import("../settings").getUserSettings;
let saveUserSettings: typeof import("../settings").saveUserSettings;

beforeEach(async () => {
  mockGet.mockReset();
  mockSet.mockReset();
  // Re-import to reset the lazy _redis singleton
  vi.resetModules();
  const mod = await import("../settings");
  getUserSettings = mod.getUserSettings;
  saveUserSettings = mod.saveUserSettings;
});

describe("getUserSettings", () => {
  it("returns empty object when no data stored", async () => {
    mockGet.mockResolvedValue(null);

    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({});
    expect(mockGet).toHaveBeenCalledWith("user:user@example.com");
  });

  it("returns stored settings", async () => {
    mockGet.mockResolvedValue({
      intervalsApiKey: "abc123",
      googleAiApiKey: "gai-key",
    });

    const result = await getUserSettings("user@example.com");
    expect(result).toEqual({
      intervalsApiKey: "abc123",
      googleAiApiKey: "gai-key",
    });
  });

  it("uses email as part of Redis key", async () => {
    mockGet.mockResolvedValue(null);

    await getUserSettings("other@test.com");
    expect(mockGet).toHaveBeenCalledWith("user:other@test.com");
  });
});

describe("saveUserSettings", () => {
  it("merges partial settings with existing", async () => {
    mockGet.mockResolvedValue({ intervalsApiKey: "existing-key" });
    mockSet.mockResolvedValue("OK");

    await saveUserSettings("user@example.com", { googleAiApiKey: "new-ai-key" });

    expect(mockSet).toHaveBeenCalledWith("user:user@example.com", {
      intervalsApiKey: "existing-key",
      googleAiApiKey: "new-ai-key",
    });
  });

  it("creates new entry when none exists", async () => {
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue("OK");

    await saveUserSettings("new@user.com", { intervalsApiKey: "first-key" });

    expect(mockSet).toHaveBeenCalledWith("user:new@user.com", {
      intervalsApiKey: "first-key",
    });
  });

  it("overwrites existing key values", async () => {
    mockGet.mockResolvedValue({ intervalsApiKey: "old", googleAiApiKey: "old-ai" });
    mockSet.mockResolvedValue("OK");

    await saveUserSettings("user@example.com", { intervalsApiKey: "new" });

    expect(mockSet).toHaveBeenCalledWith("user:user@example.com", {
      intervalsApiKey: "new",
      googleAiApiKey: "old-ai",
    });
  });
});
