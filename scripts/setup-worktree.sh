#!/bin/bash
# Setup script for new Conductor worktrees
# Copies gitignored files from the main repo if they don't exist

MAIN_REPO="/Users/persjo/code/private/springa"
WORKTREE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting up worktree: $WORKTREE_DIR"
echo "Source: $MAIN_REPO"

# Install node_modules (symlinks break Turbopack)
if [ ! -d "$WORKTREE_DIR/node_modules" ]; then
  echo "Installing node_modules..."
  cd "$WORKTREE_DIR" && npm install --registry https://registry.npmjs.org
else
  echo "node_modules already exists, skipping"
fi

# Copy .env.local
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

# Copy CLAUDE.md
if [ ! -f "$WORKTREE_DIR/CLAUDE.md" ]; then
  if [ -f "$MAIN_REPO/CLAUDE.md" ]; then
    echo "Copying CLAUDE.md..."
    cp "$MAIN_REPO/CLAUDE.md" "$WORKTREE_DIR/"
  else
    echo "Warning: CLAUDE.md not found in main repo"
  fi
else
  echo "CLAUDE.md already exists, skipping"
fi

echo "Done!"
