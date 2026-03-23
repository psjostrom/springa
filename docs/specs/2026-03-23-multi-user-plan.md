# Multi-User Infrastructure Lift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire Springa's infrastructure from env-var-based single-user to DB-backed multi-user. Zero functional changes — the existing user (Per) must notice no difference.

**Architecture:** Move all per-user credentials (Intervals.icu API key, MyLife credentials, CGM secret, timezone) from environment variables to encrypted/hashed columns in `user_settings`. Replace the `getEmail()` LIMIT 1 pattern and single-secret `validateApiSecret()` with per-user DB lookups. Update auth from hardcoded email whitelist to DB-backed approval flag.

**Tech Stack:** Next.js 16, TypeScript, Turso/libsql, NextAuth v5, Node crypto (AES-256-GCM)

**Spec:** `docs/specs/2026-03-23-multi-user-design.md`

**What this plan does NOT include:** Sugar mode gating, setup wizard, pending page UI, provisioning script, AI model switch. Those are future phases that build on this foundation.

---

## File Map

### New Files
- `lib/credentials.ts` — encrypt/decrypt (AES-256-GCM), hashSecret (SHA-256), getUserCredentials(), updateCredentials()
- `scripts/migrate-existing-user.ts` — one-time migration: reads current env vars, encrypts/hashes, writes to DB

### Modified Files
- `lib/db.ts` — add new columns to SCHEMA_DDL
- `lib/settings.ts` — add new fields to UserSettings interface and getUserSettings query
- `lib/auth.ts` — replace hardcoded email whitelist with DB approval check
- `lib/apiHelpers.ts` — replace validateApiSecret (DB lookup), remove getEmail(), update getMyLifeData signature
- `lib/intervalsHelpers.ts` — resolveTimezone() accepts timezone parameter
- `lib/bgPatternContext.ts` — accept intervalsApiKey parameter instead of reading env
- `lib/runAnalysisContext.ts` — accept intervalsApiKey parameter instead of reading env
- `app/api/settings/route.ts` — read credentials from DB, write credentials via updateCredentials
- `app/api/v1/entries/route.ts` — use new validateApiSecret (returns email)
- `app/api/v1/treatments/route.ts` — use new validateApiSecret, per-user MyLife credentials
- `app/api/run-completed/route.ts` — use new validateApiSecret, remove LIMIT 1
- `app/api/workout-steps/route.ts` — use new validateApiSecret, per-user Intervals key
- `app/api/wellness/route.ts` — per-user Intervals key from DB
- `app/api/run-feedback/route.ts` — per-user Intervals key from DB
- `app/api/insulin-context/route.ts` — per-user MyLife credentials
- `app/api/cron/prerun-push/route.ts` — per-user credentials in loop (API key, MyLife, wellness/TSB all inside user loop)
- `app/api/bg-patterns/route.ts` — pass intervalsApiKey to context builder
- `app/api/run-analysis/route.ts` — pass intervalsApiKey to context builder
- `lib/bgDb.ts` — remove unused `sha1` export (dead code after validateApiSecret removal)
- `lib/__tests__/apiHelpers.test.ts` — update tests for new validateApiSecret
- `lib/__tests__/routes.test.ts` — update tests for DB-backed credentials

### Removed After Migration
- Env vars: `INTERVALS_API_KEY`, `MYLIFE_EMAIL`, `MYLIFE_PASSWORD`, `CGM_SECRET`, `TIMEZONE`

### New Env Var
- `CREDENTIALS_ENCRYPTION_KEY` — 32-byte random key for AES-256-GCM

---

## Task 1: Schema Changes

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Update SCHEMA_DDL with new columns**

Add to the `user_settings` CREATE TABLE in `lib/db.ts`:

```sql
  approved           INTEGER NOT NULL DEFAULT 0,
  sugar_mode         INTEGER NOT NULL DEFAULT 0,
  display_name       TEXT,
  timezone           TEXT DEFAULT 'Europe/Stockholm',
  intervals_api_key  TEXT,
  run_days           TEXT,
  mylife_email       TEXT,
  mylife_password    TEXT,
  cgm_secret         TEXT,
  onboarding_complete INTEGER NOT NULL DEFAULT 0
```

