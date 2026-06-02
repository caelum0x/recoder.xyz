#!/usr/bin/env bash
# Vendor the GREEN-list repos: shallow clone, strip .git, gitignore.
# Idempotent: skips dirs that already exist with content.
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG="$ROOT/scripts/vendor-green.log"
: > "$LOG"

# dir|repo
REPOS=(
  "qwen-code|https://github.com/QwenLM/qwen-code"
  "gemini-cli|https://github.com/google-gemini/gemini-cli"
  "a2a-js|https://github.com/a2aproject/a2a-js"
  "A2A|https://github.com/a2aproject/A2A"
  "open-agents|https://github.com/vercel-labs/open-agents"
  "agent-browser|https://github.com/vercel-labs/agent-browser"
  "stagehand|https://github.com/browserbase/stagehand"
  "E2B|https://github.com/e2b-dev/E2B"
  "ziti|https://github.com/openziti/ziti"
  "beads|https://github.com/gastownhall/beads"
  "mem0|https://github.com/mem0ai/mem0"
  "context7|https://github.com/upstash/context7"
  "vllm|https://github.com/vllm-project/vllm"
  "ollama|https://github.com/ollama/ollama"
  "polar|https://github.com/polarsource/polar"
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
  # ensure gitignored
  if ! git check-ignore -q "$dir"; then
    echo "/$dir/" >> .gitignore
    log "IGNORE added /$dir/ to .gitignore"
  fi
done

log "ALL DONE"
