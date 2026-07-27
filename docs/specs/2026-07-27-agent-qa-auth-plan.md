# Agent QA Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dev-only Credentials login path so agents can open a normal Auth.js session as a dedicated QA Google user (never the owner’s prod account).

**Architecture:** Local-only helpers gate `/api/qa/login`. A successful token check calls Auth.js `signIn("qa")`, which authorizes against `QA_AUTH_EMAIL` and issues a JWT like any other user. Proxy allows `/api/qa/*` without a prior session. Docs and worktree setup assume a human-onboarded QA account.

**Tech Stack:** Next.js 16 App Router, Auth.js / next-auth v5 Credentials provider, Vitest, bash login-url script.

**Spec:** `docs/specs/2026-07-27-agent-qa-auth-design.md`

## Global Constraints

- Allowed only when `NODE_ENV=development`
- Hard-disabled when `VERCEL_ENV=production` or `AUTH_URL` / `NEXTAUTH_URL` points at `springa.run`
- Missing `QA_AUTH_TOKEN` / `QA_AUTH_EMAIL` → `/api/qa/login` returns 404
- Bad token → 401; relative redirects only
- Never print `QA_AUTH_TOKEN` (or full tokenized login URLs) in user-facing chat
- `QA_AUTH_EMAIL` is the dedicated QA account, not the owner’s prod email
- Do **not** bring unrelated changes from `feature/local-qa-auth` (next/next-auth bumps, `package-lock.json` churn, `lib/__tests__/paceInsight.test.ts`)
- Human creates/onboards the QA Google user outside this plan

## File structure

| File | Responsibility |
| --- | --- |
| `lib/qaAuth.ts` | Pure allow / verify / email helpers (injectable `env`) |
| `lib/__tests__/qaAuth.test.ts` | Unit coverage for those helpers |
| `lib/auth.ts` | Credentials provider `qa` + jwt/session email callbacks |
| `app/api/qa/login/route.ts` | HTTP entry: gate → verify → `signIn("qa")` |
| `proxy.ts` | Pass through `/api/qa/*` without requiring a session |
| `scripts/print-qa-login-url.sh` | Build login URL from `.env.local` |
| `package.json` | `qa:login-url` script only (no dependency bumps) |
| `scripts/setup-worktree.sh` | Resolve main checkout path; stub `QA_AUTH_*` if missing |
| `docs/qa-agent-browser.md` | Agent/human recipe aligned with the spec |

Reference prototype (do not merge as-is): branch `feature/local-qa-auth`.

---

### Task 1: `qaAuth` helpers (TDD)

**Files:**
- Create: `lib/__tests__/qaAuth.test.ts`
- Create: `lib/qaAuth.ts`

**Interfaces:**
- Produces:
  - `isLocalQaAllowed(env?: NodeJS.ProcessEnv): boolean`
  - `verifyQaToken(token: string | null | undefined, env?: NodeJS.ProcessEnv): boolean`
  - `getQaAuthEmail(env?: NodeJS.ProcessEnv): string | null`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/qaAuth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isLocalQaAllowed,
  verifyQaToken,
  getQaAuthEmail,
} from "../qaAuth";

const base = {
  NODE_ENV: "development",
  QA_AUTH_TOKEN: "test-token-exactly-32chars!!",
  QA_AUTH_EMAIL: "qa@example.com",
  AUTH_URL: "http://localhost:3000",
} as NodeJS.ProcessEnv;

describe("isLocalQaAllowed", () => {
  it("allows local development with token and email", () => {
    expect(isLocalQaAllowed(base)).toBe(true);
  });

  it("blocks Vercel production", () => {
    expect(
      isLocalQaAllowed({ ...base, VERCEL_ENV: "production" }),
    ).toBe(false);
  });

  it("blocks NODE_ENV production", () => {
    expect(isLocalQaAllowed({ ...base, NODE_ENV: "production" })).toBe(false);
  });

  it("blocks springa.run AUTH_URL", () => {
    expect(
      isLocalQaAllowed({ ...base, AUTH_URL: "https://www.springa.run" }),
    ).toBe(false);
  });

  it("blocks springa.run NEXTAUTH_URL when AUTH_URL unset", () => {
    const { AUTH_URL: _a, ...rest } = base;
    expect(
      isLocalQaAllowed({
        ...rest,
        NEXTAUTH_URL: "https://springa.run",
      }),
    ).toBe(false);
  });

  it("blocks missing token or email", () => {
    expect(isLocalQaAllowed({ ...base, QA_AUTH_TOKEN: "" })).toBe(false);
    expect(isLocalQaAllowed({ ...base, QA_AUTH_EMAIL: undefined })).toBe(false);
  });
});

