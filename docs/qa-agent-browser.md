# Agent browser QA (local auth bypass)

Sustainable way for agents to use a **logged-in** Springa session without Google OAuth.

## Safety

- Works **only** when `NODE_ENV=development`
- **Hard-disabled** when `VERCEL_ENV=production` or `AUTH_URL` points at `springa.run`
- Missing `QA_AUTH_*` → `/api/qa/login` returns **404**
- Prefer a dedicated `QA_AUTH_EMAIL` or accept that this session uses that user's Turso row (prod data). For destructive clicks, use a separate Turso DB URL in `.env.local`.

## One-time setup (per machine / worktree)

```bash
# In the worktree
cp /Users/psjostrom/code/springa/.env.local .
# or: npm run setup-worktree

# Append QA vars (generate your own token; do not commit)
echo "QA_AUTH_TOKEN=$(openssl rand -hex 32)" >> .env.local
echo "QA_AUTH_EMAIL=you@example.com" >> .env.local   # user row to impersonate
```

Run schema migrates as needed (e.g. `npx tsx --env-file=.env.local scripts/migrate-effort-metric.ts`).

## Agent recipe

```bash
cd /path/to/worktree
npm run dev -- --port 3456   # keep AUTH_URL aligned if set

# Print login URL (does not echo the raw token alone)
LOGIN_URL="$(./scripts/print-qa-login-url.sh '/?tab=planner')"

agent-browser open "$LOGIN_URL"
# Session cookie is set; then click around.
# For prod-account safety: do not change metrics / Done-apply / regenerate unless authorized.
```

Or open the printed URL in Cursor’s browser tab after the user has configured env.

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
- `proxy.ts` — allows `/api/qa/*` without an existing session
