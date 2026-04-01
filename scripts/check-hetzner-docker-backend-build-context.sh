#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FAILURES=0

echo "== Hetzner docker-backend Build Context Check =="
echo "repo: $REPO_ROOT"

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "docker-backend-build-context: FAIL (not a git checkout)"
  exit 1
fi

DIRTY_LINES="$(
  git -C "$REPO_ROOT" status --porcelain=v1 --untracked-files=all -- docker-backend/ \
    | grep -vE '^[ ?MADRCU]{2} docker-backend/\.env(\..*)?$' || true
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
