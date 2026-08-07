# Native mobile auth (API)

Date: 2026-08-06  
Status: approved for planning  
Repo: `springa` (API half)  
Companion client: `springa-native` — full design in  
`springa-native/docs/superpowers/specs/2026-08-06-native-auth-design.md`

## Goal

Accept Google sign-in from the native app and authenticate `/api/*` with a Bearer JWT, without changing web cookie/NextAuth login.

## API

### `POST /api/auth/mobile`

- Public (no cookie session)
- Body: `{ idToken: string }`
- Verify Google ID token (`aud` = `GOOGLE_CLIENT_ID`, email verified)
- `ensureUserSettings(email)` (same as NextAuth sign-in)
- Return Springa-signed JWT: `{ token, expiresAt, user: { email } }`
- Claims: `email`, `iat`, `exp` (~30d), `aud: "springa-native"`

### `requireAuth()`

Cookie `auth()` first; else `Authorization: Bearer` → verify JWT → email.

### `proxy.ts`

Pass through `/api/auth/mobile` like `/api/auth/*`. Do not HTML-redirect Bearer API clients to `/login`.

## Out of scope

- Changing web Google OAuth (Calendar scope / refresh token)
- Native client implementation (see companion design)
- Refresh-token rotation

## Verification

Unit/integration tests for mobile exchange + Bearer `requireAuth`, following existing auth-boundary / MSW patterns.