Also add after the treatments index:

```sql
CREATE INDEX IF NOT EXISTS idx_cgm_secret ON user_settings(cgm_secret);
```

- [ ] **Step 2: Run the existing test suite to make sure nothing breaks**

Run: `npm test`
Expected: All existing tests pass (DDL changes are additive, no column removals)

- [ ] **Step 3: Commit**

Message: "Add multi-user columns to user_settings schema DDL"

---

## Task 2: Credential Helpers

**Files:**
- Create: `lib/credentials.ts`
- Create: `lib/__tests__/credentials.test.ts`

- [ ] **Step 1: Write tests for encrypt/decrypt and hashSecret**

```typescript
// lib/__tests__/credentials.test.ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt, hashSecret } from "../credentials";

// Use a fixed test key (32 bytes hex-encoded = 64 chars)
const TEST_KEY = "a".repeat(64);

describe("encrypt/decrypt", () => {
  it("round-trips a string", () => {
    const plaintext = "my-api-key-123";
    const ciphertext = encrypt(plaintext, TEST_KEY);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(plaintext);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("throws on wrong key", () => {
    const ciphertext = encrypt("secret", TEST_KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});

describe("hashSecret", () => {
  it("returns consistent SHA-256 hex", () => {
    const hash = hashSecret("my-secret");
    expect(hash).toBe(hashSecret("my-secret"));
    expect(hash).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
  });

  it("differs for different inputs", () => {
    expect(hashSecret("a")).not.toBe(hashSecret("b"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/credentials.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement credential helpers**

```typescript
// lib/credentials.ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

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
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/** SHA-256 hash a secret. Returns lowercase hex string. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Get the encryption key from env, or throw. */
export function getEncryptionKey(): string {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return key;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/credentials.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

Message: "Add credential encryption and hashing helpers"

---

## Task 3: getUserCredentials and updateCredentials

**Files:**
- Modify: `lib/credentials.ts` (add DB functions)
- Create: `lib/__tests__/credentials.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Test that `getUserCredentials` reads the right columns and `updateCredentials` can write and clear them. Use the in-memory libsql test client pattern from existing tests.

```typescript
// Test: getUserCredentials returns decrypted API key
// Test: getUserCredentials returns null for missing user
// Test: updateCredentials encrypts and stores
// Test: updateCredentials can clear a field by passing null
// Test: validateApiSecretFromDB returns email for matching secret
// Test: validateApiSecretFromDB returns null for unknown secret
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement getUserCredentials**

Add to `lib/credentials.ts`:

```typescript
import { db } from "./db";

export interface UserCredentials {
  intervalsApiKey: string | null;
  mylifeEmail: string | null;
  mylifePassword: string | null;
  cgmSecret: string | null; // the hash, not the plaintext
  timezone: string;
}

/** Fetch and decrypt per-user credentials from DB. */
export async function getUserCredentials(email: string): Promise<UserCredentials | null> {
  const result = await db().execute({
    sql: "SELECT intervals_api_key, mylife_email, mylife_password, cgm_secret, timezone FROM user_settings WHERE email = ?",
    args: [email],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const encKey = getEncryptionKey();

  return {
    intervalsApiKey: row.intervals_api_key ? decrypt(row.intervals_api_key as string, encKey) : null,
    mylifeEmail: row.mylife_email as string | null,
    mylifePassword: row.mylife_password ? decrypt(row.mylife_password as string, encKey) : null,
    cgmSecret: row.cgm_secret as string | null,
    timezone: (row.timezone as string) ?? "Europe/Stockholm",
  };
}
```

- [ ] **Step 4: Implement updateCredentials**

```typescript
/** Update per-user credentials. Pass null to clear a field. Uses explicit SET (no COALESCE). */
export async function updateCredentials(
  email: string,
  updates: {
    intervalsApiKey?: string | null;
    mylifeEmail?: string | null;
    mylifePassword?: string | null;
    cgmSecretHash?: string | null;
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
  if ("cgmSecretHash" in updates) {
    sets.push("cgm_secret = ?");
    args.push(updates.cgmSecretHash ?? null);
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
```

- [ ] **Step 5: Implement validateApiSecretFromDB**

```typescript
/** Validate a Nightscout api-secret against per-user SHA-256 hashes in DB.
 *  Client sends raw plaintext secret, we hash it and look up.
 *  Returns the user's email if valid, null if not. */
export async function validateApiSecretFromDB(
  apiSecret: string | null,
): Promise<string | null> {
  if (!apiSecret) return null;

  const hashed = hashSecret(apiSecret);

  const result = await db().execute({
    sql: "SELECT email FROM user_settings WHERE cgm_secret = ?",
    args: [hashed],
  });

  if (result.rows.length === 0) return null;
  return result.rows[0].email as string;
}
```

- [ ] **Step 6: Run tests, verify pass**

- [ ] **Step 7: Commit**

Message: "Add getUserCredentials, updateCredentials, and validateApiSecretFromDB"

---

## Task 4: Update lib/apiHelpers.ts

**Files:**
- Modify: `lib/apiHelpers.ts`
- Modify: `lib/__tests__/apiHelpers.test.ts`

- [ ] **Step 1: Update tests to use DB-backed validation**

Rewrite the `validateApiSecret` tests. Instead of setting `process.env.CGM_SECRET`, set up a user row in the test DB with a hashed secret. Import `validateApiSecretFromDB` instead.

Update `getMyLifeData` tests (if any) for new signature: `getMyLifeData(email: string, password: string, tz: string)`.

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Rewrite apiHelpers.ts**

Remove:
- `validateApiSecret()` function (replaced by `validateApiSecretFromDB` in credentials.ts)
- `getEmail()` function (replaced by DB lookup in validateApiSecretFromDB)
- All `process.env.CGM_SECRET` reads
- All `process.env.MYLIFE_*` reads
- All `process.env.TIMEZONE` reads

Update `getMyLifeData`:
```typescript
/** Fetch MyLife data with explicit credentials. */
export async function getMyLifeData(
  mylifeEmail: string,
  mylifePassword: string,
  tz: string,
): Promise<MyLifeData | null> {
  try {
    const session = await mylifeSignIn(mylifeEmail, mylifePassword);
    return await fetchMyLifeData(session, tz);
  } catch (err) {
    console.error("[mylife] Failed:", err);
    clearMyLifeSession(mylifeEmail);
    return null;
  }
}
```

Keep: `requireAuth()`, `AuthError`, `unauthorized()` — unchanged.

**Keep old exports alive temporarily** to avoid compile errors before consumer routes are updated. Mark as deprecated:
```typescript
/** @deprecated — use validateApiSecretFromDB from lib/credentials instead. Removed in Task 14. */
export function validateApiSecret(apiSecret: string | null): boolean { /* keep existing impl */ }
/** @deprecated — use validateApiSecretFromDB instead. Removed in Task 14. */
export async function getEmail(): Promise<string | null> { /* keep existing impl */ }
```

Re-export from credentials for convenience:
```typescript
export { validateApiSecretFromDB } from "./credentials";
```

The deprecated functions are deleted in Task 14 after all consumers are migrated.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

Message: "Remove env var reads from apiHelpers, use DB-backed credentials"

---

## Task 5: Update lib/auth.ts

**Files:**
- Modify: `lib/auth.ts`

- [ ] **Step 1: Replace hardcoded email whitelist with DB approval check**

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const result = await db().execute({
        sql: "SELECT approved FROM user_settings WHERE email = ?",
        args: [user.email],
      });
      if (result.rows.length === 0) return false;
      return (result.rows[0].approved as number) === 1;
    },
  },
});
```

Note: This does NOT create rows for unknown users (no pending page yet). Unknown users simply can't sign in, same as before. Per's row has `approved=1`, so he signs in normally.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

Message: "Replace hardcoded email whitelist with DB approval check"

---

## Task 6: Update lib/settings.ts

**Files:**
- Modify: `lib/settings.ts`

- [ ] **Step 1: Add new fields to UserSettings interface**

```typescript
export interface UserSettings {
  // Existing fields
  raceDate?: string;
  raceName?: string;
  raceDist?: number;
  totalWeeks?: number;
  startKm?: number;
  widgetOrder?: string[];
  hiddenWidgets?: string[];
  bgChartWindow?: number;
  includeBasePhase?: boolean;
  warmthPreference?: number;

