# Springa Multi-User Design Spec

## Overview

Convert Springa from a single-user app to a multi-user platform supporting 100 users. Diabetes features become toggleable ("Sugar mode") so the app can serve both diabetic and non-diabetic runners. Intervals.icu remains the activity data backbone. No new external services required.

## Target User

iPhone + old Apple Watch. Wants to start running. No Garmin, no prior Intervals.icu experience. May or may not have diabetes.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Diabetes toggle | "Sugar mode" (single boolean) | Covers T1D, T2D, LADA. On-brand with SugarField/SugarGraph/SugarWave. Simpler than per-module toggles. |
| Auth provider | Google OAuth (keep NextAuth) | Already works. No reason to change. |
| User provisioning | Self-signup with admin approval | Anyone signs in with Google, lands on pending page until approved. Admin approves via script/DB insert. |
| Activity data source | Intervals.icu (required) | Springa depends on Intervals.icu for activity data, training load, pace curves, wellness. Replacing it means rebuilding an analytics engine. |
| Apple Watch support | Health Sync app ($5) or Intervals.icu Companion v3 (when released) | Apple Health -> Intervals.icu bridge. Zero Springa development needed. |
| Workout storage | Intervals.icu (keep current) | Not worth migrating to Turso for launch. Intervals.icu is the source of truth for workouts and activities. |
| AI model | Keep Sonnet | Works well, cost is ~$10/month at 10 users. Not worth switching models and re-validating all prompts to save $9. |
| CGM ingestion | Per-user secrets in DB | Strimma/xDrip+/any NS client configured with per-user secret. Lookup by secret hash identifies user. |
| Nightscout compliance | 100% NS-compatible APIs | Standing rule. All CGM/BG/treatment endpoints follow the Nightscout spec. |

## What a Non-Sugar User Sees

Training plan calendar, pace curves, wellness data, HR zones, workout generation, AI coach (fitness-only context), report card (HR compliance only, no BG scoring).

## What Sugar Mode Adds

BG chart, CGM status, fuel rate system, insulin context, pre-run assessment, BG scoring in report card, post-run spike analysis, BG model, BG simulation, MyLife integration, treatments view, extended cooldown taper system.

---

## 1. Auth & User Management

### Current State
- Hardcoded email whitelist in `lib/auth.ts` line 15: `user.email === "persinternetpost@gmail.com"`
- NextAuth v5 beta, JWT sessions, Google provider
- All API routes use `requireAuth()` which extracts email from session

### Changes

**Remove hardcoded whitelist.** Replace with DB-backed approval check:

```
signIn callback:
  1. Check if email exists in user_settings
  2. If exists and approved -> allow
  3. If exists and not approved -> allow sign-in but redirect to /pending
  4. If not exists -> create row with approved=false, redirect to /pending
```

**New columns on `user_settings`:**
- `approved` (INTEGER, default 0) -- admin approval flag
- `sugar_mode` (INTEGER, default 0) -- diabetes features toggle
- `display_name` (TEXT) -- user's display name
- `timezone` (TEXT, default 'Europe/Stockholm') -- per-user timezone
- `intervals_api_key` (TEXT) -- user's Intervals.icu API key
- `mylife_email` (TEXT) -- MyLife credentials (Sugar mode only)
- `mylife_password` (TEXT) -- encrypted
- `cgm_secret` (TEXT) -- per-user Nightscout API secret (hashed)
- `run_days` (TEXT) -- JSON array of weekday numbers the user can run, e.g. [1,3,5,0] for Mon/Wed/Fri/Sun
- `onboarding_complete` (INTEGER, default 0) -- setup wizard finished

**Provisioning script:** CLI script that inserts a user row with `approved=1`. Can also pre-fill Intervals.icu credentials if known.

```bash
npx tsx scripts/provision-user.ts \
  --email user@example.com \
  --name "Johan" \
  --sugar-mode \
  --timezone Europe/Stockholm
```

### Pending Page

Simple page at `/pending` shown to unapproved users:
- "Your account is pending approval"
- Contact info or link to request access

---

## 2. Setup Wizard

First login flow for approved users who haven't completed onboarding.

