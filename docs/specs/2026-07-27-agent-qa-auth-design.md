# Agent Browser QA Auth (Local Credentials Bypass)

## Problem

Agents cannot complete interactive Google OAuth. Without a logged-in session they cannot QA Springa in a real browser. An earlier attempt (`feature/local-qa-auth`, PR #227) was opened before the workflow was designed and was closed.

## Goal

Ship a **dev-only** login path so an agent (or Cursor browser) can open Springa as a **normal Auth.js session** for a dedicated QA user — never the owner’s production account.

## Solution

Keep the Credentials-provider bypass already prototyped on `feature/local-qa-auth`, with docs and safety language that assume a dedicated QA Google account.

### Architecture

Springa is multi-tenant on one Turso DB, keyed by Google email (`user_settings.email`). A dedicated QA account is just another user.

1. **Human (once):** Create a Google account for QA → sign in → complete `/setup` with that user’s **own** Intervals.icu API key and Nightscout (diabetes mode). This creates a normal `user_settings` row.
2. **Local env:** `.env.local` sets `QA_AUTH_TOKEN` and `QA_AUTH_EMAIL=<qa-email>`. Never the owner’s prod email.
3. **Agent session:** Agent builds a login URL via `npm run qa:login-url`, opens it → `GET /api/qa/login` → Credentials provider `qa` → JWT session for that email.
4. **Thereafter:** All API routes use the real multi-user path (`requireAuth()` → session email). Same app, same Turso, different user.

Agents never run onboarding and never automate Google login.

### Components

| Piece | Role |
| --- | --- |
| `lib/qaAuth.ts` | `isLocalQaAllowed` / `verifyQaToken` / `getQaAuthEmail` |
| `lib/auth.ts` | Credentials provider `qa`; JWT populated with QA email |
| `app/api/qa/login/route.ts` | Token check → `signIn("qa")` → redirect |
| `proxy.ts` | Allow `/api/qa/*` without an existing session |
| `scripts/print-qa-login-url.sh` + `npm run qa:login-url` | Build login URL without printing the bare token |
| `docs/qa-agent-browser.md` | Machine setup + agent recipe |
| `lib/__tests__/qaAuth.test.ts` | Allow/deny unit coverage |

### Safety (non-negotiable)

- Allowed only when `NODE_ENV=development`
- Hard-disabled when `VERCEL_ENV=production` or `AUTH_URL` / `NEXTAUTH_URL` points at `springa.run`
- Missing `QA_AUTH_TOKEN` / `QA_AUTH_EMAIL` → `/api/qa/login` returns **404**
- Bad token → **401**
- Redirects: relative paths only (`/`…, reject `//…`)
- Token comparison: timing-safe, length-checked
- **Never print** `QA_AUTH_TOKEN` or full login URLs containing the token in user-facing chat
- `QA_AUTH_EMAIL` must be the dedicated QA account, not the owner’s prod email

### Agent recipe

```bash
npm run dev -- --port 3000   # AUTH_URL / NEXTAUTH_URL aligned
LOGIN_URL="$(npm run -s qa:login-url -- /)"
# open LOGIN_URL in agent-browser / Cursor browser
# default: read-only navigation; close browser when done
```

### Docs requirements

`docs/qa-agent-browser.md` must:

- Require a dedicated QA Google account (already onboarded) for `QA_AUTH_EMAIL`
- Not frame the feature as “impersonate yourself / prod account”
- Document 404 / 401 / env troubleshooting without echoing the token
- State read-only as the default agent posture

### Error handling

| Result | Meaning |
| --- | --- |
| Redirect into app | Success |
| 404 | QA disabled or env incomplete |
| 401 | Bad token |

### Testing

- Unit tests for `isLocalQaAllowed` / `verifyQaToken` / `getQaAuthEmail` (allow local; block production, springa.run, missing env; reject bad tokens)
- No requirement for E2E OAuth in CI

## Out of scope

- Creating the Google account or running `/setup` (human)
- Separate Turso database
- Enabling QA auth on Vercel production / `springa.run`
- Google login automation for agents
- Product feature QA scenarios (planner, BG, etc.) — this design is only how to get an authenticated session

## Implementation note

Prefer rebasing or cherry-picking the Credentials path from `feature/local-qa-auth` onto this branch, then updating docs to match this spec. Drop unrelated noise from that branch if present.
