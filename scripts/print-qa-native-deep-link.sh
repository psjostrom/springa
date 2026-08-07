#!/usr/bin/env bash
# Print a native deep link that exchanges QA_AUTH_TOKEN for a mobile session.
# Requires QA_AUTH_TOKEN and QA_AUTH_EMAIL in Springa .env.local (dev only).
# Never commit the token; do not paste this URL into chat.
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

if [[ -z "${TOKEN:-}" || -z "${EMAIL:-}" ]]; then
  echo "Add QA_AUTH_TOKEN and QA_AUTH_EMAIL to .env.local (see docs/qa-agent-browser.md)." >&2
  exit 1
fi

URL="$(QA_TOKEN="$TOKEN" python3 - <<'PY'
import os
from urllib.parse import urlencode
q = urlencode({"token": os.environ["QA_TOKEN"]})
print("springa://qa-login?" + q)
PY
)"

echo "$URL"
