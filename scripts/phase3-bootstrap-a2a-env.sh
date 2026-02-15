#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_FILE="$REPO_ROOT/.env.a2a.workers.example"
TARGET_FILE="${A2A_WORKER_ENV_FILE:-$REPO_ROOT/.env.a2a.workers}"
WRITE_MODE="${WRITE_MODE:-true}"
FORCE_ROTATE="${FORCE_ROTATE:-false}"

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    true|false) echo "$(echo "$1" | tr '[:upper:]' '[:lower:]')" ;;
    *) echo "invalid" ;;
  esac
}

WRITE_MODE="$(normalize_bool "$WRITE_MODE")"
FORCE_ROTATE="$(normalize_bool "$FORCE_ROTATE")"
if [[ "$WRITE_MODE" == "invalid" || "$FORCE_ROTATE" == "invalid" ]]; then
  echo "Invalid WRITE_MODE/FORCE_ROTATE (expected true|false)." >&2
  exit 1
fi

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "Missing example file: $EXAMPLE_FILE" >&2
  exit 1
fi

read_env_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 1
  local line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#export }"
  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

upsert_key() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -Eq "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ "^[[:space:]]*(export[[:space:]]+)?" k "=" && done==0 { print k "=" v; done=1; next }
      { print }
      END { if (done==0) print k "=" v }
    ' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
  else
    {
      cat "$file"
      echo "${key}=${value}"
    } > "$file.tmp"
    mv "$file.tmp" "$file"
  fi
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    # fallback with timestamp entropy if openssl unavailable
    printf '%s' "$(date +%s%N 2>/dev/null || date +%s)-recoder-a2a-$(whoami)-$$" | shasum -a 256 | awk '{print $1}'
  fi
}

ensure_target() {
  if [[ -f "$TARGET_FILE" ]]; then
    return
  fi
  if [[ "$WRITE_MODE" == "true" ]]; then
    cp "$EXAMPLE_FILE" "$TARGET_FILE"
    chmod 600 "$TARGET_FILE" || true
    echo "created: $TARGET_FILE"
  else
    echo "would create: $TARGET_FILE"
  fi
}

is_placeholder() {
  local v="$1"
  [[ -z "$v" || "$v" =~ replace_with|changeme|example|todo|xxx ]]
}

echo "== Phase 3 A2A Env Bootstrap =="
echo "target: $TARGET_FILE"
echo "mode: $([[ "$WRITE_MODE" == "true" ]] && echo write || echo dry-run)"

ensure_target

existing_secret="$(read_env_value "$TARGET_FILE" "RECODER_A2A_SHARED_SECRET" || true)"
should_rotate="false"
if [[ "$FORCE_ROTATE" == "true" ]]; then
  should_rotate="true"
elif is_placeholder "$existing_secret"; then
  should_rotate="true"
fi

if [[ "$should_rotate" == "true" ]]; then
  new_secret="$(generate_secret)"
  if [[ "$WRITE_MODE" == "true" ]]; then
    upsert_key "$TARGET_FILE" "RECODER_A2A_SHARED_SECRET" "$new_secret"
    echo "set: RECODER_A2A_SHARED_SECRET (generated)"
  else
    echo "would set: RECODER_A2A_SHARED_SECRET=<generated>"
  fi
else
  echo "keep: RECODER_A2A_SHARED_SECRET (already non-placeholder)"
fi

resolved_secret="$(read_env_value "$TARGET_FILE" "RECODER_A2A_SHARED_SECRET" || true)"
if is_placeholder "$resolved_secret"; then
  echo "warning: RECODER_A2A_SHARED_SECRET still placeholder/missing" >&2
else
  echo "ok: RECODER_A2A_SHARED_SECRET is configured"
fi

echo ""
echo "Next steps:"
echo "1) export RECODER_A2A_SHARED_SECRET=\"$resolved_secret\""
echo "2) pnpm run a2a:smoke:codex-claude"
echo "3) pnpm run phase3:preflight"
