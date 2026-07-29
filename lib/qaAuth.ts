import { timingSafeEqual } from "crypto";

/**
 * Local/dev-only QA auth helpers.
 * NEVER enable against production Vercel or springa.run AUTH_URL.
 */

function isSpringaHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  return host === "springa.run" || host.endsWith(".springa.run");
}

/**
 * Same-origin relative redirects only.
 * Rejects protocol-relative URLs, backslashes (incl. decoded %5C), and external origins.
 */
export function safeQaRedirect(
  redirectTo: string,
  requestOrigin: string,
): string {
  if (!redirectTo || redirectTo.includes("\\") || /%5c/i.test(redirectTo)) {
    return "/";
  }
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) return "/";
  try {
    const origin = new URL(requestOrigin).origin;
    const candidate = new URL(redirectTo, origin);
    if (candidate.origin !== origin) return "/";
    const path = `${candidate.pathname}${candidate.search}${candidate.hash}`;
    if (path.includes("\\") || /%5c/i.test(path)) return "/";
    return path;
  } catch {
    return "/";
  }
}

export function isLocalQaAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.NODE_ENV !== "development") return false;

  for (const raw of [env.AUTH_URL, env.NEXTAUTH_URL]) {
    if (!raw?.trim()) continue;
    try {
      const { hostname } = new URL(raw);
      if (isSpringaHostname(hostname)) return false;
    } catch {
      return false;
    }
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
