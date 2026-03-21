import { NextResponse } from "next/server";
import { auth } from "./auth";
import { sha1 } from "./bgDb";
import { signIn as mylifeSignIn, fetchMyLifeData, clearSession as clearMyLifeSession } from "./mylife";
import type { MyLifeData } from "./mylife";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
  }
}

/** Get authenticated user email or throw AuthError. */
export async function requireAuth(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new AuthError();
  return email;
}

/**
 * Validate API secret from a Request. Nightscout-compatible.
 *
 * Accepts:
 *   1. api-secret header (pre-hashed SHA1 or raw plaintext)
 *   2. ?token= query param (Nightscout-compatible)
 */
export function validateRequest(req: Request): boolean {
  if (!process.env.CGM_SECRET) return false;
  const header = req.headers.get("api-secret");
  const token = new URL(req.url).searchParams.get("token");
  const candidates = [header, token].filter(Boolean) as string[];
  if (candidates.length === 0) return false;
  const hashed = sha1(process.env.CGM_SECRET);
  return candidates.some(c => c === hashed || c === process.env.CGM_SECRET);
}
/** Fetch MyLife data, returning null on failure or missing credentials. */
export async function getMyLifeData(tz?: string): Promise<MyLifeData | null> {
  const email = process.env.MYLIFE_EMAIL;
  const password = process.env.MYLIFE_PASSWORD;
  if (!email || !password) return null;

  try {
    const session = await mylifeSignIn(email, password);
    return await fetchMyLifeData(session, tz ?? process.env.TIMEZONE ?? "Europe/Stockholm");
  } catch (err) {
    console.error("[mylife] Failed:", err);
    clearMyLifeSession(email);
    return null;
  }
}

/** Get the single configured user's email, or null if not set. */
export async function getEmail(): Promise<string | null> {
  const { db } = await import("./db");
  const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
  const email = result.rows[0]?.email;
  return typeof email === "string" ? email : null;
}

/** Standard 401 response for auth failures. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
