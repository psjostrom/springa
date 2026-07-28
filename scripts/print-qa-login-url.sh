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
