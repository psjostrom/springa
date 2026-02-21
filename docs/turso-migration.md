# Storage Migration: Upstash Redis → Turso (libSQL/SQLite)

*Analysis date: 2026-02-21*

## Why

Upstash Redis free tier: **256 MB storage**, 10K commands/day, **1 MB max value size**.

xDrip CGM readings grow ~560 KB/month as JSON blobs, requiring manual monthly sharding to stay under the value size limit. After ~15 months of data, we'd hit the 256 MB ceiling.

Turso free tier: **9 GB storage**, 500 databases, 1B row reads/month. No value size limit. SQLite-based, so time-series data gets proper range queries instead of blob loading.

## Current State

All Redis access is centralized in **`lib/settings.ts`** — 9 exported functions, 6 API route callers. No other file imports `@upstash/redis`.

### Redis Keys & Data

| Key Pattern | Data | Size | Read Freq | Write Freq |
|---|---|---|---|---|
| `user:{email}` | UserSettings JSON (API keys, xDrip secret) | ~200 B | Per page load | Rare (manual config) |
| `bgcache:{email}` | CachedActivity[] JSON (aligned HR/glucose per activity) | 50–500 KB | On app load | On activity completion |
| `xdrip-auth:{sha1}` | Email string (reverse lookup for webhook auth) | ~50 B | Every 5 min (webhook) | On secret rotation |
| `xdrip:{email}:{YYYY-MM}` | XdripReading[] JSON, sharded by month | ~560 KB/month | On page load + queries | Every 5 min (webhook) |
| `run-analysis:{email}:{activityId}` | Markdown string (cached LLM analysis) | 1–2 KB | On modal open | Once per activity |

### Function Signatures (unchanged in migration)

```typescript
// Settings
getUserSettings(email: string): Promise<UserSettings>
saveUserSettings(email: string, partial: Partial<UserSettings>): Promise<void>

// BG cache
getBGCache(email: string): Promise<CachedActivity[]>
saveBGCache(email: string, data: CachedActivity[]): Promise<void>

// xDrip auth
saveXdripAuth(email: string, secret: string): Promise<void>
lookupXdripUser(apiSecretHash: string): Promise<string | null>

// xDrip readings
getXdripReadings(email: string, months?: string[]): Promise<XdripReading[]>
saveXdripReadings(email: string, readings: XdripReading[]): Promise<void>

// Run analysis
getRunAnalysis(email: string, activityId: string): Promise<string | null>
saveRunAnalysis(email: string, activityId: string, text: string): Promise<void>

// Utils (pure, no storage)
monthKey(tsMs: number): string
sha1(input: string): string
```

### Callers (no changes needed)

| File | Functions Used |
|---|---|
| `app/api/settings/route.ts` | getUserSettings, saveUserSettings, saveXdripAuth |
| `app/api/bg-cache/route.ts` | getBGCache, saveBGCache |
| `app/api/v1/entries/route.ts` | lookupXdripUser, getXdripReadings, saveXdripReadings, monthKey |
| `app/api/xdrip/route.ts` | getXdripReadings |
| `app/api/run-analysis/route.ts` | getUserSettings, getRunAnalysis, saveRunAnalysis |
| `app/api/chat/route.ts` | getUserSettings |

---

## Proposed Schema

```sql
CREATE TABLE user_settings (
  email              TEXT PRIMARY KEY,
  intervals_api_key  TEXT,
  google_ai_api_key  TEXT,
  xdrip_secret       TEXT
);

CREATE TABLE xdrip_auth (
  secret_hash  TEXT PRIMARY KEY,
  email        TEXT NOT NULL
);
CREATE INDEX idx_xdrip_auth_email ON xdrip_auth(email);

-- Individual rows instead of JSON blobs.
-- PRIMARY KEY (email, ts) covers range queries — no extra index needed.
CREATE TABLE xdrip_readings (
  email     TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  mmol      REAL NOT NULL,
  sgv       INTEGER NOT NULL,
  direction TEXT NOT NULL,
  PRIMARY KEY (email, ts)
);

-- glucose[] and hr[] stored as JSON columns — always read as whole arrays.
CREATE TABLE bg_cache (
  email          TEXT NOT NULL,
  activity_id    TEXT NOT NULL,
  category       TEXT NOT NULL,
  fuel_rate      REAL,
  start_bg       REAL NOT NULL,
  glucose        TEXT NOT NULL,
  hr             TEXT NOT NULL,
  run_bg_context TEXT,
  PRIMARY KEY (email, activity_id)
);

CREATE TABLE run_analysis (
  email       TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  text        TEXT NOT NULL,
  PRIMARY KEY (email, activity_id)
);
```