### Steps

1. **Welcome** -- name, timezone picker
2. **Connect Your Watch** -- guided Intervals.icu setup:
   - "Create a free Intervals.icu account" (link)
   - "Connect your watch" (instructions for Garmin direct / Apple Watch via Health Sync / Companion)
   - Paste API key
   - Validate by fetching athlete profile
3. **Running Schedule** -- which days of the week can you run? (multi-select: Mon-Sun) and how many days per week (derived from selection, shown as confirmation). Editable in settings.
4. **Running Goal** (optional) -- race name, date, distance. Or "I just want to run"
5. **HR Zones** -- auto-imported from Intervals.icu profile, or manual entry
6. **Sugar Mode** -- "Do you manage diabetes?" toggle. If yes:
   - Generate CGM secret (display for copy, explain Strimma/xDrip+ setup)
   - Optional MyLife connection
7. **Done** -- redirect to calendar

### Skip Behavior

Users can skip steps 4-6 and fill in later via settings. Steps 1-3 are required (Intervals.icu is a hard dependency, and running schedule drives workout generation).

---

## 3. Sugar Mode

### Toggle Behavior

`user_settings.sugar_mode` (boolean). Changeable in settings at any time.

### When Sugar Mode is OFF, hide:

**UI Components:**
- BG chart widget
- CGM connection status
- Fuel rate display on workouts
- Insulin context panel
- Pre-run BG assessment
- BG score in report card
- Treatments view
- MyLife connection in settings
- CGM secret in settings
- BG simulation
- BG patterns widget

**Backend Behavior:**
- Workout generation: skip fuel rate calculations, skip extended cooldown taper, skip spike penalty
- AI coach: exclude BG context, patterns, and insulin data from system prompt
- Report card: HR zone compliance only, no BG scoring
- Adapt plan: no fuel rate adjustments, no BG-driven workout swaps
- Pre-run push notifications: skip BG readiness checks

### When Sugar Mode is ON:

Everything works as today. Full BG model, fuel rates, CGM integration, insulin context, the works.

### Data Isolation

Sugar mode data (bg_readings, treatments, bg_patterns, prerun_carbs) is still stored per-user even when Sugar mode is off. Toggling it back on restores access. No data deletion on toggle.

### Sugar Mode ON Without CGM

Valid state: user enables Sugar mode but hasn't configured a CGM secret yet. BG components show empty/placeholder states ("No CGM connected"). Settings page includes "Generate CGM secret" option so users can set up CGM at any time, not just during the setup wizard.

---

## 4. Per-User Credentials

### Move from Environment Variables to Database

| Credential | Current Location | New Location | Encryption |
|------------|-----------------|--------------|------------|
| `INTERVALS_API_KEY` | env var | `user_settings.intervals_api_key` | AES-256-GCM (full account access) |
| `MYLIFE_EMAIL` | env var | `user_settings.mylife_email` | Plaintext |
| `MYLIFE_PASSWORD` | env var | `user_settings.mylife_password` | AES-256-GCM (env var encryption key) |
| `CGM_SECRET` | env var | `user_settings.cgm_secret` | SHA-256 hash (write-only) |
| `TIMEZONE` | env var | `user_settings.timezone` | Plaintext |
| `ANTHROPIC_API_KEY` | env var | env var (shared) | N/A |

### Encryption

Add `CREDENTIALS_ENCRYPTION_KEY` env var (32-byte random key). Used for AES-256-GCM encryption of sensitive credentials (MyLife password, Intervals.icu API key). Storage format: `base64(iv + ciphertext + authTag)` in a single TEXT column. The IV (12 bytes) is generated fresh per encryption.

Encrypt: Intervals.icu API key (grants full read/write to training data), MyLife password. Store as hash: CGM secret (SHA-256, write-only).

### Intervals.icu Athlete ID

Current code uses `athlete/0` everywhere (shorthand for "current user's own profile"). For multi-user with per-user API keys, this still works -- each user's API key resolves `athlete/0` to their own profile. No code change needed in `intervalsApi.ts`.

### No Env Var Fallback

