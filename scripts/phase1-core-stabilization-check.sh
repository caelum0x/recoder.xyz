#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUS_DIR="$ROOT_DIR/.artifacts"
STATUS_FILE="${PHASE1_STATUS_FILE:-$STATUS_DIR/phase1-core-stabilization-status.json}"

FAILURES=0
LAST_STEP_RC=0
STEP_LABELS=()
STEP_RESULTS=()
STEP_CODES=()
STEP_CLASSIFICATIONS=()

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

record_step() {
  STEP_LABELS+=("$1")
  STEP_RESULTS+=("$2")
  STEP_CODES+=("$3")
  STEP_CLASSIFICATIONS+=("$4")
}

write_status_report() {
  mkdir -p "$STATUS_DIR"
  local generated_at
  generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  {
    echo "{"
    echo "  \"taxonomyVersion\": \"phase1-runner-v1\","
    echo "  \"generatedAt\": \"$(json_escape "$generated_at")\","
    echo "  \"overall\": {"
    echo "    \"ok\": $([[ "$FAILURES" -eq 0 ]] && echo "true" || echo "false"),"
    echo "    \"failedSteps\": $FAILURES,"
    echo "    \"totalSteps\": ${#STEP_LABELS[@]}"
    echo "  },"
    echo "  \"steps\": ["
    local i
    for i in "${!STEP_LABELS[@]}"; do
      if [[ "$i" -gt 0 ]]; then
        echo "    ,"
      fi
      echo "    {"
      echo "      \"label\": \"$(json_escape "${STEP_LABELS[$i]}")\","
      echo "      \"result\": \"$(json_escape "${STEP_RESULTS[$i]}")\","
      echo "      \"exitCode\": ${STEP_CODES[$i]},"
      echo "      \"classification\": \"$(json_escape "${STEP_CLASSIFICATIONS[$i]}")\""
      echo "    }"
    done
    echo "  ]"
    echo "}"
  } >"$STATUS_FILE"
  echo "[phase1] status artifact: $STATUS_FILE"
}

run_step() {
  local label="$1"
  shift
  echo "[phase1] ${label}"
  "$@"
  local rc=$?
  LAST_STEP_RC="$rc"
  if [[ "$rc" -ne 0 ]]; then
    local classification="failure"
    if [[ "$rc" -eq 10 ]]; then
      classification="env_blocker"
      echo "[phase1] ENV BLOCKER (${label}): missing local toolchain/dependencies"
    fi
    echo "[phase1] FAILED: ${label}"
    record_step "$label" "failed" "$rc" "$classification"
    FAILURES=$((FAILURES + 1))
    return 1
  fi
  record_step "$label" "passed" "$rc" "ok"
  return 0
}

run_step "openclaw core checks" \
  pnpm -C "$ROOT_DIR/openclaw" exec vitest run \
  src/commands/status.contract.test.ts \
  src/commands/doctor.contract.test.ts \
  src/commands/sessions.contract.test.ts \
  src/commands/agents.workflow.contract.test.ts \
  src/commands/status.test.ts \
  src/commands/sessions.test.ts \
  src/commands/agents.workflow-health.test.ts \
  src/commands/agents.workflow.test.ts \
  src/commands/doctor-auth.auth-health.test.ts \
  src/commands/doctor-auth.deprecated-cli-profiles.test.ts \
  src/commands/doctor.warns-per-agent-sandbox-docker-browser-prune.test.ts

if ! run_step "app ci determinism (frozen)" pnpm -C "$ROOT_DIR/app" run ci:install-and-check; then
  echo "[phase1] SKIP local fallback: redundant for app (same deterministic gate)"
  record_step "app ci determinism (local fallback)" "skipped" "0" "skipped_redundant"
fi

if ! run_step "apps/frontend ci determinism (frozen)" pnpm -C "$ROOT_DIR/apps/frontend" run ci:install-and-check; then
  echo "[phase1] SKIP local fallback: redundant for apps/frontend (same deterministic gate)"
  record_step "apps/frontend ci determinism (local fallback)" "skipped" "0" "skipped_redundant"
fi

if ! run_step "apps/mobile ci determinism (frozen)" pnpm -C "$ROOT_DIR/apps/mobile" run ci:install-and-check; then
  echo "[phase1] SKIP local fallback: redundant for apps/mobile (same deterministic gate)"
  record_step "apps/mobile ci determinism (local fallback)" "skipped" "0" "skipped_redundant"
fi

run_step "studio deploy governance checks" \
  pnpm -C "$ROOT_DIR/apps/studio.giselles.ai" run ci:test:deploy-governance

if ! run_step "docker-backend ci determinism (frozen)" pnpm -C "$ROOT_DIR/docker-backend" run ci:install-and-check; then
  echo "[phase1] SKIP local fallback: redundant for docker-backend (same deterministic gate)"
  record_step "docker-backend ci determinism (local fallback)" "skipped" "0" "skipped_redundant"
fi

write_status_report

if [[ "$FAILURES" -gt 0 ]]; then
  echo "[phase1] completed with ${FAILURES} failed step(s)"
  exit 1
fi

echo "[phase1] completed"
