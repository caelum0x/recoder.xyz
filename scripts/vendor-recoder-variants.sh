#!/usr/bin/env bash
# Vendor additional "Recoder variant" repos: shallow clone, strip .git, gitignore.
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG="$ROOT/scripts/vendor-variants.log"
: > "$LOG"

REPOS=(
  "pal-mcp-server|https://github.com/BeehiveInnovations/pal-mcp-server"
  "pi|https://github.com/earendil-works/pi"
  "openfang|https://github.com/RightNow-AI/openfang"
  "GitNexus|https://github.com/abhigyanpatwari/GitNexus"
  "ClawWork|https://github.com/HKUDS/ClawWork"
  "multica|https://github.com/multica-ai/multica"
)

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

for entry in "${REPOS[@]}"; do
  dir="${entry%%|*}"; repo="${entry##*|}"
  if [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    log "SKIP  $dir (already present)"
  else
    log "CLONE $dir <- $repo"
    if git clone --depth 1 --single-branch "$repo" "$dir" >>"$LOG" 2>&1; then
      rm -rf "$dir/.git"
      log "DONE  $dir (git stripped)"
    else
      log "FAIL  $dir (clone error)"
    fi
  fi
  if ! git check-ignore -q "$dir"; then
    echo "/$dir/" >> .gitignore
    log "IGNORE added /$dir/ to .gitignore"
  fi
done

log "ALL DONE"