Per-user credentials live in the DB. Period. No fallback to env vars, no dual resolution paths. The existing user's credentials are migrated to the DB in Phase 1 alongside the schema changes. `INTERVALS_API_KEY`, `MYLIFE_EMAIL`, `MYLIFE_PASSWORD`, `CGM_SECRET`, and `TIMEZONE` are removed from env vars at the same time.

---

## 5. CGM Data Ingestion (Sugar Mode Only)

### Current State
- Single `CGM_SECRET` env var
- `getEmail()` uses `SELECT email FROM user_settings LIMIT 1`
- Strimma/xDrip+ sends api-secret header
- Current hash algorithm: SHA-1 (in `lib/bgDb.ts`)

### Changes

**Hash algorithm migration:** Current code uses SHA-1. New code uses SHA-256. Since only one user exists today, migration is: generate a new secret, hash with SHA-256, store in DB, reconfigure Strimma with the new secret. No dual-algorithm support needed.

**Per-user secrets:**
1. During provisioning or setup wizard, generate a random CGM secret
2. Hash with SHA-256, store hash in `user_settings.cgm_secret`
3. Display plaintext secret to user once (for configuring Strimma/xDrip+)

**Lookup by secret:**

Replace `validateApiSecret()` + `getEmail()` with:

```
1. Receive api-secret header
2. Hash it with SHA-256
3. SELECT email FROM user_settings WHERE cgm_secret = ?
4. If found -> authenticated, email identified
5. If not found -> 401
```

**Affected routes:**
- `POST /api/v1/entries` -- CGM readings from Strimma/xDrip+
- `GET /api/v1/entries` -- CGM readings query
- `POST /api/v1/treatments` -- treatments from NS clients
- `GET /api/v1/treatments` -- treatments query
- `POST /api/run-completed` -- Garmin post-run webhook

### Strimma Configuration

Strimma already has a server URL + API secret field. Users enter:
- URL: `https://www.springa.run`
- API Secret: (the generated secret from setup wizard)

No Strimma code changes needed.

---

## 6. API Route Changes

### Already Correct (no changes needed)
All authenticated routes already use `requireAuth()` -> `email` -> email-scoped queries:
- `/api/bg/` -- `getBGReadings(email)`
- `/api/bg-patterns/` -- `getBGPatterns(email)`
- `/api/settings/` -- `getUserSettings(email)`
- `/api/chat/` -- scoped to user's BG patterns
- `/api/adapt-plan/` -- scoped to user's data
- `/api/run-analysis/` -- scoped to user's streams
- `/api/bg-cache/` -- scoped to user's streams
- `/api/insulin-context/` -- scoped to user's BG readings
- `/api/run-feedback/` -- scoped to user's data
- `/api/prerun-carbs/` -- scoped to user's data
- `/api/push/subscribe/` -- scoped to user's subscriptions
- `/api/wellness/` -- needs user's API key (see below)

### Changes Required

**`GET /api/settings`:**
- Fetch `intervals_api_key` from DB instead of `process.env.INTERVALS_API_KEY`
- Fetch `timezone` from DB instead of `process.env.TIMEZONE`
- Return `sugar_mode` flag
- Return `onboarding_complete` flag

**`PUT /api/settings`:**
- Accept `intervals_api_key`, `timezone`, `sugar_mode`, `run_days`, `mylife_email`, `mylife_password`, `display_name`
- Encrypt MyLife password before storing
- Validate Intervals.icu API key by fetching athlete profile

**`/api/wellness`:**
- Fetch user's `intervals_api_key` from DB instead of env var

**`/api/v1/entries` and `/api/v1/treatments`:**
- Replace `validateApiSecret()` + `getEmail()` with per-user secret lookup (see section 5)

**`/api/run-completed`:**
- Replace `LIMIT 1` email lookup with per-user CGM secret lookup (same mechanism as `/api/v1/entries`). The Garmin watch already sends the api-secret header via SugarField's postRunCompleted webhook.

**`/api/cron/prerun-push`:**
- Currently reads `process.env.INTERVALS_API_KEY` once and uses it for ALL users in the loop. Must fetch each user's `intervals_api_key` from DB per iteration.
- `getMyLifeData()` currently reads env vars directly. Change signature to accept credentials (or user email for DB lookup). Each user's MyLife data fetched with their own credentials.
- Wellness/TSB must be computed per-user with per-user API keys.