  // New multi-user fields
  approved?: boolean;
  sugarMode?: boolean;
  displayName?: string;
  timezone?: string;
  runDays?: number[];
  onboardingComplete?: boolean;

  // Non-DB fields — populated by the settings API route
  intervalsApiKey?: string;
  cgmConnected?: boolean;
  mylifeConnected?: boolean;
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
}
```

- [ ] **Step 2: Update getUserSettings SELECT to include new columns**

Add `approved, sugar_mode, display_name, timezone, run_days, intervals_api_key, mylife_email, cgm_secret, onboarding_complete` to the SELECT query. Parse the new fields from the row.

Note: `intervals_api_key`, `mylife_email`, and `cgm_secret` are only used to derive boolean flags (`intervalsApiKey` set/not-set, `cgmConnected`, `mylifeConnected`). The actual decrypted API key is fetched by `getUserCredentials()` in credential-sensitive code paths, not exposed via settings.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

Message: "Add multi-user fields to UserSettings interface and query"

---

## Task 7: Update resolveTimezone

**Files:**
- Modify: `lib/intervalsHelpers.ts`

- [ ] **Step 1: Change resolveTimezone to accept a timezone parameter**

Current:
```typescript
export function resolveTimezone(): string {
  return process.env.TIMEZONE ?? "Europe/Stockholm";
}
```

New:
```typescript
export function resolveTimezone(userTimezone?: string): string {
  return userTimezone ?? "Europe/Stockholm";
}
```

- [ ] **Step 2: Update all callers of resolveTimezone to pass the user's timezone**

Search for all callers (including `app/api/workout-steps/route.ts` which uses api-secret auth — after `validateApiSecretFromDB` returns the email, fetch timezone via `getUserCredentials(email)`). Each caller should either have the user's email in scope already or get it from the auth mechanism.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

Message: "Remove TIMEZONE env var read from resolveTimezone"

---

## Task 8: Update Context Builders

**Files:**
- Modify: `lib/bgPatternContext.ts`
- Modify: `lib/runAnalysisContext.ts`

- [ ] **Step 1: Add intervalsApiKey to BGPatternInput**

```typescript
// lib/bgPatternContext.ts
export interface BGPatternInput {
  email: string;
  events: CalendarEvent[];
  intervalsApiKey: string; // NEW — no longer reading from env
}
```

Remove line 31: `const intervalsApiKey = process.env.INTERVALS_API_KEY;`
Use `input.intervalsApiKey` instead.

- [ ] **Step 2: Add intervalsApiKey to BuildRunAnalysisContextInput**

```typescript
// lib/runAnalysisContext.ts
interface BuildRunAnalysisContextInput {
  email: string;
  event: CalendarEvent;
  runStartMs: number;
  intervalsApiKey: string; // NEW
  // ... rest unchanged
}
```

Remove line 46: `const intervalsApiKey = process.env.INTERVALS_API_KEY;`
Use `input.intervalsApiKey` instead.

- [ ] **Step 3: Update getMyLifeData calls in both files**

Both files call `getMyLifeData()` with no credentials. Update to pass credentials from the caller (the API route will fetch credentials and pass them through the input interface, or the context builder fetches them itself via `getUserCredentials(email)`).

Simplest approach: have the context builders call `getUserCredentials(email)` internally for MyLife credentials, since they already have the email.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

Message: "Remove env var reads from context builders, accept credentials as params"

---

## Task 9: Update API Routes — Intervals.icu Key

**Files:**
- Modify: `app/api/settings/route.ts`
- Modify: `app/api/wellness/route.ts`
- Modify: `app/api/run-feedback/route.ts`
- Modify: `app/api/insulin-context/route.ts`
- Modify: `app/api/bg-patterns/route.ts`
- Modify: `app/api/run-analysis/route.ts`

These routes all read `process.env.INTERVALS_API_KEY`. Change each to:

```typescript
const creds = await getUserCredentials(email);
if (!creds?.intervalsApiKey) {
  return NextResponse.json({ error: "Intervals.icu not configured" }, { status: 400 });
}
const apiKey = creds.intervalsApiKey;
```

- [ ] **Step 1: Update /api/settings GET**

Remove `const apiKey = process.env.INTERVALS_API_KEY;` (line 21).
Read from DB via `getUserCredentials(email)`.
For `cgmConnected` and `mylifeConnected`, check if the credential columns are non-null in the settings query (already done in Task 6).

- [ ] **Step 2: Update /api/settings PUT**

When receiving `intervalsApiKey`, `mylifeEmail`, `mylifePassword`, or `timezone`, call `updateCredentials()` instead of `saveUserSettings()` for those fields. Keep `saveUserSettings()` for the non-credential fields.

- [ ] **Step 3: Update /api/wellness**

Remove `const apiKey = process.env.INTERVALS_API_KEY;` — use `getUserCredentials(email).intervalsApiKey`.

- [ ] **Step 4: Update /api/run-feedback**

Two locations (lines 109, 174) read `process.env.INTERVALS_API_KEY`. Replace both with `getUserCredentials(email).intervalsApiKey`.

- [ ] **Step 5: Update /api/insulin-context**

This route calls `getMyLifeData()` with zero arguments. Update to fetch per-user MyLife credentials via `getUserCredentials(email)` and pass them explicitly.

- [ ] **Step 6: Update /api/bg-patterns and /api/run-analysis**

These routes call `buildBGPatternContext()` and `buildRunAnalysisContext()`. Pass the API key from `getUserCredentials(email)` into the input object (updated in Task 8).

- [ ] **Step 7: Run tests, verify pass**

- [ ] **Step 8: Commit**

Message: "Switch API routes from env var to per-user Intervals.icu key"

---

## Task 10: Update API Routes — Nightscout Endpoints

**Files:**
- Modify: `app/api/v1/entries/route.ts`
- Modify: `app/api/v1/treatments/route.ts`
- Modify: `app/api/run-completed/route.ts`
- Modify: `app/api/workout-steps/route.ts`

- [ ] **Step 1: Update /api/v1/entries (GET and POST)**

Replace:
```typescript
if (!validateApiSecret(req.headers.get("api-secret"))) { return unauthorized(); }
const email = await getEmail();
```

With:
```typescript
const email = await validateApiSecretFromDB(req.headers.get("api-secret"));
if (!email) return unauthorized();
```

Remove imports of `validateApiSecret` and `getEmail`. Import `validateApiSecretFromDB` from `lib/credentials`.

- [ ] **Step 2: Update /api/v1/treatments (GET and POST)**

Same pattern as entries. Also update the `getMyLifeData()` call inside `after()` to pass per-user MyLife credentials:

```typescript
const creds = await getUserCredentials(email);
if (creds?.mylifeEmail && creds?.mylifePassword) {
  const data = await getMyLifeData(creds.mylifeEmail, creds.mylifePassword, creds.timezone);
  // ... rest unchanged
}
```

- [ ] **Step 3: Update /api/run-completed**

Replace:
```typescript
if (!validateApiSecret(req.headers.get("api-secret"))) { return unauthorized(); }
const result = await db().execute({ sql: "SELECT email FROM user_settings LIMIT 1", args: [] });
const email = result.rows[0]?.email as string;
```

With:
```typescript
const email = await validateApiSecretFromDB(req.headers.get("api-secret"));
if (!email) return unauthorized();
```

- [ ] **Step 4: Update /api/workout-steps**

Replace `validateApiSecret` + `process.env.INTERVALS_API_KEY` with `validateApiSecretFromDB` + `getUserCredentials`.

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

Message: "Switch Nightscout endpoints to per-user secret lookup"

---

## Task 11: Update Cron Job

**Files:**
- Modify: `app/api/cron/prerun-push/route.ts`

- [ ] **Step 1: Read the full cron route to understand the loop structure**

- [ ] **Step 2: Move ALL per-user data fetching inside the user loop**

Currently the route fetches apiKey, wellness/TSB, and IOB ONCE before the loop using a shared key. ALL of this must move inside the loop — each user's data must be fetched with their own credentials.

Current pattern (broken for multi-user):
```typescript
const apiKey = process.env.INTERVALS_API_KEY; // ONE key for ALL users
const wellness = await fetchWellnessData(apiKey, ...); // ONE user's wellness
for (const email of emails) {
  // uses shared apiKey AND shared wellness for every user
}
```

New pattern:
```typescript
for (const email of emails) {
  const creds = await getUserCredentials(email);
  if (!creds?.intervalsApiKey) continue; // skip users without Intervals configured
  const apiKey = creds.intervalsApiKey;

  // Per-user wellness/TSB — was outside loop before
  const wellness = await fetchWellnessData(apiKey, oldest, newest);
  // ... compute TSB per-user

  // Per-user MyLife data
  if (creds.mylifeEmail && creds.mylifePassword) {
    const mylifeData = await getMyLifeData(creds.mylifeEmail, creds.mylifePassword, creds.timezone);
    // ...
  }

  // ... rest of loop uses per-user apiKey and data
}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

