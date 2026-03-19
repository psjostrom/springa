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
 * Validate API secret header. Returns true if valid.
 *
 * Accepts both pre-hashed (CGM source sends SHA1) and raw (SugarRun sends plaintext).
 * This is an intentional unification — the original routes handled these separately,
 * but accepting both forms is strictly more permissive and harmless.
 */
export function validateApiSecret(apiSecret: string | null): boolean {
  if (!apiSecret || !process.env.CGM_SECRET) return false;
  return apiSecret === sha1(process.env.CGM_SECRET)
    || apiSecret === process.env.CGM_SECRET;
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
