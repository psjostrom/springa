# Native mobile auth — remaining (API side)

Companion checklist: `springa-native/docs/superpowers/specs/2026-08-06-native-auth-remaining.md`

## This repo (`feature/native-mobile-auth`)

Merge/deploy so production (or the URL native points at) has:

- `POST /api/auth/mobile`
- Bearer JWTs in `requireAuth`
- `/api/*` proxy passthrough (no HTML `/login` redirect for API)

Then confirm web cookie Google login still works.

Native still needs Google Cloud Android SHA-1 registration and a live Google sign-in smoke against that API URL.
