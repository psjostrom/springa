import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  saved: [] as { endpoint: string; p256dh: string; auth: string }[],
}));

// eslint-disable-next-line no-restricted-syntax -- auth boundary mock
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ user: { email: "test@example.com" }, expires: "" }),
}));

// eslint-disable-next-line no-restricted-syntax -- DB boundary mock
vi.mock("@/lib/pushDb", () => ({
  savePushSubscription: async (
    _email: string,
    sub: { endpoint: string; p256dh: string; auth: string },
  ) => {
    state.saved.push(sub);
  },
}));

import { POST } from "@/app/api/push/subscribe/route";

describe("/api/push/subscribe POST", () => {
  beforeEach(() => {
    state.saved = [];
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid JSON" });
    expect(state.saved).toHaveLength(0);
  });

  it("returns 400 when subscription fields are missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "https://push.example.com" }),
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid subscription" });
  });

  it("saves subscription when all fields are present", async () => {
    const res = await POST(
      new Request("http://localhost/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: "https://push.example.com/abc",
          keys: { p256dh: "pubkey123", auth: "authsecret" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.saved).toEqual([
      { endpoint: "https://push.example.com/abc", p256dh: "pubkey123", auth: "authsecret" },
    ]);
  });
});
