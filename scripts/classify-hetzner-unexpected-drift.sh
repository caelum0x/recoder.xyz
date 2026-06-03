#!/usr/bin/env bash
set -euo pipefail

LOCAL_REPO_ROOT="${LOCAL_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SSH_HOST="${SSH_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
REMOTE_REPO_ROOT="${REMOTE_REPO_ROOT:-/root/recoder.xyz}"
MANIFEST_PATH=""
FETCH_REMOTE=false

usage() {
  cat <<'EOF'
Usage: classify-hetzner-unexpected-drift.sh [--manifest /path/to/unexpected-source-drift.txt]
                                            [--fetch-latest-remote]
                                            [--local-repo-root /path/to/repo]
                                            [--ssh-host user@host]
                                            [--ssh-key /path/to/key]
                                            [--remote-repo-root /path/to/remote/repo]

Classify a Hetzner unexpected-source-drift manifest against the current local repo.

Categories:
  - reset-to-branch candidates: tracked host modifications with no local overlap
  - host-only removals: host-untracked paths absent locally
  - branch-tracked additions: host-untracked paths that are now tracked locally
  - local-overlap/manual-review: host paths that collide with current local changes
  - retired-surface remnants: host paths under retired surfaces such as recoder-web
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      MANIFEST_PATH="${2:-}"
      shift 2
      ;;
    --fetch-latest-remote)
      FETCH_REMOTE=true
      shift
      ;;
    --local-repo-root)
      LOCAL_REPO_ROOT="${2:-}"
      shift 2
      ;;
    --ssh-host)
      SSH_HOST="${2:-}"
      shift 2
      ;;
    --ssh-key)
      SSH_KEY="${2:-}"
      shift 2
      ;;
    --remote-repo-root)
      REMOTE_REPO_ROOT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$LOCAL_REPO_ROOT/.git" ]]; then
  echo "classify-drift: FAIL (not a git checkout: $LOCAL_REPO_ROOT)" >&2
  exit 1
fi

if [[ -n "$MANIFEST_PATH" && "$FETCH_REMOTE" == true ]]; then
  echo "classify-drift: FAIL (--manifest and --fetch-latest-remote are mutually exclusive)" >&2
  exit 1
fi

TMP_MANIFEST=""
cleanup() {
  if [[ -n "$TMP_MANIFEST" && -f "$TMP_MANIFEST" ]]; then
    rm -f "$TMP_MANIFEST"
  fi
}
trap cleanup EXIT

if [[ "$FETCH_REMOTE" == true ]]; then
  if ! command -v ssh >/dev/null 2>&1; then
    echo "classify-drift: FAIL (ssh not installed)" >&2
    exit 1
  fi

  ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10)
  if [[ -f "$SSH_KEY" ]]; then
    ssh_opts+=(-i "$SSH_KEY")
  fi

  remote_manifest="$(
    ssh "${ssh_opts[@]}" "$SSH_HOST" \
      "ls -1t '$REMOTE_REPO_ROOT'/backups/checkout-drift-*/unexpected-source-drift.txt 2>/dev/null | head -n 1"
  )"

  if [[ -z "$remote_manifest" ]]; then
    echo "classify-drift: FAIL (no remote unexpected-source-drift manifest found under $REMOTE_REPO_ROOT/backups)" >&2
    exit 1
  fi

  TMP_MANIFEST="$(mktemp)"
  ssh "${ssh_opts[@]}" "$SSH_HOST" "cat '$remote_manifest'" >"$TMP_MANIFEST"
  MANIFEST_PATH="$TMP_MANIFEST"
fi

if [[ -z "$MANIFEST_PATH" ]]; then
  echo "classify-drift: FAIL (provide --manifest or --fetch-latest-remote)" >&2
  exit 1
fi

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "classify-drift: FAIL (manifest not found: $MANIFEST_PATH)" >&2
  exit 1
fi

local_status_for_path() {
  local rel="$1"
  git -C "$LOCAL_REPO_ROOT" status --porcelain=v1 -- "$rel" | sed -n '1p'
}

