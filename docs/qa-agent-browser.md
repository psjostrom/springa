# Agent browser QA (local auth bypass)

Sustainable way for agents to use a **logged-in** Springa session without Google OAuth.

## Prerequisites (human, once)

1. Create a **dedicated** Google account for QA (not the owner's prod email).
2. Sign in to Springa locally with that account and complete `/setup` with that user's **own** Intervals.icu API key and Nightscout.
3. Confirm the app works as that user (planner loads, settings show the QA email).

Agents never run onboarding.

## Safety

- Works **only** when `NODE_ENV=development`
- **Hard-disabled** when `VERCEL_ENV=production` or `AUTH_URL` / `NEXTAUTH_URL` points at `springa.run`
- Missing `QA_AUTH_*` → `/api/qa/login` returns **404**
- Bad token → **401**
- `QA_AUTH_EMAIL` **must** be the dedicated QA Google account email — never the owner's prod account
- Default agent posture: **read-only** navigation unless the user explicitly authorizes writes
- Never print `QA_AUTH_TOKEN` or full login URLs containing the token in chat

## One-time env setup (per machine / worktree)

```bash
# In the worktree
cp /Users/psjostrom/code/springa/.env.local .
# or: npm run setup-worktree

# Ensure these exist in .env.local (do not commit):
# QA_AUTH_TOKEN=<openssl rand -hex 32>
# QA_AUTH_EMAIL=<dedicated-qa-google-email>
```

Align `AUTH_URL` or `NEXTAUTH_URL` with the port you run (e.g. `http://localhost:3000`).

## Agent recipe

```bash
cd /path/to/checkout-or-worktree
npm run dev -- --port 3000

LOGIN_URL="$(npm run -s qa:login-url -- /)"
# or: LOGIN_URL="$(./scripts/print-qa-login-url.sh '/?tab=planner')"

agent-browser open "$LOGIN_URL"
# Cookie/session is set → snapshot → interact.
# When finished: close the browser session.
```

## Endpoints

| Path | Behavior |
| --- | --- |
| `GET /api/qa/login?token=…&redirectTo=/` | Validates token, creates Auth.js session via Credentials provider `qa`, redirects |
| Same path when QA disabled | `404 Not Found` |
| Bad token | `401 Unauthorized` |

## Files

- `lib/qaAuth.ts` — allow / verify helpers
- `lib/auth.ts` — Credentials provider `qa`
- `app/api/qa/login/route.ts` — login entry
- `proxy.ts` — allows `/api/qa/*` without an existing session (checked before the demo cookie rewrite)
- `scripts/print-qa-login-url.sh` — builds login URL (also available as `npm run qa:login-url`)
- `scripts/setup-worktree.sh` — copies `.env.local` and seeds a `QA_AUTH_TOKEN` placeholder into new worktrees

## Troubleshooting

- **404 from `/api/qa/login`** — QA is disabled. Check: `NODE_ENV=development` (not `production`), `VERCEL_ENV` isn't `production`, `AUTH_URL`/`NEXTAUTH_URL` doesn't point at `springa.run` (or a subdomain like `preview.springa.run`), and both `QA_AUTH_TOKEN` and `QA_AUTH_EMAIL` are set (non-empty after trimming) in `.env.local`.
- **401 from `/api/qa/login`** — QA is enabled but the token didn't match. Re-run `npm run qa:login-url` to regenerate the URL from the current `.env.local` value rather than reusing an old one — do not paste tokens into chat/logs while debugging.
