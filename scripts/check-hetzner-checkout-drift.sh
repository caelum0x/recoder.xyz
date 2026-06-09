#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CLEANUP_SAFE=false
BACKUP_UNEXPECTED=false

for arg in "$@"; do
  case "$arg" in
    --cleanup-safe) CLEANUP_SAFE=true ;;
    --backup-unexpected) BACKUP_UNEXPECTED=true ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--cleanup-safe] [--backup-unexpected]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "checkout-drift: FAIL (not a git checkout: $REPO_ROOT)"
  exit 1
fi

safe_cleanup_path_if_untracked() {
  local rel="$1"
  if git -C "$REPO_ROOT" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
    return 0
  fi
  rm -rf "$REPO_ROOT/$rel"
}

cleanup_safe_generated_artifacts() {
  safe_cleanup_path_if_untracked "app/prisma/libquery_engine-debian-openssl-3.0.x.so.node"
  safe_cleanup_path_if_untracked "recoder-agents/prisma/auth-client"
  safe_cleanup_path_if_untracked "recoder-pm/apps/app/prisma/auth-client"
  safe_cleanup_path_if_untracked "backend/core/Users"
  safe_cleanup_path_if_untracked "recoder-agents/src/recoder-agents"
  safe_cleanup_path_if_untracked "deploy-all-services.sh"
  safe_cleanup_path_if_untracked "server.ts"

  if [[ -d "$REPO_ROOT/backend" ]]; then
    find "$REPO_ROOT/backend" -maxdepth 1 -type f -name '*fallback write: OK*' -delete 2>/dev/null || true
  fi
}

is_allowed_runtime_path() {
  case "$1" in
    data/*|backups/*|searxng|searxng/*|recoder-web/.claude/settings.local.json)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_retired_surface_path() {
  case "$1" in
    recoder-web|recoder-web/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_known_nested_repo_path() {
  case "$1" in
    recoder-web/starters)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_generated_cleanup_candidate() {
  case "$1" in
    app/prisma/libquery_engine-debian-openssl-3.0.x.so.node|\
    recoder-agents/prisma/auth-client/*|\
    recoder-pm/apps/app/prisma/auth-client/*|\
    backend/core/Users/*|\
    recoder-agents/src/recoder-agents/*|\
    deploy-all-services.sh|\
    server.ts)
      return 0
      ;;
    *)
      case "$1" in
        *fallback\ write:\ OK*)
          return 0
          ;;
        *)
          return 1
          ;;
      esac
      ;;
  esac
}

if [[ "$CLEANUP_SAFE" == true ]]; then
  cleanup_safe_generated_artifacts
fi

UNEXPECTED_NULL_LIST="$(mktemp)"
trap 'rm -f "$UNEXPECTED_NULL_LIST"' EXIT

runtime_count=0
nested_count=0
generated_count=0
retired_count=0
unexpected_count=0

runtime_items=""
nested_items=""
generated_items=""
retired_items=""
unexpected_items=""

while IFS= read -r -d '' entry; do
  [[ -n "$entry" ]] || continue
  status="${entry:0:2}"
  path="${entry:3}"
  line="${status} ${path}"

  if is_allowed_runtime_path "$path"; then
    runtime_count=$((runtime_count + 1))
    runtime_items="${runtime_items}${line}"$'\n'
    continue
  fi

  if is_known_nested_repo_path "$path"; then
    nested_count=$((nested_count + 1))
    nested_items="${nested_items}${line}"$'\n'
    continue
  fi

  if is_retired_surface_path "$path"; then
    retired_count=$((retired_count + 1))
    retired_items="${retired_items}${line}"$'\n'
    continue
  fi

  if is_generated_cleanup_candidate "$path"; then
    generated_count=$((generated_count + 1))
    generated_items="${generated_items}${line}"$'\n'
    continue
  fi

  unexpected_count=$((unexpected_count + 1))
  unexpected_items="${unexpected_items}${line}"$'\n'
  printf '%s\0' "$path" >>"$UNEXPECTED_NULL_LIST"
done < <(git -C "$REPO_ROOT" status --porcelain=v1 -z)

echo "== Hetzner Checkout Drift Audit =="
echo "repo: $REPO_ROOT"
echo "cleanup_safe: $CLEANUP_SAFE"

if [[ -n "$runtime_items" ]]; then
  echo
  echo "-- Allowed Runtime State ($runtime_count) --"
  printf '%s' "$runtime_items"
fi

if [[ -n "$nested_items" ]]; then
  echo
  echo "-- Known Nested Repo Drift ($nested_count) --"
  printf '%s' "$nested_items"
fi

if [[ -n "$generated_items" ]]; then
  echo
  echo "-- Generated Cleanup Candidates ($generated_count) --"
  printf '%s' "$generated_items"
fi

if [[ -n "$retired_items" ]]; then
  echo
  echo "-- Retired Surface Drift ($retired_count) --"
  printf '%s' "$retired_items"
fi

if [[ -n "$unexpected_items" ]]; then
  echo
  echo "-- Unexpected Source Drift ($unexpected_count) --"
  printf '%s' "$unexpected_items"
fi

if [[ "$BACKUP_UNEXPECTED" == true && "$unexpected_count" -gt 0 ]]; then
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_dir="$REPO_ROOT/backups/checkout-drift-$timestamp"
  archive_path="$backup_dir/unexpected-source-drift.tar.gz"
  manifest_path="$backup_dir/unexpected-source-drift.txt"
  mkdir -p "$backup_dir"
  printf '%s' "$unexpected_items" >"$manifest_path"
  tar --null -czf "$archive_path" -C "$REPO_ROOT" -T "$UNEXPECTED_NULL_LIST"
  echo
  echo "Unexpected drift backup written:"
  echo "  manifest: $manifest_path"
  echo "  archive:  $archive_path"
fi

if [[ "$unexpected_count" -gt 0 || "$generated_count" -gt 0 || "$retired_count" -gt 0 ]]; then
  echo
  echo "checkout-drift: FAIL (unexpected=${unexpected_count}, generated=${generated_count}, retired=${retired_count}, nested=${nested_count}, runtime=${runtime_count})"
  exit 1
fi

echo
echo "checkout-drift: PASS (unexpected=0, generated=0, retired=0, nested=${nested_count}, runtime=${runtime_count})"
