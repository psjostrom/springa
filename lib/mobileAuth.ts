import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

export const MOBILE_JWT_AUD = "springa-native";
export const MOBILE_TOKEN_TTL_SEC = 60 * 60 * 24 * 30;

const GOOGLE_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(
  email: string,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + MOBILE_TOKEN_TTL_SEC;
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setAudience(MOBILE_JWT_AUD)
    .sign(authSecret());
  return { token, expiresAt };
}

export async function verifyMobileToken(
  token: string,
): Promise<{ email: string }> {
  const { payload } = await jwtVerify(token, authSecret(), {
    audience: MOBILE_JWT_AUD,
  });
  const email = payload.email;
  if (typeof email !== "string" || email.length === 0) {
    throw new Error("Mobile token missing email");
  }
  return { email };
}

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<{ email: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");

  const { payload } = await jwtVerify(idToken, googleJwks, {
    audience: clientId,
  });

  const iss = payload.iss;
  if (typeof iss !== "string" || !GOOGLE_ISSUERS.has(iss)) {
    throw new Error("Invalid Google token issuer");
  }
  if (payload.email_verified !== true) {
    throw new Error("Google email not verified");
  }
  const email = payload.email;
  if (typeof email !== "string" || email.length === 0) {
    throw new Error("Google token missing email");
  }
  return { email };
}
