import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  signMobileToken,
  verifyMobileToken,
  MOBILE_JWT_AUD,
} from "../mobileAuth";

const PREV_SECRET = process.env.AUTH_SECRET;

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-for-mobile-jwt";
});

afterAll(() => {
  process.env.AUTH_SECRET = PREV_SECRET;
});

describe("mobileAuth JWT", () => {
  it("round-trips email", async () => {
    const { token, expiresAt } = await signMobileToken("runner@example.com");
    expect(token.length).toBeGreaterThan(20);
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
    const { email } = await verifyMobileToken(token);
    expect(email).toBe("runner@example.com");
  });

  it("rejects wrong aud", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const bad = await new SignJWT({ email: "x@y.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("not-native")
      .setExpirationTime("1h")
      .sign(secret);
    await expect(verifyMobileToken(bad)).rejects.toThrow();
  });

  it("rejects missing email claim", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
    const bad = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(MOBILE_JWT_AUD)
      .setExpirationTime("1h")
      .sign(secret);
    await expect(verifyMobileToken(bad)).rejects.toThrow();
  });
});
