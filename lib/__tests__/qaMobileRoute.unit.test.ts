import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureUserSettings = vi.fn(async (_email: string) => {});
const signMobileToken = vi.fn(async (email: string) => ({
  token: `mobile-for-${email}`,
  expiresAt: 1_800_000_000,
}));

vi.mock("@/lib/ensureUserSettings", () => ({
  ensureUserSettings: (email: string) => ensureUserSettings(email),
}));

vi.mock("@/lib/mobileAuth", () => ({
  signMobileToken: (email: string) => signMobileToken(email),
}));

import { POST } from "@/app/api/qa/mobile/route";

function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/qa/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  ensureUserSettings.mockClear();
  signMobileToken.mockClear();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("AUTH_URL", "http://localhost:3000");
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("QA_AUTH_TOKEN", "qa-test-token-32chars-xxxxxxxxxxxx");
  vi.stubEnv("QA_AUTH_EMAIL", "argsint.rymdraket@gmail.com");
  delete process.env.VERCEL_ENV;
  delete process.env.NEXTAUTH_URL;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/qa/mobile", () => {
  it("returns 404 when QA auth is disabled", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const res = await postJson({ token: process.env.QA_AUTH_TOKEN });
    expect(res.status).toBe(404);
    expect(signMobileToken).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong token", async () => {
    const res = await postJson({ token: "xx-test-token-32chars-xxxxxxxxxxxx" });
    expect(res.status).toBe(401);
    expect(signMobileToken).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/qa/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("issues a mobile JWT for the QA email", async () => {
    const res = await postJson({ token: process.env.QA_AUTH_TOKEN });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      token: string;
      expiresAt: number;
      user: { email: string };
    };
    expect(json.user.email).toBe("argsint.rymdraket@gmail.com");
    expect(json.token).toBe("mobile-for-argsint.rymdraket@gmail.com");
    expect(json.expiresAt).toBe(1_800_000_000);
    expect(ensureUserSettings).toHaveBeenCalledWith(
      "argsint.rymdraket@gmail.com",
    );
  });
});
