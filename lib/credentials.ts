import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { db } from "./db";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKeyBuffer(hexKey: string): Buffer {
  return Buffer.from(hexKey, "hex");
}

/** Encrypt plaintext with AES-256-GCM. Returns base64(iv + ciphertext + authTag). */
export function encrypt(plaintext: string, hexKey: string): string {
  const key = getKeyBuffer(hexKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

/** Decrypt base64(iv + ciphertext + authTag) with AES-256-GCM. */
export function decrypt(encoded: string, hexKey: string): string {
  const key = getKeyBuffer(hexKey);
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** SHA-1 hash a secret. Returns lowercase hex string.
 *  Uses SHA-1 for Nightscout protocol compatibility — NS clients send
 *  SHA1(secret) in the api-secret header. Not used for security-sensitive
 *  operations (encryption uses AES-256-GCM above). */
export function hashSecret(secret: string): string {
  // lgtm[js/weak-cryptographic-algorithm] — Nightscout protocol requires SHA-1
  return createHash("sha1").update(secret).digest("hex"); // nosemgrep: weak-crypto
}

/** Get the encryption key from env, or throw.
 *  Validated on first use (cold start), not at import time — Vercel functions
 *  surface this as a 500 on the first request if misconfigured. */
export function getEncryptionKey(): string {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (key?.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return key;
}

/** Decrypt with graceful fallback — returns null on failure instead of crashing the request. */
function tryDecrypt(encoded: string, hexKey: string, email: string, field: string): string | null {
  try {
    return decrypt(encoded, hexKey);
  } catch (err) {
    console.error(`Failed to decrypt ${field} for ${email}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// --- DB functions ---

export interface UserCredentials {
  intervalsApiKey: string | null;
  nightscoutUrl: string | null;
  nightscoutSecret: string | null; // encrypted secret for outgoing auth
  timezone: string;
}

export interface GoogleCalendarCredentials {
  refreshToken: string | null;
  calendarId: string | null;
  timezone: string;
}

/** Fetch and decrypt per-user credentials from DB. */
export async function getUserCredentials(email: string): Promise<UserCredentials | null> {
  const result = await db().execute({
    sql: "SELECT intervals_api_key, nightscout_url, nightscout_secret, timezone FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const encKey = getEncryptionKey();

  return {
    intervalsApiKey: row.intervals_api_key ? tryDecrypt(row.intervals_api_key as string, encKey, email, "intervals_api_key") : null,
    nightscoutUrl: row.nightscout_url as string | null,
    nightscoutSecret: row.nightscout_secret ? tryDecrypt(row.nightscout_secret as string, encKey, email, "nightscout_secret") : null,
    timezone: (row.timezone as string | null) ?? "Europe/Stockholm",
  };
}

/** Update per-user credentials. Pass null to clear a field. Uses explicit SET (no COALESCE). */
export async function updateCredentials(
  email: string,
  updates: {
    intervalsApiKey?: string | null;
    nightscoutUrl?: string | null;
    nightscoutSecret?: string | null;
    timezone?: string;
  },
): Promise<void> {
  const encKey = getEncryptionKey();
  const sets: string[] = [];
  const args: (string | null)[] = [];

  if ("intervalsApiKey" in updates) {
    sets.push("intervals_api_key = ?");
    args.push(updates.intervalsApiKey ? encrypt(updates.intervalsApiKey, encKey) : null);
  }
  if ("nightscoutUrl" in updates) {
    sets.push("nightscout_url = ?");
    args.push(updates.nightscoutUrl ?? null);
  }
  if ("nightscoutSecret" in updates) {
    sets.push("nightscout_secret = ?");
    args.push(updates.nightscoutSecret ? encrypt(updates.nightscoutSecret, encKey) : null);
  }
  if ("timezone" in updates) {
    sets.push("timezone = ?");
    args.push(updates.timezone ?? "Europe/Stockholm");
  }

  if (sets.length === 0) return;
  args.push(email);

  await db().execute({
    sql: `UPDATE user_settings SET ${sets.join(", ")} WHERE email = ?`,
    args,
  });
}

/** Validate a Nightscout api-secret against per-user SHA-1 hashes in DB.
 *  Accepts both raw plaintext and SHA-1 prehashed (standard NS protocol).
 *  Returns the user's email if valid, null if not. */
export async function validateApiSecretFromDB(
  apiSecret: string | null,
): Promise<string | null> {
  if (!apiSecret) return null;

  // If client sent raw secret, hash it to match DB
  const hashed = hashSecret(apiSecret);

  // Try hashed first (client sent raw secret — most common for Strimma)
  let result = await db().execute({
    sql: "SELECT email FROM user_settings WHERE nightscout_secret = ?",
    args: [hashed],
  });

  // If no match, try direct (client already sent SHA-1 — standard NS behavior)
  if (result.rows.length === 0) {
    result = await db().execute({
      sql: "SELECT email FROM user_settings WHERE nightscout_secret = ?",
      args: [apiSecret],
    });
  }

  if (result.rows.length === 0) return null;
  return result.rows[0].email as string;
}

/** Fetch Google Calendar credentials for a user. */
export async function getGoogleCalendarCredentials(email: string): Promise<GoogleCalendarCredentials | null> {
  const result = await db().execute({
    sql: "SELECT google_refresh_token, google_calendar_id, timezone FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const encKey = getEncryptionKey();

  return {
    refreshToken: row.google_refresh_token ? tryDecrypt(row.google_refresh_token as string, encKey, email, "google_refresh_token") : null,
    calendarId: row.google_calendar_id as string | null,
    timezone: (row.timezone as string | null) ?? "Europe/Stockholm",
  };
}

/** Store encrypted Google refresh token. Pass null to clear. */
export async function updateGoogleRefreshToken(email: string, refreshToken: string | null): Promise<void> {
  const encKey = getEncryptionKey();
  await db().execute({
    sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
    args: [refreshToken ? encrypt(refreshToken, encKey) : null, email],
  });
}

/** Store Google Calendar ID. */
export async function updateGoogleCalendarId(email: string, calendarId: string): Promise<void> {
  await db().execute({
    sql: "UPDATE user_settings SET google_calendar_id = ? WHERE email = ?",
    args: [calendarId, email],
  });
}
