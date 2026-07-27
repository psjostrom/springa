import { timingSafeEqual } from "crypto";

/**
 * Local/dev-only QA auth helpers.
 * NEVER enable against production Vercel or springa.run AUTH_URL.
 */

export function isLocalQaAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.NODE_ENV !== "development") return false;

  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL ?? "";
  if (authUrl && /(?:^|\/\/)(?:www\.)?springa\.run\b/i.test(authUrl)) {
    return false;
  }

  if (!env.QA_AUTH_TOKEN?.trim() || !env.QA_AUTH_EMAIL?.trim()) return false;
  return true;
}

export function verifyQaToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isLocalQaAllowed(env)) return false;
  const expected = env.QA_AUTH_TOKEN?.trim();
  if (!expected) return false;
  if (typeof token !== "string" || token.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function getQaAuthEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isLocalQaAllowed(env)) return null;
  const email = env.QA_AUTH_EMAIL?.trim();
  return email ? email.toLowerCase() : null;
}
