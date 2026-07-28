#!/usr/bin/env bash
# Temporarily overlay local QA-auth files onto the current checkout so agents can
# log in while testing another feature branch — without merging that PR.
#
# Usage:
#   ./scripts/qa-overlay.sh [git-ref]     # default: feature/agent-qa-auth
#   ./scripts/qa-overlay.sh --remove      # restore tracked files; drop untracked overlay files
#
# NEVER commit the result into a product feature PR. See docs/qa-agent-browser.md.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MARKER="$ROOT/.git/qa-overlay-active"
DEFAULT_REF="feature/agent-qa-auth"

TRACKED_FILES=(
  lib/qaAuth.ts
  lib/__tests__/qaAuth.test.ts
  lib/auth.ts
  app/api/qa/login/route.ts
  proxy.ts
  scripts/print-qa-login-url.sh
  docs/qa-agent-browser.md
)

ensure_qa_login_script() {
  node <<'NODE'
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
if (pkg.scripts?.["qa:login-url"] === "./scripts/print-qa-login-url.sh") {
  process.exit(0);
}
pkg.scripts = pkg.scripts || {};
pkg.scripts["qa:login-url"] = "./scripts/print-qa-login-url.sh";
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log("Patched package.json scripts.qa:login-url (do not commit with a product PR)");
NODE
}

remove_overlay() {
  if [[ ! -f "$MARKER" ]]; then
    echo "No active QA overlay marker at $MARKER — nothing to remove."
    echo "If files are still dirty, restore manually: git checkout -- <paths>"
    exit 0
  fi

  # shellcheck disable=SC1090
  # Marker is a simple KEY=value file we wrote.
  # shellcheck source=/dev/null
  source "$MARKER"

  echo "Removing QA overlay from ref: ${QA_OVERLAY_REF:-unknown}"

  local f
  for f in "${TRACKED_FILES[@]}"; do
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
      git checkout HEAD -- "$f"
    elif [[ -e "$f" ]]; then
      rm -f "$f"
      # remove empty parents for new routes
      rmdir "$(dirname "$f")" 2>/dev/null || true
      rmdir "$(dirname "$(dirname "$f")")" 2>/dev/null || true
    fi
  done

  if [[ -f package.json ]] && git ls-files --error-unmatch package.json >/dev/null 2>&1; then
    git checkout HEAD -- package.json
  fi

  chmod +x scripts/print-qa-login-url.sh 2>/dev/null || true
  rm -f "$MARKER"
  echo "Overlay removed. Confirm with: git status"
}

if [[ "${1:-}" == "--remove" ]]; then
  remove_overlay
  exit 0
fi

REF="${1:-$DEFAULT_REF}"

if ! git rev-parse --verify "$REF" >/dev/null 2>&1; then
  if git rev-parse --verify "origin/$REF" >/dev/null 2>&1; then
    REF="origin/$REF"
  else
    echo "Cannot resolve git ref '$1' (tried '$REF' and origin/). Merge QA auth to main or pass an explicit ref." >&2
    exit 1
  fi
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: working tree is already dirty. Overlay will overwrite the listed QA files." >&2
fi

echo "Overlaying QA auth from $REF onto $(pwd)"
echo "Do NOT commit these changes into a product feature PR."

git checkout "$REF" -- "${TRACKED_FILES[@]}"
chmod +x scripts/print-qa-login-url.sh
ensure_qa_login_script

{
  echo "QA_OVERLAY_REF=$REF"
  echo "QA_OVERLAY_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$MARKER"

echo "Done. Marker: $MARKER"
echo "Next: npm run setup-worktree (if needed), set QA_AUTH_EMAIL, AUTH_URL=http://localhost:3000 npm run dev -- --port 3000"
echo "When finished: ./scripts/qa-overlay.sh --remove"