has_tracked_content() {
  local rel="$1"
  [[ -n "$(git -C "$LOCAL_REPO_ROOT" ls-files -- "$rel")" ]]
}

exists_locally() {
  local rel="$1"
  [[ -e "$LOCAL_REPO_ROOT/$rel" ]]
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

reset_count=0
reset_items=""
host_only_count=0
host_only_items=""
branch_tracked_count=0
branch_tracked_items=""
overlap_count=0
overlap_items=""
retired_count=0
retired_items=""

while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  host_status="${line:0:2}"
  rel_path="${line:3}"
  local_status="$(local_status_for_path "$rel_path")"
  tracked_locally=false
  exists_in_worktree=false

  if is_retired_surface_path "$rel_path"; then
    retired_count=$((retired_count + 1))
    retired_items+="${line} | local=$(if [[ -n "$local_status" ]]; then printf '%s' "$local_status"; elif [[ -e "$LOCAL_REPO_ROOT/$rel_path" ]]; then printf 'exists'; else printf 'absent'; fi)"$'\n'
    continue
  fi

  if has_tracked_content "$rel_path"; then
    tracked_locally=true
  fi

  if exists_locally "$rel_path"; then
    exists_in_worktree=true
  fi

  if [[ "$host_status" == "??" ]]; then
    if [[ "$tracked_locally" == true ]]; then
      branch_tracked_count=$((branch_tracked_count + 1))
      branch_tracked_items+="${line} | local=$(if [[ -n "$local_status" ]]; then printf '%s' "$local_status"; else printf 'tracked-clean'; fi)"$'\n'
    elif [[ -n "$local_status" || "$exists_in_worktree" == true ]]; then
      overlap_count=$((overlap_count + 1))
      overlap_items+="${line} | local=$(if [[ -n "$local_status" ]]; then printf '%s' "$local_status"; else printf 'exists-untracked'; fi)"$'\n'
    else
      host_only_count=$((host_only_count + 1))
      host_only_items+="${line}"$'\n'
    fi
    continue
  fi

  if [[ "$tracked_locally" != true ]]; then
    retired_count=$((retired_count + 1))
    retired_items+="${line}"$'\n'
  elif [[ -n "$local_status" ]]; then
    overlap_count=$((overlap_count + 1))
    overlap_items+="${line} | local=${local_status}"$'\n'
  else
    reset_count=$((reset_count + 1))
    reset_items+="${line}"$'\n'
  fi
done <"$MANIFEST_PATH"

total_count=$((reset_count + host_only_count + branch_tracked_count + overlap_count + retired_count))

echo "== Hetzner Unexpected Drift Classification =="
echo "local_repo: $LOCAL_REPO_ROOT"
echo "manifest: $MANIFEST_PATH"
echo "total: $total_count"

if [[ -n "$reset_items" ]]; then
  echo
  echo "-- Reset To Branch Candidates ($reset_count) --"
  printf '%s' "$reset_items"
fi

if [[ -n "$host_only_items" ]]; then
  echo
  echo "-- Host-Only Removal Candidates ($host_only_count) --"
  printf '%s' "$host_only_items"
fi

if [[ -n "$branch_tracked_items" ]]; then
  echo
  echo "-- Host-Untracked But Branch-Tracked ($branch_tracked_count) --"
  printf '%s' "$branch_tracked_items"
fi

if [[ -n "$overlap_items" ]]; then
  echo
  echo "-- Manual Review: Overlaps Current Local Work ($overlap_count) --"
  printf '%s' "$overlap_items"
fi

if [[ -n "$retired_items" ]]; then
  echo
  echo "-- Retired Surface / No-Longer-Tracked Remnants ($retired_count) --"
  printf '%s' "$retired_items"
fi

echo
echo "Suggested actions:"
echo "- reset-to-branch: safe to restore from git after backup"
echo "- host-only removals: safe to remove from host after backup"
echo "- host-untracked but branch-tracked: prefer pull/redeploy, do not delete manually"
echo "- retired-surface remnants: remove from host once the retired surface is no longer intentionally tracked"
echo "- manual-review buckets: reconcile against active local work before touching host"