Message: "Use per-user credentials in prerun-push cron job"

---

## Task 12: Update Tests

**Files:**
- Modify: `lib/__tests__/apiHelpers.test.ts`
- Modify: `lib/__tests__/routes.test.ts`

- [ ] **Step 1: Update apiHelpers tests**

Remove all `process.env.CGM_SECRET` manipulation. Tests for `validateApiSecret` are replaced by tests for `validateApiSecretFromDB` (in credentials.test.ts from Task 3).

Remove or update `getMyLifeData` tests for new signature.

- [ ] **Step 2: Update routes tests**

The routes tests set `process.env.CGM_SECRET` and `process.env.INTERVALS_API_KEY` in beforeEach/afterEach blocks. Replace with:
- Insert a test user row with hashed CGM secret and encrypted Intervals API key
- Set `CREDENTIALS_ENCRYPTION_KEY` in test env

Update assertions to match new error messages if any changed.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: ALL tests pass

- [ ] **Step 4: Commit**

Message: "Update tests for DB-backed credentials"

---

## Task 13: Migration Script

**Files:**
- Create: `scripts/migrate-existing-user.ts`

- [ ] **Step 1: Write the migration script**

```typescript
// scripts/migrate-existing-user.ts
// One-time script to migrate Per's credentials from env vars to DB.
// Run with: CREDENTIALS_ENCRYPTION_KEY=<key> npx tsx scripts/migrate-existing-user.ts

import { createClient } from "@libsql/client";
import { encrypt, hashSecret } from "../lib/credentials";
import { randomBytes } from "crypto";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function migrate() {
  const encKey = process.env.CREDENTIALS_ENCRYPTION_KEY!;
  const email = "persinternetpost@gmail.com";

  // 1. ALTER TABLE — add new columns (idempotent)
  const alters = [
    "ALTER TABLE user_settings ADD COLUMN approved INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE user_settings ADD COLUMN sugar_mode INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE user_settings ADD COLUMN display_name TEXT",
    "ALTER TABLE user_settings ADD COLUMN timezone TEXT DEFAULT 'Europe/Stockholm'",
    "ALTER TABLE user_settings ADD COLUMN intervals_api_key TEXT",
    "ALTER TABLE user_settings ADD COLUMN run_days TEXT",
    "ALTER TABLE user_settings ADD COLUMN mylife_email TEXT",
    "ALTER TABLE user_settings ADD COLUMN mylife_password TEXT",
    "ALTER TABLE user_settings ADD COLUMN cgm_secret TEXT",
    "ALTER TABLE user_settings ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 0",
  ];

  for (const sql of alters) {
    try { await db.execute(sql); }
    catch (e: any) { if (!e.message?.includes("duplicate column")) throw e; }
  }

  // Create index
  await db.execute("CREATE INDEX IF NOT EXISTS idx_cgm_secret ON user_settings(cgm_secret)");

  // 2. Generate new CGM secret
  const newCgmSecret = randomBytes(32).toString("hex");
  const cgmHash = hashSecret(newCgmSecret);

  // 3. Encrypt credentials
  const intervalsKey = process.env.INTERVALS_API_KEY;
  const mylifeEmail = process.env.MYLIFE_EMAIL;
  const mylifePassword = process.env.MYLIFE_PASSWORD;

  const encIntervalsKey = intervalsKey ? encrypt(intervalsKey, encKey) : null;
  const encMylifePassword = mylifePassword ? encrypt(mylifePassword, encKey) : null;

  // 4. Update existing user
  await db.execute({
    sql: `UPDATE user_settings SET
      approved = 1,
      sugar_mode = 1,
      onboarding_complete = 1,
      timezone = 'Europe/Stockholm',
      intervals_api_key = ?,
      mylife_email = ?,
      mylife_password = ?,
      cgm_secret = ?
    WHERE email = ?`,
    args: [encIntervalsKey, mylifeEmail ?? null, encMylifePassword, cgmHash, email],
  });

  console.log("Migration complete.");
  console.log(`New CGM secret (configure in Strimma): ${newCgmSecret}`);
  console.log("Remove these env vars: INTERVALS_API_KEY, MYLIFE_EMAIL, MYLIFE_PASSWORD, CGM_SECRET, TIMEZONE");
}

migrate().catch(console.error);
```