**`getMyLifeData()` in `lib/apiHelpers.ts`:**
- Current signature: `getMyLifeData(tz?: string)` reads credentials from env vars.
- New signature: `getMyLifeData(email: string, password: string, tz?: string)` or `getMyLifeData(userEmail: string, tz?: string)` (looks up credentials from DB internally).
- Callers: `/api/cron/prerun-push`, `/api/v1/treatments` (both need updating).

**`saveUserSettings()` in `lib/settings.ts`:**
- Current COALESCE pattern prevents clearing fields to NULL. Credential fields (intervals_api_key, mylife_email, etc.) need explicit SET handling so users can disconnect services. Use a separate `updateCredentials()` function that doesn't use COALESCE.

**All routes using Intervals.icu API:**
- Fetch `intervals_api_key` from user's DB row instead of env var
- Pass through existing function signatures (all already accept `apiKey` parameter)

---

## 7. Onboarding Flow for Target User

### "Johan, iPhone + Apple Watch, wants to start running, no diabetes"

1. Hears about Springa, goes to springa.run
2. Signs in with Google -> lands on pending page
3. Admin approves (script or DB)
4. Johan signs in again -> setup wizard starts
5. Enters name, picks timezone
6. "Connect Your Watch" step:
   - Creates free Intervals.icu account (guided link)
   - Installs Health Sync app ($5) to bridge Apple Health -> Intervals.icu
   - Enables Apple Health sync in Health Sync
   - Pastes Intervals.icu API key into Springa
   - Springa validates by fetching profile
7. Picks running days (Tue/Thu/Sat/Sun) -> 4 days/week confirmed
8. Sets a running goal (or skips)
9. HR zones auto-imported from Intervals.icu
10. "Do you manage diabetes?" -> No -> skips Sugar mode
11. Done -> sees calendar, first training plan generated
12. Goes for a run with Apple Watch built-in Workout app
13. Apple Watch -> Apple Health -> Health Sync -> Intervals.icu -> Springa picks it up
14. Post-run: report card, AI coaching, plan adaptation

### Total setup time: ~10 minutes (one-time)

---

## 8. Database Schema Changes

All changes are additive. No existing columns modified or removed.

### ALTER statements

```sql
ALTER TABLE user_settings ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN sugar_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN display_name TEXT;
ALTER TABLE user_settings ADD COLUMN timezone TEXT DEFAULT 'Europe/Stockholm';
ALTER TABLE user_settings ADD COLUMN intervals_api_key TEXT;
ALTER TABLE user_settings ADD COLUMN run_days TEXT;
ALTER TABLE user_settings ADD COLUMN mylife_email TEXT;
ALTER TABLE user_settings ADD COLUMN mylife_password TEXT;
ALTER TABLE user_settings ADD COLUMN cgm_secret TEXT;
ALTER TABLE user_settings ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 0;
```

### Migration for Existing User

```sql
-- Provisioning script handles this, including encrypting the API key
-- and hashing the CGM secret. Conceptually:
UPDATE user_settings
SET approved = 1,
    sugar_mode = 1,
    onboarding_complete = 1,
    timezone = 'Europe/Stockholm',
    intervals_api_key = encrypt(<current env var value>),
    mylife_email = <current env var value>,
    mylife_password = encrypt(<current env var value>),
    cgm_secret = sha256(<new generated secret>)
WHERE email = 'persinternetpost@gmail.com';
-- Then reconfigure Strimma with the new CGM secret
```

Existing user's credentials migrated from env vars to DB in the same step (see Section 4).

### Index Additions

```sql
CREATE INDEX idx_cgm_secret ON user_settings(cgm_secret);
```

The `cgm_secret` lookup needs to be fast for every CGM POST.

---

## 9. Infrastructure

### Turso Free Tier

- 9 GB storage, 1B reads/month, 25M writes/month
- 10 users with CGM: ~200K writes/month (<1% of limit)
- 100 users: ~2M writes/month (<10% of limit)
- No concerns until well past 100 users

