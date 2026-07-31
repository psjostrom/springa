#!/usr/bin/env bash
# Print the local QA login URL for agent-browser / manual use.
# Requires QA_AUTH_TOKEN and QA_AUTH_EMAIL in .env.local (dev only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from the main checkout first." >&2
  exit 1
fi

TOKEN="$(grep -E '^QA_AUTH_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
TOKEN="$(trim "$TOKEN")"
EMAIL="$(grep -E '^QA_AUTH_EMAIL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
EMAIL="$(trim "$EMAIL")"
# Process env overrides .env.local (so alternate ports work without editing the file).
AUTH_URL_TRIMMED="$(trim "${AUTH_URL:-}")"
NEXTAUTH_URL_TRIMMED="$(trim "${NEXTAUTH_URL:-}")"
if [[ -n "$AUTH_URL_TRIMMED" ]]; then
  BASE="$AUTH_URL_TRIMMED"
elif [[ -n "$NEXTAUTH_URL_TRIMMED" ]]; then
  BASE="$NEXTAUTH_URL_TRIMMED"
else
  BASE="http://localhost:3000"
  AUTH_FROM_FILE="$(grep -E '^AUTH_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  AUTH_FROM_FILE="$(trim "$AUTH_FROM_FILE")"
  if [[ -z "$AUTH_FROM_FILE" ]]; then
    AUTH_FROM_FILE="$(grep -E '^NEXTAUTH_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
    AUTH_FROM_FILE="$(trim "$AUTH_FROM_FILE")"
  fi
  if [[ -n "$AUTH_FROM_FILE" ]]; then
    BASE="$AUTH_FROM_FILE"
  fi
fi

HOST="$(
  QA_BASE="$BASE" python3 - <<'PY'
import os
from urllib.parse import urlparse
raw = os.environ["QA_BASE"]
try:
    host = (urlparse(raw).hostname or "").lower()
except Exception:
    raise SystemExit(2)
if not host:
    raise SystemExit(2)
print(host)
PY
)" || {
  echo "Invalid AUTH_URL/NEXTAUTH_URL (cannot parse host): $BASE" >&2
  exit 1
}

case "$HOST" in
  localhost|127.0.0.1|::1)
    ;;
  springa.run|*.springa.run)
    echo "Refusing to print QA login URL for host '$HOST' (springa.run blocked)." >&2
    exit 1
    ;;
  *)
    echo "Refusing to print QA login URL for host '$HOST' (local hosts only)." >&2
    exit 1
    ;;
esac

if [[ -z "${TOKEN:-}" || -z "${EMAIL:-}" ]]; then
  echo "Add QA_AUTH_TOKEN and QA_AUTH_EMAIL to .env.local (see docs/qa-agent-browser.md)." >&2
  exit 1
fi

REDIRECT="${1:-/}"
URL="$(QA_BASE="$BASE" QA_TOKEN="$TOKEN" QA_REDIRECT="$REDIRECT" python3 - <<'PY'
import os
from urllib.parse import urlencode
base = os.environ["QA_BASE"].rstrip("/") + "/api/qa/login"
q = urlencode({"token": os.environ["QA_TOKEN"], "redirectTo": os.environ["QA_REDIRECT"]})
print(base + "?" + q)
PY
)"

echo "$URL"
