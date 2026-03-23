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

/** SHA-256 hash a secret. Returns lowercase hex string. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Get the encryption key from env, or throw. */
export function getEncryptionKey(): string {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (key?.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return key;
}

// --- DB functions ---

export interface UserCredentials {
  intervalsApiKey: string | null;
  mylifeEmail: string | null;
  mylifePassword: string | null;
  nightscoutSecret: string | null; // the hash, not the plaintext
  timezone: string;
}

/** Fetch and decrypt per-user credentials from DB. */
export async function getUserCredentials(email: string): Promise<UserCredentials | null> {
  const result = await db().execute({
    sql: "SELECT intervals_api_key, mylife_email, mylife_password, nightscout_secret, timezone FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const encKey = getEncryptionKey();

  return {
    intervalsApiKey: row.intervals_api_key ? decrypt(row.intervals_api_key as string, encKey) : null,
    mylifeEmail: row.mylife_email as string | null,
    mylifePassword: row.mylife_password ? decrypt(row.mylife_password as string, encKey) : null,
    nightscoutSecret: row.nightscout_secret as string | null,
    timezone: (row.timezone as string | null) ?? "Europe/Stockholm",
  };
}

/** Update per-user credentials. Pass null to clear a field. Uses explicit SET (no COALESCE). */
export async function updateCredentials(
  email: string,
  updates: {
    intervalsApiKey?: string | null;
    mylifeEmail?: string | null;
    mylifePassword?: string | null;
    nightscoutSecretHash?: string | null;
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
  if ("mylifeEmail" in updates) {
    sets.push("mylife_email = ?");
    args.push(updates.mylifeEmail ?? null);
  }
  if ("mylifePassword" in updates) {
    sets.push("mylife_password = ?");
    args.push(updates.mylifePassword ? encrypt(updates.mylifePassword, encKey) : null);
  }
  if ("nightscoutSecretHash" in updates) {
    sets.push("nightscout_secret = ?");
    args.push(updates.nightscoutSecretHash ?? null);
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

/** Validate a Nightscout api-secret against per-user SHA-256 hashes in DB.
 *  Returns the user's email if valid, null if not. */
export async function validateApiSecretFromDB(
  apiSecret: string | null,
): Promise<string | null> {
  if (!apiSecret) return null;

  const hashed = hashSecret(apiSecret);

  const result = await db().execute({
    sql: "SELECT email FROM user_settings WHERE nightscout_secret = ?",
    args: [hashed],
  });

  if (result.rows.length === 0) return null;
  return result.rows[0].email as string;
}
