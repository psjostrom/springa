---
name: db-query
description: Query the Turso database. Use when needing to inspect bg_readings, credentials, settings, treatments, or any table data. Also use when diagnosing data issues or verifying database state.
user-invocable: false
---

# Turso Database Query

## How to Query

Use `npm run db:query` which runs `node --env-file=.env.local -e`. The lib/db.ts module is ESM/TypeScript and cannot be required directly — use `@libsql/client` instead:

```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('YOUR SQL HERE').then(r=>console.log(r.rows))"
```

**NEVER** use raw `node -e` with `process.env.TURSO_*` — `.env.local` won't be loaded.

## Tables

| Table | Primary Key | Purpose |
|-------|------------|---------|
| `user_settings` | `email` | User config, credentials, race info, preferences |
| `bg_readings` | `(email, ts)` | CGM glucose readings from Strimma |
| `activity_streams` | `(email, activity_id)` | HR/pace/BG timeseries per run |
| `run_analysis` | `(email, activity_id)` | AI-generated run analysis text |
| `push_subscriptions` | `(email, endpoint)` | Web push notification subscriptions |
| `prerun_push_log` | `(email, event_date)` | Tracks sent pre-run notifications |
| `bg_patterns` | `email` | AI-generated cross-run BG pattern analysis |
| `prerun_carbs` | `(email, event_id)` | Pre-run carb intake per workout |
| `treatments` | `(email, id)` | Insulin/carb treatments from MyLife (Nightscout format) |

## Common Queries

**Count BG readings:**
```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('SELECT count(*) as n FROM bg_readings').then(r=>console.log(r.rows))"
```

**Recent BG readings:**
```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('SELECT * FROM bg_readings ORDER BY ts DESC LIMIT 5').then(r=>console.log(r.rows))"
```

**List users:**
```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute('SELECT email, display_name, sugar_mode, onboarding_complete FROM user_settings').then(r=>console.log(r.rows))"
```

**Parameterized query (use ? placeholders):**
```bash
npm run db:query -- "const{createClient}=require('@libsql/client');const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute({sql:'SELECT count(*) as n FROM bg_readings WHERE email=?',args:['user@example.com']}).then(r=>console.log(r.rows))"
```

## Key Columns

**user_settings** — credentials and config:
- `intervals_api_key` — Intervals.icu API key
- `nightscout_secret` — SHA-256 hashed CGM secret (indexed)
- `sugar_mode` — T1D features enabled (0/1)
- `google_refresh_token`, `google_calendar_id` — Google Calendar sync
- `treatments_synced_at` — ms epoch of last MyLife treatment sync

**bg_readings** — CGM data:
- `ts` — Unix epoch ms
- `mmol` — glucose in mmol/L
- `sgv` — glucose in mg/dL
- `direction` — trend arrow (Flat, FortyFiveUp, etc.)
- `delta` — rate of change

**activity_streams** — run timeseries:
- `hr`, `pace`, `cadence`, `altitude` — JSON arrays
- `run_bg_context` — JSON with pre/post BG context
- `fuel_rate` — g/h carbs during run
