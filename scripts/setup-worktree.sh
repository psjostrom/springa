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

if ! grep -q '^QA_AUTH_TOKEN=' "$WORKTREE_DIR/.env.local" 2>/dev/null; then
  echo "" >> "$WORKTREE_DIR/.env.local"
  echo "# Local agent QA login (see docs/qa-agent-browser.md) — fill QA_AUTH_EMAIL" >> "$WORKTREE_DIR/.env.local"
  echo "QA_AUTH_TOKEN=$(openssl rand -hex 32)" >> "$WORKTREE_DIR/.env.local"
  echo "QA_AUTH_EMAIL=" >> "$WORKTREE_DIR/.env.local"
  echo "Added QA_AUTH_TOKEN placeholder — set QA_AUTH_EMAIL before using /api/qa/login"
fi

echo "Done!"
