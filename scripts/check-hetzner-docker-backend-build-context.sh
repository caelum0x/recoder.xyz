#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPARE_REF="${GIT_COMPARE_REF:-HEAD}"

echo "== Hetzner docker-backend Build Context Check =="
echo "repo: $REPO_ROOT"
echo "compare-ref: $COMPARE_REF"

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "docker-backend-build-context: FAIL (not a git checkout)"
  exit 1
fi

if ! git -C "$REPO_ROOT" rev-parse --verify "${COMPARE_REF}^{commit}" >/dev/null 2>&1; then
  echo "docker-backend-build-context: FAIL (compare ref not found: $COMPARE_REF)"
  exit 1
fi

TMP_INDEX="$(mktemp)"
cleanup() {
  rm -f "$TMP_INDEX"
}
trap cleanup EXIT

GIT_DIR="$REPO_ROOT/.git" GIT_WORK_TREE="$REPO_ROOT" GIT_INDEX_FILE="$TMP_INDEX" \
  git read-tree "$COMPARE_REF"
GIT_DIR="$REPO_ROOT/.git" GIT_WORK_TREE="$REPO_ROOT" GIT_INDEX_FILE="$TMP_INDEX" \
  git add -A -- docker-backend/

DIRTY_LINES="$(
  GIT_DIR="$REPO_ROOT/.git" GIT_WORK_TREE="$REPO_ROOT" GIT_INDEX_FILE="$TMP_INDEX" \
    git diff --cached --name-status "$COMPARE_REF" -- docker-backend/ \
      | grep -vE '^[A-Z][0-9]*[[:space:]]+docker-backend/\.env(\..*)?$' || true
)"

if [[ -z "$DIRTY_LINES" ]]; then
  echo "docker-backend-build-context: PASS"
  exit 0
fi

echo "Dirty docker-backend build-context entries detected:"
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  echo "  $line"
done <<<"$DIRTY_LINES"

DIRTY_COUNT="$(printf '%s\n' "$DIRTY_LINES" | sed '/^$/d' | wc -l | tr -d ' ')"
echo "docker-backend-build-context: FAIL (${DIRTY_COUNT} dirty entry/entries)"
exit 1
