#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

ENV_SPECS=(
  "backend/.env:DATABASE_URL"
  "backend/.env:AUTH_DATABASE_URL"
  "app/.env.production:DATABASE_URL"
  "app/.env.production:AUTH_DATABASE_URL"
  "recoder-agents/.env.local:AUTH_DATABASE_URL"
)

FAILURES=0
CHECKED=0

extract_env_value() {
  local file="$1"
  local key="$2"
  awk -F= -v wanted="$key" '$1 == wanted { print substr($0, index($0, "=") + 1) }' "$file" | tail -n 1
}

normalize_value() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s' "$value"
}

echo "== Hetzner DB Env Drift Check =="
echo "repo: $REPO_ROOT"

for spec in "${ENV_SPECS[@]}"; do
  IFS=":" read -r rel_path env_key <<<"$spec"
  file="$REPO_ROOT/$rel_path"

  if [[ ! -f "$file" ]]; then
    echo "[WARN] missing $rel_path"
    continue
  fi

  raw_value="$(extract_env_value "$file" "$env_key" || true)"
  if [[ -z "$raw_value" ]]; then
    echo "[SKIP] $rel_path:$env_key unset"
    continue
  fi

  value="$(normalize_value "$raw_value")"
  if [[ "$value" != postgresql://recoder:*@127.0.0.1:5432/* && "$value" != postgres://recoder:*@127.0.0.1:5432/* ]]; then
    echo "[SKIP] $rel_path:$env_key not a local recoder DSN"
    continue
  fi

  CHECKED=$((CHECKED + 1))
  if output="$(PGCONNECT_TIMEOUT=5 psql "$value" -v ON_ERROR_STOP=1 -Atqc "select current_user || chr(58) || current_database()" 2>&1)"; then
    echo "[PASS] $rel_path:$env_key -> $output"
  else
    echo "[FAIL] $rel_path:$env_key"
    echo "$output"
    FAILURES=$((FAILURES + 1))
  fi
done

if [[ "$CHECKED" -eq 0 ]]; then
  echo "db-env-drift: FAIL (no local recoder DSNs were checked)"
  exit 1
fi

if [[ "$FAILURES" -eq 0 ]]; then
  echo "db-env-drift: PASS"
  exit 0
fi

echo "db-env-drift: FAIL ($FAILURES failing DSN check(s))"
exit 1
