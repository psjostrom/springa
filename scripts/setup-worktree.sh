#!/bin/bash
# Setup script for new git worktrees — copies gitignored local files from the main checkout.

set -euo pipefail

WORKTREE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_REPO="$(cd "$WORKTREE_DIR" && git rev-parse --path-format=absolute --git-common-dir 2>/dev/null | sed 's|/\.git$||')" || true
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

ENV_FILE="$WORKTREE_DIR/.env.local"

ensure_env_key() {
  local key="$1"
  local value="$2"
  local comment="$3"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  {
    echo ""
    echo "$comment"
    echo "${key}=${value}"
  } >> "$ENV_FILE"
  echo "Added ${key} to .env.local"
}

if [ -f "$ENV_FILE" ]; then
  ensure_env_key "AUTH_URL" "http://localhost:3000" \
    "# Dev Auth.js URL — must match the port you pass to next (see docs/qa-agent-browser.md)"
  if ! grep -q '^QA_AUTH_TOKEN=' "$ENV_FILE" 2>/dev/null; then
    ensure_env_key "QA_AUTH_TOKEN" "$(openssl rand -hex 32)" \
      "# Local agent QA login (see docs/qa-agent-browser.md) — set QA_AUTH_EMAIL to the dedicated QA Google account"
    ensure_env_key "QA_AUTH_EMAIL" "" \
      "# Dedicated QA Google account email (never the owner prod email)"
  elif ! grep -q '^QA_AUTH_EMAIL=' "$ENV_FILE" 2>/dev/null; then
    ensure_env_key "QA_AUTH_EMAIL" "" \
      "# Dedicated QA Google account email (never the owner prod email)"
  fi
fi

if [[ -f "$WORKTREE_DIR/scripts/print-qa-login-url.sh" ]]; then
  chmod +x "$WORKTREE_DIR/scripts/print-qa-login-url.sh"
fi

echo "Done!"
echo "Before agent QA: set QA_AUTH_EMAIL in .env.local, then AUTH_URL=http://localhost:3000 npm run dev -- --port 3000"