### Vercel

No changes. Same deployment, same plan.

### New Environment Variables

- `CREDENTIALS_ENCRYPTION_KEY` -- 32-byte key for AES-256-GCM (MyLife password + Intervals.icu API key encryption)
### Existing Env Vars (unchanged)

`ANTHROPIC_API_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

### Env Vars Removed

`INTERVALS_API_KEY`, `MYLIFE_EMAIL`, `MYLIFE_PASSWORD`, `CGM_SECRET`, `TIMEZONE` -- removed from env vars entirely. All per-user credentials live in the DB. Existing user migrated in Phase 1.

---

## 10. Provisioning Script

`scripts/provision-user.ts` -- CLI tool for admin to approve users and set up credentials.

### Usage

```bash
# Approve a user who already signed in
npx tsx scripts/provision-user.ts --approve user@example.com

# Create and approve a new user with full config
npx tsx scripts/provision-user.ts \
  --email user@example.com \
  --name "Johan" \
  --approve \
  --sugar-mode \
  --timezone Europe/Stockholm \
  --intervals-key "abc123"

# Generate a CGM secret for a Sugar mode user
npx tsx scripts/provision-user.ts --gen-cgm-secret user@example.com
```

### What It Does

1. INSERT or UPDATE `user_settings` row
2. Set `approved = 1`
3. If `--sugar-mode`: set flag, generate and display CGM secret
4. If `--intervals-key`: store API key, validate by fetching profile
5. Print summary of provisioned user

---

## 11. Out of Scope (for launch)

- Workout storage migration to Turso (Intervals.icu stays as source of truth)
- Custom iOS bridge app (Health Sync / Companion v3 handles Apple Watch)
- Admin dashboard UI (provisioning via script is fine for 100 users)
- Billing / payments
- Garmin Connect direct API integration
- Self-serve signup (admin approval required)
- Email notifications (push notifications only)
- Multi-language support

---

## 12. Implementation Order

### Phase 1: Schema & Auth
1. Add new columns to `user_settings`
2. Migrate existing user (set approved=1, sugar_mode=1, onboarding_complete=1)
3. Remove hardcoded email whitelist
4. Add approval check to signIn callback
5. Create pending page
6. Create provisioning script

### Phase 2: Per-User Credentials
1. Update `GET /api/settings` to read credentials from DB
2. Update `PUT /api/settings` to accept new fields
3. Add MyLife password encryption/decryption
4. Update all Intervals.icu API calls to use per-user key from DB
5. Update wellness, calendar, and activity fetches

### Phase 3: Sugar Mode Gating
1. Add `sugar_mode` to client-side settings atom
2. Gate all BG/CGM/fuel UI components with sugar mode check
3. Gate workout generation fuel rate logic
4. Gate AI coach system prompt (exclude BG context when off)
5. Gate report card BG scoring
6. Gate adapt-plan BG adjustments

### Phase 4: CGM Multi-User
1. Implement per-user CGM secret generation and hashing
2. Replace `validateApiSecret()` with DB lookup
3. Remove `getEmail()` LIMIT 1 pattern
4. Update all Nightscout endpoints
5. Test with Strimma

### Phase 5: Setup Wizard
1. Build wizard UI (steps 1-6)
2. Intervals.icu API key validation
3. HR zone import from Intervals.icu
4. CGM secret generation display
5. Onboarding complete flag

### Phase 6: Testing & Hardening
1. Multi-user integration tests (concurrent users, data isolation)
2. Verify no cross-user data leaks in all queries
3. Test onboarding flow end-to-end
4. Test Sugar mode on/off transitions
5. Verify no remaining env var reads for per-user credentials
6. Security review: credential storage, secret hashing
7. Mobile responsiveness of setup wizard and pending page

### Phase 7: Verification & Polish
1. Remove deprecated `getEmail()` function (should already be dead code after Phase 4)
2. Grep for any remaining `process.env.INTERVALS_API_KEY` / `MYLIFE_*` / `CGM_SECRET` references
3. Update existing user's CGM secret from SHA-1 to SHA-256 (reconfigure Strimma)
