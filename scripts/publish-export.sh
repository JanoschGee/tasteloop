#!/usr/bin/env bash
# Syncs the committed state of this repo into the public export (default ../tasteloop-public),
# without docs/internal and without history. The .git folder of the export stays.
# Then: blocklist and brand-name scan, npm run verify in the export, git status.
# Nothing is committed or pushed. That stays a manual step.
#
# Usage: scripts/publish-export.sh [--dry-run] [--skip-verify] [target-dir]
set -euo pipefail

DRY=0; VERIFY=1; TARGET=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --skip-verify) VERIFY=0 ;;
    -h|--help) sed -n 2,8p "$0"; exit 0 ;;
    -*) echo "Unknown option: $a" >&2; exit 2 ;;
    *) TARGET="$a" ;;
  esac
done

SRC="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
TARGET="${TARGET:-$(dirname "$SRC")/tasteloop-public}"
[ -d "$TARGET/.git" ] || { echo "Not a git repo: $TARGET" >&2; exit 1; }
[ "$(cd "$TARGET" && pwd)" != "$SRC" ] || { echo "Target is the source repo." >&2; exit 1; }

if [ -n "$(git -C "$SRC" status --porcelain)" ]; then
  echo "Note: the source has uncommitted changes. Only the last commit is exported."
fi
if [ "$DRY" = 0 ] && [ -n "$(git -C "$TARGET" status --porcelain)" ]; then
  echo "The export has uncommitted changes. Commit or discard them first:" >&2
  git -C "$TARGET" status --short >&2
  exit 1
fi

REV="$(git -C "$SRC" rev-parse --short HEAD)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git -C "$SRC" archive --format=tar HEAD | tar -x -C "$TMP"
rm -rf "$TMP/docs/internal"
[ ! -e "$TMP/docs/internal" ] || { echo "docs/internal still in the export." >&2; exit 1; }

RSYNC=(rsync -a --checksum --delete --exclude=/.git/ --exclude=node_modules/ --exclude=.next/ --exclude=/apps/landing/dist/ --exclude=.DS_Store)
if [ "$DRY" = 1 ]; then
  echo "Dry run: changes from $REV to $TARGET"
  "${RSYNC[@]}" -n -i "$TMP/" "$TARGET/" | grep -v '^\.d' || true
  # scan the staged copy (needs git ls-files, so a throwaway repo)
  git -C "$TMP" init -q
  (cd "$SRC" && npx --no-install tsx scripts/scan-export.ts "$TMP")
  exit 0
fi

LOCK_BEFORE="$(shasum "$TARGET/package-lock.json" 2>/dev/null || true)"
"${RSYNC[@]}" "$TMP/" "$TARGET/"
echo "Synced $REV to $TARGET"

(cd "$SRC" && npx --no-install tsx scripts/scan-export.ts "$TARGET")

if [ "$VERIFY" = 1 ]; then
  if [ ! -d "$TARGET/node_modules" ] || [ "$LOCK_BEFORE" != "$(shasum "$TARGET/package-lock.json")" ]; then
    (cd "$TARGET" && npm ci --no-audit --no-fund)
  fi
  (cd "$TARGET" && npm run verify)
fi

echo
git -C "$TARGET" status --short
echo
echo "Not committed, not pushed. Next, if approved:"
echo "  git -C \"$TARGET\" add -A && git -C \"$TARGET\" commit -m \"Update from $REV\""
echo "  git -C \"$TARGET\" push   # only when approved"