describe("verifyQaToken", () => {
  it("accepts the configured token", () => {
    expect(verifyQaToken(base.QA_AUTH_TOKEN, base)).toBe(true);
  });

  it("rejects wrong or missing tokens", () => {
    expect(verifyQaToken("wrong-token-exactly-32chars!!!", base)).toBe(false);
    expect(verifyQaToken(null, base)).toBe(false);
    expect(verifyQaToken("short", base)).toBe(false);
  });

  it("rejects when QA is not allowed", () => {
    expect(
      verifyQaToken(base.QA_AUTH_TOKEN, {
        ...base,
        VERCEL_ENV: "production",
      }),
    ).toBe(false);
  });
});

describe("getQaAuthEmail", () => {
  it("returns lowercased email when allowed", () => {
    expect(
      getQaAuthEmail({ ...base, QA_AUTH_EMAIL: "QA@Example.COM" }),
    ).toBe("qa@example.com");
  });

  it("returns null when not allowed", () => {
    expect(getQaAuthEmail({ ...base, NODE_ENV: "production" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/qaAuth.test.ts`

Expected: FAIL (cannot resolve `../qaAuth` or exports missing)

- [ ] **Step 3: Implement helpers**

Create `lib/qaAuth.ts`:

```ts
import { timingSafeEqual } from "crypto";

/**
 * Local/dev-only QA auth helpers.
 * NEVER enable against production Vercel or springa.run AUTH_URL.
 */

export function isLocalQaAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.NODE_ENV !== "development") return false;

  const authUrl = env.AUTH_URL ?? env.NEXTAUTH_URL ?? "";
  if (authUrl && /(?:^|\/\/)(?:www\.)?springa\.run\b/i.test(authUrl)) {
    return false;
  }

  if (!env.QA_AUTH_TOKEN?.trim() || !env.QA_AUTH_EMAIL?.trim()) return false;
  return true;
}

export function verifyQaToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isLocalQaAllowed(env)) return false;
  const expected = env.QA_AUTH_TOKEN?.trim();
  if (!expected) return false;
  if (typeof token !== "string" || token.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function getQaAuthEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isLocalQaAllowed(env)) return null;
  const email = env.QA_AUTH_EMAIL?.trim();
  return email ? email.toLowerCase() : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/qaAuth.test.ts`

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add lib/qaAuth.ts lib/__tests__/qaAuth.test.ts
git commit -m "$(cat <<'EOF'
feat: add local QA auth allow/deny helpers

Gate agent browser login on development-only env checks and a
timing-safe token compare before any Credentials provider exists.
EOF
)"
```

---

### Task 2: Wire Credentials provider in `lib/auth.ts`

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `isLocalQaAllowed`, `verifyQaToken`, `getQaAuthEmail` from `lib/qaAuth.ts`
- Produces: Auth.js provider id `"qa"`; JWT/session carry `email` for Credentials sign-in

- [ ] **Step 1: Add imports and Credentials provider**

Replace `lib/auth.ts` with:

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { encrypt, getEncryptionKey } from "./credentials";
import {
  getQaAuthEmail,
  isLocalQaAllowed,
  verifyQaToken,
} from "./qaAuth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          // Always prompt consent to guarantee a refresh token on every sign-in.
          // Simpler than conditional consent (spec mentions dynamic, but not worth the complexity).
          prompt: "consent",
        },
      },
    }),
    Credentials({
      id: "qa",
      name: "QA",
      credentials: {
        token: { label: "Token", type: "password" },
      },
      async authorize(credentials) {
        if (!isLocalQaAllowed()) return null;
        // Auth.js types credentials as non-optional Record; runtime may omit fields
        const raw = credentials as { token?: unknown };
        const token = typeof raw.token === "string" ? raw.token : null;
        if (!token || !verifyQaToken(token)) return null;
        const email = getQaAuthEmail();
        if (!email) return null;

        await db().execute({
          sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
          args: [email],
        });

        return { id: email, email, name: "QA Session" };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      // QA Credentials authorize() already ensures the user_settings row exists.
      if (account?.provider !== "qa") {
        // Upsert: create user row if it doesn't exist (race-safe)
        await db().execute({
          sql: "INSERT OR IGNORE INTO user_settings (email) VALUES (?)",
          args: [user.email],
        });
      }

      // Store refresh token when Google provides one (on consent).
      // Wrapped in try/catch: safe to deploy before migration adds the column.
      if (account?.refresh_token) {
        try {
          const encKey = getEncryptionKey();
          await db().execute({
            sql: "UPDATE user_settings SET google_refresh_token = ? WHERE email = ?",
            args: [encrypt(account.refresh_token, encKey), user.email],
          });
        } catch {
          // Column may not exist yet if migration hasn't run
        }
      }

      return true;
    },
    // Credentials provider needs jwt/session email populated from token
    jwt({ token, user }) {
      // `user` is only set on initial sign-in; Auth.js callback types mark it required.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- user absent on subsequent jwt calls
      const email = user?.email;
      if (typeof email === "string" && email.length > 0) {
        token.email = email;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
});
```

- [ ] **Step 2: Re-run unit tests + typecheck auth surface**

Run:

```bash
npx vitest run lib/__tests__/qaAuth.test.ts
npx tsc --noEmit
```

Expected: both PASS (no new type errors from Credentials callbacks)

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "$(cat <<'EOF'
feat: add Auth.js QA Credentials provider

Issue a JWT session for QA_AUTH_EMAIL when the local token verifies,
reusing the normal multi-user email path.
EOF
)"
```

---

### Task 3: Login route + proxy allowlist

**Files:**
- Create: `app/api/qa/login/route.ts`
- Modify: `proxy.ts` (after the `/api/auth` pass-through block)

**Interfaces:**
- Consumes: `signIn` from `@/lib/auth`; `isLocalQaAllowed`, `verifyQaToken` from `@/lib/qaAuth`
- Produces: `GET /api/qa/login?token=&redirectTo=` → 404 / 401 / redirect into app

- [ ] **Step 1: Create the login route**

Create `app/api/qa/login/route.ts`:

```ts
import { signIn } from "@/lib/auth";
import { isLocalQaAllowed, verifyQaToken } from "@/lib/qaAuth";
import { NextResponse } from "next/server";

/**
 * Dev-only: exchange QA_AUTH_TOKEN for a normal Auth.js session.
 * GET /api/qa/login?token=...&redirectTo=/
 *
 * 404 when QA auth is not allowed (production / missing env).
 */
export async function GET(request: Request) {
  if (!isLocalQaAllowed()) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!verifyQaToken(token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const redirectTo = url.searchParams.get("redirectTo") ?? "/";
  // Safe relative redirects only
  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/";

  await signIn("qa", { token, redirectTo: safeRedirect });
}
```

- [ ] **Step 2: Allow `/api/qa/*` in proxy without a session**

In `proxy.ts`, immediately after the `/api/auth` pass-through block, add:

```ts
  // Dev-only QA login (returns 404 when disabled) — must not require a session
  if (nextUrl.pathname.startsWith("/api/qa/")) {
    return NextResponse.next();
  }
```

Full surrounding context should read:

```ts
  // Auth API must always pass through
  if (nextUrl.pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Dev-only QA login (returns 404 when disabled) — must not require a session
  if (nextUrl.pathname.startsWith("/api/qa/")) {
    return NextResponse.next();
  }

  // /demo must always pass through so the route handler can set the cookie
  if (nextUrl.pathname === "/demo") {
    return NextResponse.next();
  }
```

- [ ] **Step 3: Verify unit tests still pass**

Run: `npx vitest run lib/__tests__/qaAuth.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/qa/login/route.ts proxy.ts
git commit -m "$(cat <<'EOF'
feat: add /api/qa/login entry for agent sessions

Expose a gated login URL and let proxy pass /api/qa without an
existing session so agents can establish Auth.js cookies locally.
EOF
)"
```

---

### Task 4: Login URL script + worktree setup

**Files:**
- Create: `scripts/print-qa-login-url.sh` (executable)
- Modify: `package.json` (scripts only — add `qa:login-url`)
- Modify: `scripts/setup-worktree.sh`

**Interfaces:**
- Produces: `npm run -s qa:login-url -- /path` prints one absolute login URL to stdout
- Produces: `setup-worktree` stubs `QA_AUTH_TOKEN` / empty `QA_AUTH_EMAIL` when missing

- [ ] **Step 1: Add `scripts/print-qa-login-url.sh`**

Create the file, then `chmod +x scripts/print-qa-login-url.sh`:

```bash
#!/usr/bin/env bash
# Print the local QA login URL for agent-browser / manual use.
# Requires QA_AUTH_TOKEN and QA_AUTH_EMAIL in .env.local (dev only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from the main checkout first." >&2
  exit 1
fi

TOKEN="$(grep -E '^QA_AUTH_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
EMAIL="$(grep -E '^QA_AUTH_EMAIL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
BASE="${AUTH_URL:-${NEXTAUTH_URL:-http://localhost:3000}}"
AUTH_FROM_FILE="$(grep -E '^AUTH_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [[ -z "${AUTH_FROM_FILE:-}" ]]; then
  AUTH_FROM_FILE="$(grep -E '^NEXTAUTH_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
fi
if [[ -n "${AUTH_FROM_FILE:-}" ]]; then
  BASE="$AUTH_FROM_FILE"
fi

if [[ -z "${TOKEN:-}" || -z "${EMAIL:-}" ]]; then
  echo "Add QA_AUTH_TOKEN and QA_AUTH_EMAIL to .env.local (see docs/qa-agent-browser.md)." >&2
  exit 1
fi

REDIRECT="${1:-/}"
URL="$(python3 - <<PY
from urllib.parse import urlencode
base = "${BASE}".rstrip("/") + "/api/qa/login"
q = urlencode({"token": """${TOKEN}""", "redirectTo": """${REDIRECT}"""})
print(base + "?" + q)
PY
)"

echo "$URL"
```

- [ ] **Step 2: Add npm script (no dependency bumps)**

In `package.json` `scripts`, add only:

```json
"qa:login-url": "./scripts/print-qa-login-url.sh"
```

Keep existing dependency versions unchanged.

- [ ] **Step 3: Update `scripts/setup-worktree.sh`**

Replace the file with:

```bash
#!/bin/bash
# Setup script for new git worktrees — copies gitignored local files from the main checkout.

set -euo pipefail

WORKTREE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_REPO="$(cd "$WORKTREE_DIR" && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git$||')"
if [[ -z "$MAIN_REPO" || "$MAIN_REPO" == "$WORKTREE_DIR" ]]; then
  # Fallback: parent of .claude/worktrees/<name> or .Codex/worktrees/<name>
  MAIN_REPO="$(cd "$WORKTREE_DIR/../../.." && pwd)"
fi

echo "Setting up worktree: $WORKTREE_DIR"
echo "Source: $MAIN_REPO"

if [ ! -d "$WORKTREE_DIR/node_modules" ]; then
  echo "Installing node_modules..."
  cd "$WORKTREE_DIR" && npm install
else
  echo "node_modules already exists, skipping"
fi

if [ ! -f "$WORKTREE_DIR/.env.local" ]; then
  if [ -f "$MAIN_REPO/.env.local" ]; then
    echo "Copying .env.local..."
    cp "$MAIN_REPO/.env.local" "$WORKTREE_DIR/"
  else
    echo "Warning: .env.local not found in main repo"
  fi
else
  echo ".env.local already exists, skipping"
fi

if [ -f "$WORKTREE_DIR/.env.local" ] && ! grep -q '^QA_AUTH_TOKEN=' "$WORKTREE_DIR/.env.local" 2>/dev/null; then
  echo "" >> "$WORKTREE_DIR/.env.local"
  echo "# Local agent QA login (see docs/qa-agent-browser.md) — set QA_AUTH_EMAIL to the dedicated QA Google account" >> "$WORKTREE_DIR/.env.local"
  echo "QA_AUTH_TOKEN=$(openssl rand -hex 32)" >> "$WORKTREE_DIR/.env.local"
  echo "QA_AUTH_EMAIL=" >> "$WORKTREE_DIR/.env.local"
  echo "Added QA_AUTH_TOKEN placeholder — set QA_AUTH_EMAIL before using /api/qa/login"
fi

echo "Done!"
```

Keep executable bit: `chmod +x scripts/setup-worktree.sh`

- [ ] **Step 4: Smoke-check the script fails cleanly without email**

If `.env.local` lacks `QA_AUTH_EMAIL`, run:

```bash
npm run -s qa:login-url -- /
```

Expected: non-zero exit and stderr pointing at docs (do **not** paste stdout that contains a token into chat)

If both vars are set locally, the script should print one URL starting with `http://localhost` (or your `AUTH_URL`) and containing `/api/qa/login?` — verify privately; do not paste it into chat.

- [ ] **Step 5: Commit**

```bash
git add scripts/print-qa-login-url.sh scripts/setup-worktree.sh package.json
git commit -m "$(cat <<'EOF'
feat: add qa:login-url helper and worktree QA env stub

Let agents build the local login URL without inventing Google OAuth,
and seed QA_AUTH_* placeholders when setting up worktrees.
EOF
)"
```

---

### Task 5: Docs aligned with dedicated QA account

**Files:**
- Create: `docs/qa-agent-browser.md`

- [ ] **Step 1: Write the doc**

Create `docs/qa-agent-browser.md` with the content below (outer fence uses four backticks so nested fences stay intact):

````md
# Agent browser QA (local auth bypass)

Sustainable way for agents to use a **logged-in** Springa session without Google OAuth.

## Prerequisites (human, once)

1. Create a **dedicated** Google account for QA (not the owner’s prod email).
2. Sign in to Springa locally with that account and complete `/setup` with that user’s **own** Intervals.icu API key and Nightscout.
3. Confirm the app works as that user (planner loads, settings show the QA email).

Agents never run onboarding.

## Safety

- Works **only** when `NODE_ENV=development`
- **Hard-disabled** when `VERCEL_ENV=production` or `AUTH_URL` / `NEXTAUTH_URL` points at `springa.run`
- Missing `QA_AUTH_*` → `/api/qa/login` returns **404**
- Bad token → **401**
- `QA_AUTH_EMAIL` **must** be the dedicated QA Google account email — never the owner’s prod account
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
- `proxy.ts` — allows `/api/qa/*` without an existing session
- `scripts/print-qa-login-url.sh` — builds login URL
````

- [ ] **Step 2: Commit**

```bash
git add docs/qa-agent-browser.md
git commit -m "$(cat <<'EOF'
docs: document agent browser QA login for dedicated account

Describe the human onboarding prerequisite and the local agent
recipe without framing QA as prod-account impersonation.
EOF
)"
```

---

### Task 6: Verification

**Files:** none (run only)

- [ ] **Step 1: Run targeted + lint**

```bash
npx vitest run lib/__tests__/qaAuth.test.ts
npm run lint
```

Expected: PASS

- [ ] **Step 2: Manual local smoke (only if QA user already exists in Turso)**

Requires human-completed onboarding for `QA_AUTH_EMAIL` and both env vars set.

1. `npm run dev -- --port 3000` with `AUTH_URL=http://localhost:3000`
2. Build `LOGIN_URL` privately via `npm run -s qa:login-url -- /`
3. Open in browser → should land in the app as the QA user (settings/email match)
4. Hit `/api/qa/login` with a wrong token → 401
5. Temporarily unset `QA_AUTH_TOKEN` and restart → 404

Do **not** paste the login URL or token into chat. Skip this step if the QA Google account is not onboarded yet; unit tests + lint are enough to merge the code path.

- [ ] **Step 3: Confirm dirty tree has no unrelated files**

```bash
git status
git diff main...HEAD --stat
```

Expected: only the QA auth files from Tasks 1–5 (plus the design/plan docs if committed on this branch). No `paceInsight.test.ts`, no next/next-auth version bumps.

- [ ] **Step 4: Final commit only if Step 2/3 produced doc tweaks**

Otherwise no commit — verification only.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Dedicated QA email, not prod | Task 5 docs + Global Constraints |
| Human onboards outside agents | Task 5 prerequisites; Out of scope in spec |
| Credentials bypass / Auth.js session | Tasks 2–3 |
| Dev-only + Vercel/springa.run hard-disable | Task 1 |
| Missing env → 404, bad token → 401 | Tasks 1 + 3 |
| Relative redirects only | Task 3 |
| Never print token in chat | Tasks 4–5 + Global Constraints |
| `qa:login-url` / print script | Task 4 |
| Unit tests for allow/deny | Task 1 |
| No separate Turso / no Google automation | Out of scope; not in tasks |
| Drop unrelated prototype noise | Global Constraints + Task 6 |
