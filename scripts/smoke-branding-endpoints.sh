#!/usr/bin/env bash
set -euo pipefail

echo "== Branding Endpoint Smoke =="

FAIL=0

check_image() {
  local label="$1"
  local url="$2"
  local status
  local ctype

  status="$(curl -sS -L -o /dev/null -w '%{http_code}' "$url" || echo "000")"
  ctype="$(curl -sS -L -D - -o /dev/null "$url" | awk -F': ' 'BEGIN{IGNORECASE=1} /^content-type:/{print $2}' | tail -n1 | tr -d '\r')"

  if [[ "$status" -ge 200 && "$status" -lt 400 ]] && [[ "$ctype" == image/* ]]; then
    echo "OK   ${label} -> HTTP ${status}, ${ctype}"
  else
    echo "FAIL ${label} -> HTTP ${status}, ${ctype:-unknown}" >&2
    FAIL=$((FAIL + 1))
  fi
}

# Internal service checks (stable during deploy)
check_image "app favicon" "http://localhost:3000/favicon.png"
check_image "app favicon.ico" "http://localhost:3000/favicon.ico"

check_image "web icon" "http://localhost:5173/icon.png"
check_image "web favicon" "http://localhost:5173/favicon.png"

check_image "studio favicon" "http://localhost:3005/favicon.png"
check_image "studio dark favicon" "http://localhost:3005/favicon-light.png"

if [[ "$FAIL" -gt 0 ]]; then
  echo "Branding smoke failed: ${FAIL} endpoint(s) unhealthy" >&2
  exit 1
fi

echo "== Branding endpoint smoke passed =="