- [ ] **Step 2: Generate CREDENTIALS_ENCRYPTION_KEY**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Add to Vercel env vars and `.env.local`.

- [ ] **Step 3: Run migration against production DB**

Run: `CREDENTIALS_ENCRYPTION_KEY=<key> npx tsx scripts/migrate-existing-user.ts`

- [ ] **Step 4: Update Strimma with new CGM secret** (manual step)

**Note: CGM data flow will stop between deploy and Strimma reconfiguration.** Strimma will send the old secret, which won't match the new SHA-256 hash. This is a brief, expected gap. Reconfigure Strimma immediately after deploy.

- [ ] **Step 5: Remove old env vars from Vercel and .env.local**

Remove: `INTERVALS_API_KEY`, `MYLIFE_EMAIL`, `MYLIFE_PASSWORD`, `CGM_SECRET`, `TIMEZONE`

- [ ] **Step 6: Deploy and verify everything works**

Run: `npm run build && vercel deploy`

Test:
- Sign in works
- Calendar loads (Intervals.icu API key from DB)
- BG data flows (new CGM secret in Strimma → Springa)
- MyLife treatments sync (credentials from DB)

- [ ] **Step 7: Commit**

Message: "Add migration script for existing user credentials"

---

## Task 14: Final Cleanup & Verification

- [ ] **Step 1: Remove deprecated functions from apiHelpers.ts**

Delete the deprecated `validateApiSecret()` and `getEmail()` functions. Remove the `sha1` import from `lib/bgDb.ts`. All consumers should be using `validateApiSecretFromDB` from `lib/credentials.ts` by now.

- [ ] **Step 2: Grep for any remaining env var reads**

```bash
grep -rn "process.env.INTERVALS_API_KEY\|process.env.MYLIFE_\|process.env.CGM_SECRET\|process.env.TIMEZONE" lib/ app/ --include="*.ts" --exclude-dir="__tests__"
```

Expected: Zero matches in non-test files.

- [ ] **Step 2: Grep for remaining getEmail() calls**

```bash
grep -rn "getEmail()" lib/ app/ --include="*.ts"
```

Expected: Zero matches (function removed).

- [ ] **Step 3: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit any remaining cleanup**
