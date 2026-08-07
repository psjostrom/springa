# Agent browser QA (local auth bypass)

Sustainable way for agents to use a **logged-in** Springa session without Google OAuth.

**Browser tool:** use **`agent-browser`** (CLI). Do not assume Cursor IDE browser MCP is available.

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
- Never print `QA_AUTH_TOKEN` or full login URLs containing the token in chat or agent reports

## Agent modes

| Mode | When | Writes |
| --- | --- | --- |
| **Smoke** (default) | Confirm login / navigation only | **Read-only** — no plan regenerate, settings saves, Deletes, or Intervals uploads |
| **Feature QA** | User explicitly asked to test a product change on the QA account | Writes **OK on the dedicated QA account only** — never on the owner prod email |

If the user did not say which mode, use **Smoke**.

## One-time env setup (per machine / worktree)

```bash
cd /path/to/checkout-or-worktree
npm run setup-worktree
# or: cp /Users/psjostrom/code/springa/.env.local .env.local

# Required in .env.local (do not commit):
# AUTH_URL=http://localhost:3000          # must match next --port
# QA_AUTH_TOKEN=<openssl rand -hex 32>
# QA_AUTH_EMAIL=<dedicated-qa-google-email>
```

`setup-worktree` seeds `AUTH_URL` and `QA_AUTH_*` placeholders when missing. You still must set `QA_AUTH_EMAIL` to the dedicated account.

`AUTH_URL` / `NEXTAUTH_URL` in the **process environment** override `.env.local`. Use that when Next runs on a non-default port:

```bash
AUTH_URL=http://localhost:3005 npm run dev -- --port 3005
LOGIN_URL="$(AUTH_URL=http://localhost:3005 npm run -s qa:login-url -- /)"
```

The login URL host and port must match the running server.

## Testing another feature branch (overlay — do not commit)

QA auth may not be on the branch under test. **Do not** cherry-pick into a product PR.

```bash
cd /path/to/feature-worktree
./scripts/qa-overlay.sh                 # from feature/agent-qa-auth (or pass a ref)
# after merge to main: ./scripts/qa-overlay.sh origin/main

npm run setup-worktree                  # if .env.local incomplete
# set QA_AUTH_EMAIL if empty

AUTH_URL=http://localhost:3000 npm run dev -- --port 3000
# …agent-browser session…

./scripts/qa-overlay.sh --remove        # restore tree before any commit/push
git status                              # must be clean of QA overlay files
```

`qa-overlay.sh` checks out QA auth files into the worktree and patches `qa:login-url` on `package.json`. Marker: `.git/qa-overlay-active`. Never commit that dirty state into a feature PR.

## Worktrees and Turbopack

`next.config.ts` sets `turbopack.root` to this checkout so a worktree under `.claude/worktrees/` does not silently serve the parent repo. Always `cd` into the worktree before `npm run dev`.

## Agent recipe

```bash
cd /path/to/checkout-or-worktree
# If this branch lacks QA auth: ./scripts/qa-overlay.sh

AUTH_URL=http://localhost:3000 npm run dev -- --port 3000

LOGIN_URL="$(npm run -s qa:login-url -- /)"
# Never paste LOGIN_URL or the token into chat/reports.

agent-browser open "$LOGIN_URL"
```

### Required after login (identity check)

Before any product clicks, confirm the session is the QA user:

```bash
agent-browser eval "fetch('/api/auth/session').then(r=>r.json()).then(d=>({email:d?.user?.email||null}))"
```

Expect `email` to equal `QA_AUTH_EMAIL` (case-insensitive). If it does not, **stop** — do not continue as the wrong user.

(`/api/settings` does not include `email` in its JSON payload — use the session endpoint for identity.)

### Dismiss blocking UI

Before opening Generate / dense modals, dismiss the push toast if present:

```bash
agent-browser eval "(() => { const x=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='×'||b.textContent.trim()==='x'); const dismiss=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Dismiss'); (dismiss||x)?.click(); return true; })()"
```

### When finished

```bash
agent-browser close
./scripts/qa-overlay.sh --remove   # if you used the overlay
```

## Endpoints

| Path | Behavior |
| --- | --- |
| `GET /api/qa/login?token=…&redirectTo=/` | Validates token, creates Auth.js session via Credentials provider `qa`, redirects |
| `POST /api/qa/mobile` `{ "token": "…" }` | Same gates; returns mobile Bearer JWT `{ token, expiresAt, user: { email } }` for `springa-native` |
| Same paths when QA disabled | `404 Not Found` |
| Bad token | `401 Unauthorized` |

## Native app (`springa-native`)

Same token/email env on local Springa. The app exchanges the token for a Bearer session (no cookie).

```bash
# Springa (local, QA env set)
npm run dev -- --port 3000

# Build deep link (do not paste into chat — contains the token)
DEEP_LINK="$(npm run -s qa:native-deep-link)"

# Emulator / device with the native dev client
adb shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" com.springa.app
```

`EXPO_PUBLIC_SPRINGA_API_URL` on the native app must point at that local Springa (not `springa.run`). The `qa-login` route is `__DEV__`-only.

## Files

- `lib/qaAuth.ts` — allow / verify helpers
- `lib/auth.ts` — Credentials provider `qa`
- `app/api/qa/login/route.ts` — browser login entry
- `app/api/qa/mobile/route.ts` — native Bearer login entry
- `proxy.ts` — allows `/api/qa/*` without an existing session (checked before the demo cookie rewrite)
- `scripts/print-qa-login-url.sh` — builds browser login URL (`npm run qa:login-url`)
- `scripts/print-qa-native-deep-link.sh` — builds `springa://qa-login?token=…` (`npm run qa:native-deep-link`)
- `scripts/qa-overlay.sh` — temporary QA auth on another branch (`--remove` to restore)
- `scripts/setup-worktree.sh` — copies `.env.local`, seeds `AUTH_URL` + `QA_AUTH_*`
- `next.config.ts` — `turbopack.root` pinned to this checkout

## Troubleshooting

- **404 from `/api/qa/login` or `/api/qa/mobile`** — QA disabled. Check: `NODE_ENV=development`, `VERCEL_ENV` isn't `production`, `AUTH_URL`/`NEXTAUTH_URL` doesn't point at `springa.run` (or a subdomain), and both `QA_AUTH_TOKEN` and `QA_AUTH_EMAIL` are set (non-empty after trimming).
- **401** — token mismatch. Rebuild the URL with `npm run qa:login-url` / `qa:native-deep-link` from current `.env.local` — do not paste tokens into chat.
- **Native still on login after deep link** — confirm API URL is local Springa, Metro is this checkout, and the build is a `__DEV__` client.
- **Wrong code in a worktree** — confirm `cd` is the worktree; check the Next “inferred workspace root” warning is gone (pinned `turbopack.root`).
- **Clicks hit the wrong UI** — dismiss the push “Enable” toast; close Next.js issues overlay if present.
- **Overlay left on a feature branch** — run `./scripts/qa-overlay.sh --remove` and `git status` before committing.
