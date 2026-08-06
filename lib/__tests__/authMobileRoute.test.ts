import { describe, it, expect, vi, beforeEach } from "vitest";

// eslint-disable-next-line no-restricted-syntax -- isolate Google JWKS + DB
vi.mock("@/lib/mobileAuth", () => ({
  verifyGoogleIdToken: vi.fn(),
  signMobileToken: vi.fn(),
}));

// eslint-disable-next-line no-restricted-syntax -- DB boundary
vi.mock("@/lib/auth", () => ({
  ensureUserSettings: vi.fn(),
}));

import { POST } from "@/app/api/auth/mobile/route";
import { verifyGoogleIdToken, signMobileToken } from "@/lib/mobileAuth";
import { ensureUserSettings } from "@/lib/auth";
import type { MockedFunction } from "vitest";

const mockVerify = verifyGoogleIdToken as unknown as MockedFunction<
  typeof verifyGoogleIdToken
>;
const mockSign = signMobileToken as unknown as MockedFunction<
  typeof signMobileToken
>;
const mockEnsure = ensureUserSettings as unknown as MockedFunction<
  typeof ensureUserSettings
>;

function postJson(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/mobile", () => {
  it("returns token for valid idToken", async () => {
    // eslint-disable-next-line no-restricted-syntax -- Google JWKS boundary mock
    mockVerify.mockResolvedValue({ email: "runner@example.com" });
    // eslint-disable-next-line no-restricted-syntax -- DB boundary mock
    mockEnsure.mockResolvedValue(undefined);
    // eslint-disable-next-line no-restricted-syntax -- JWT sign boundary mock
    mockSign.mockResolvedValue({ token: "jwt.here", expiresAt: 1_700_000_000 });

    const res = await postJson({ idToken: "google-id-token" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      token: "jwt.here",
      expiresAt: 1_700_000_000,
      user: { email: "runner@example.com" },
    });
    expect(mockEnsure).toHaveBeenCalledWith("runner@example.com");
  });

  it("returns 400 when idToken missing", async () => {
    const res = await postJson({});
    expect(res.status).toBe(400);
  });

  it("returns 401 when Google token invalid", async () => {
    // eslint-disable-next-line no-restricted-syntax -- Google JWKS boundary mock
    mockVerify.mockRejectedValue(new Error("bad"));
    const res = await postJson({ idToken: "nope" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when ensureUserSettings fails after Google verify", async () => {
    // eslint-disable-next-line no-restricted-syntax -- Google JWKS boundary mock
    mockVerify.mockResolvedValue({ email: "runner@example.com" });
    // eslint-disable-next-line no-restricted-syntax -- DB boundary mock
    mockEnsure.mockRejectedValue(new Error("db down"));
    const res = await postJson({ idToken: "google-id-token" });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Server error" });
  });
});
