#!/bin/bash
# Setup script for new Conductor worktrees
# Copies gitignored files from the main repo

MAIN_REPO="$HOME/code/springa"
WORKTREE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up worktree: $WORKTREE_DIR"
echo "Copying from: $MAIN_REPO"

# Copy node_modules (faster than npm install)
if [ -d "$MAIN_REPO/node_modules" ]; then
  echo "Copying node_modules..."
  cp -R "$MAIN_REPO/node_modules" "$WORKTREE_DIR/"
else
  echo "Warning: node_modules not found in main repo, running npm install..."
  cd "$WORKTREE_DIR" && npm install
fi

# Copy package-lock.json
if [ -f "$MAIN_REPO/package-lock.json" ]; then
  echo "Copying package-lock.json..."
  cp "$MAIN_REPO/package-lock.json" "$WORKTREE_DIR/"
fi

# Copy .env.local
if [ -f "$MAIN_REPO/.env.local" ]; then
  echo "Copying .env.local..."
  cp "$MAIN_REPO/.env.local" "$WORKTREE_DIR/"
else
  echo "Warning: .env.local not found in main repo"
fi

# Copy CLAUDE.md
if [ -f "$MAIN_REPO/CLAUDE.md" ]; then
  echo "Copying CLAUDE.md..."
  cp "$MAIN_REPO/CLAUDE.md" "$WORKTREE_DIR/"
else
  echo "Warning: CLAUDE.md not found in main repo"
fi

echo "Done!"
