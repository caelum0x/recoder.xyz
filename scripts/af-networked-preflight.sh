#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PM_ENV_FILE="$REPO_ROOT/recoder-pm/.env.docker"
FAILURES=0

resolve_host() {
  local host="$1"
  if command -v dscacheutil >/dev/null 2>&1; then
    dscacheutil -q host -a name "$host" 2>/dev/null | awk '/ip_address:/{print $2; exit}'
    return
  fi
  if command -v getent >/dev/null 2>&1; then
    getent hosts "$host" 2>/dev/null | awk '{print $1; exit}'
    return
  fi
  if command -v nslookup >/dev/null 2>&1; then
    nslookup "$host" 2>/dev/null | awk '/^Address: /{print $2; exit}' | head -n 1
    return
  fi
  return
}

check_dns() {
  local host="$1"
  local ip
  ip="$(resolve_host "$host" || true)"
  if [[ -n "$ip" ]]; then
    echo "[PASS] DNS $host -> $ip"
    return 0
  fi
  echo "[FAIL] DNS $host unresolved"
  return 1
}

check_https() {
  local url="$1"
  local http_code
  if http_code="$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 8 "$url")"; then
    echo "[PASS] HTTPS $url -> $http_code"
    return 0
  fi
  echo "[FAIL] HTTPS $url unreachable"
  return 1
}

extract_neon_host() {
  local db_url
  db_url="$(grep -E '^DATABASE_URL=' "$PM_ENV_FILE" 2>/dev/null | head -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//')"
  if [[ -z "$db_url" ]]; then
    return
  fi
  printf '%s' "$db_url" | sed -E 's|^[a-zA-Z0-9+.-]+://[^@]+@([^:/?]+).*|\1|'
}

check_neon_tcp() {
  local host="$1"
  if ! command -v nc >/dev/null 2>&1; then
    echo "[WARN] nc not found; skipping TCP probe for $host:5432"
    return 0
  fi
  if nc -z -w 5 "$host" 5432 >/dev/null 2>&1; then
    echo "[PASS] TCP $host:5432 reachable"
    return 0
  fi
  echo "[FAIL] TCP $host:5432 unreachable"
  return 1
}

echo "== AF Networked Preflight =="
echo "repo: $REPO_ROOT"

check_dns "web.recoder.xyz" || ((FAILURES+=1))
check_dns "docker.recoder.xyz" || ((FAILURES+=1))
check_dns "api.github.com" || ((FAILURES+=1))

check_https "https://web.recoder.xyz/api/health/byok-readiness" || ((FAILURES+=1))
check_https "https://docker.recoder.xyz/health" || ((FAILURES+=1))

if gh auth status >/dev/null 2>&1; then
  echo "[PASS] gh auth status"
else
  echo "[FAIL] gh auth status"
  ((FAILURES+=1))
fi

NEON_HOST="$(extract_neon_host || true)"
if [[ -n "$NEON_HOST" ]]; then
  check_dns "$NEON_HOST" || ((FAILURES+=1))
  check_neon_tcp "$NEON_HOST" || ((FAILURES+=1))
else
  echo "[FAIL] Could not parse Neon host from $PM_ENV_FILE"
  ((FAILURES+=1))
fi

if [[ "$FAILURES" -eq 0 ]]; then
  echo "preflight: PASS"
  exit 0
fi

echo "preflight: FAIL ($FAILURES failed check(s))"
exit 1
