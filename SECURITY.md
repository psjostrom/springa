# Security Policy

## Sensitive Data

Springa processes continuous glucose monitor (CGM) readings, insulin-on-board estimates, and workout/training data for a Type 1 diabetic runner. This data is medical in nature.

## Architecture

- **Hosting:** Vercel (serverless, no persistent server)
- **Database:** Turso (libsql), encrypted at rest
- **Auth:** NextAuth with Google OAuth, restricted to a single-email allowlist
- **CGM ingestion:** `/api/v1/entries` endpoint authenticated with `CGM_SECRET` (shared secret with Strimma, the CGM companion app)
- **Scheduled tasks:** Vercel Cron Jobs authenticated with `CRON_SECRET`

## Credential Storage

- All secrets stored as Vercel environment variables (never committed to the repo)
- Local development uses `.env*.local` files, which are gitignored
- No secrets in client-side code or bundle

## Reporting a Vulnerability

This is a personal project, but it handles real medical data. If you find a security issue, please email the repository owner directly rather than opening a public issue.