### Schema Decisions

- **xdrip_readings as rows** — the biggest win. Enables `WHERE ts BETWEEN ? AND ?` range queries. Eliminates monthly sharding, 1 MB value limit workaround, and the read-modify-write cycle on every webhook.
- **bg_cache with JSON columns** — glucose[] and hr[] are always read as whole arrays, never filtered at the DB level. Normalizing into child tables would add joins with zero query benefit.
- **user_settings with typed columns** — 3 known fixed fields. Avoids JSON parse overhead.
- **xdrip_auth as separate table** — lookup is by hash (not email), so keeping it separate from user_settings is cleaner.

---

## Implementation Plan

### Step 1: Setup

- Create Turso database (`turso db create springa`)
- Run schema DDL
- Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to `.env.local`

### Step 2: Dependencies

```
npm install @libsql/client && npm uninstall @upstash/redis
```

### Step 3: Rewrite `lib/settings.ts`

Replace Redis singleton with Turso client. All exports stay identical.

| Function | Implementation |
|---|---|
| `getUserSettings` | `SELECT WHERE email = ?` → return `{}` if no row |
| `saveUserSettings` | `INSERT ON CONFLICT DO UPDATE SET col = COALESCE(excluded.col, col)` — upsert with merge, no read-then-write |
| `getBGCache` | `SELECT WHERE email = ?` → `JSON.parse()` glucose/hr/runBGContext columns |
| `saveBGCache` | `batch([DELETE WHERE email, ...INSERT per activity], "write")` — atomic replace |
| `saveXdripAuth` | `batch([DELETE WHERE email, INSERT new hash], "write")` — no need to read old secret first |
| `lookupXdripUser` | `SELECT email WHERE secret_hash = ?` — primary key lookup |
| `getXdripReadings` | Convert months to timestamp range → `SELECT WHERE email AND ts BETWEEN` |
| `saveXdripReadings` | `INSERT OR REPLACE` in batches of 100 — dedup via primary key |
| `getRunAnalysis` | `SELECT text WHERE email AND activity_id` |
| `saveRunAnalysis` | `INSERT OR REPLACE` |

### Step 4: Rewrite tests

Replace Redis mocks with **in-memory SQLite** (`url: "file::memory:"`). Tests run actual SQL instead of mocking — strictly better coverage.

### Step 5: Data migration script

One-time `scripts/migrate-redis-to-turso.ts`:
1. Connect to both Redis and Turso
2. Migrate each key pattern to the corresponding table
3. xDrip readings: ~69K rows for 8 months of data (batched inserts)
4. Verify row counts

### Step 6: Deploy

1. Push to `dev` → test on Vercel preview
2. Full mobile flow test
3. Push to `main` → production
4. Keep Upstash alive 2 weeks as rollback

---

## Files Changed

| File | Action |
|---|---|
| `lib/settings.ts` | **Rewrite** — Redis → libSQL, same exports |
| `lib/__tests__/settings.test.ts` | **Rewrite** — in-memory SQLite instead of Redis mock |
| `lib/__tests__/routes.test.ts` | **Modify** — replace Redis store mock with SQLite |
| `scripts/migrate-redis-to-turso.ts` | **Create** — one-time migration |
| `package.json` | **Modify** — swap dependencies |

**No changes to any API routes or UI components.**

---

## Risks

| Risk | Mitigation |
|---|---|
| libSQL HTTP latency vs Redis edge | Turso supports embedded replicas. For single-user app, latency difference is negligible. |
| `saveXdripReadings` writes full merged month (~8,640 rows) per webhook | Works correctly via INSERT OR REPLACE. Follow-up optimization: change entries route to only write new readings. |
| Test isolation | In-memory SQLite per test file, truncate tables in `beforeEach`. |

---

## Follow-Up Optimization (Out of Scope)

After migration, the entries route (`app/api/v1/entries/route.ts`) still does read → merge → write-all for xDrip readings. With Turso, this can be simplified to just `INSERT OR REPLACE` the new 1-3 readings per webhook, skipping the read and merge entirely. This would make the webhook ~10x faster.
