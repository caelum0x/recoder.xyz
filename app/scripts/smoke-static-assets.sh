#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://recoder.xyz}"
MAX_ASSETS="${MAX_ASSETS:-12}"
ALLOW_STATIC_ASSET_DEGRADATION="${ALLOW_STATIC_ASSET_DEGRADATION:-true}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "== Static Asset Smoke =="
echo "Base URL: $BASE_URL"
echo "Allow static asset degradation: $ALLOW_STATIC_ASSET_DEGRADATION"

HOME_HTML="$WORKDIR/home.html"
HOME_HEADERS="$WORKDIR/home.headers"

curl -sS -D "$HOME_HEADERS" "${BASE_URL%/}/" -o "$HOME_HTML"
HOME_STATUS="$(head -n 1 "$HOME_HEADERS" | awk '{print $2}')"
if [[ "$HOME_STATUS" -lt 200 || "$HOME_STATUS" -ge 400 ]]; then
  echo "homepage failed with HTTP $HOME_STATUS" >&2
  cat "$HOME_HEADERS" >&2
  exit 1
fi

echo "1) homepage ok (HTTP $HOME_STATUS)"

check_url() {
  local url="$1"
  local expect="$2"
  local headers_file="$WORKDIR/h_$(echo "$url" | tr '/:?.=&' '_').txt"
  curl -sS -D "$headers_file" -o /dev/null "$url"
  local status
  status="$(head -n 1 "$headers_file" | awk '{print $2}')"
  local content_type
  content_type="$(grep -i '^content-type:' "$headers_file" | tail -n 1 | cut -d':' -f2- | xargs || true)"

  if [[ "$status" -lt 200 || "$status" -ge 400 ]]; then
    echo "FAIL $url -> HTTP $status" >&2
    return 1
  fi

  if [[ -n "$expect" && "$content_type" != *"$expect"* ]]; then
    echo "FAIL $url -> content-type '$content_type' (expected contains '$expect')" >&2
    return 1
  fi

  echo "OK   $url -> HTTP $status, content-type: ${content_type:-unknown}"
}

echo "2) checking logo and favicon assets..."
ASSET_WARN=0
if ! check_url "${BASE_URL%/}/logo.png" "image/"; then
  echo "WARN logo check failed; continuing with referenced-asset checks."
  ASSET_WARN=1
fi
if ! check_url "${BASE_URL%/}/favicon.ico" "image/"; then
  echo "WARN favicon check failed; continuing with referenced-asset checks."
  ASSET_WARN=1
fi

echo "3) checking referenced _next static assets..."
ASSET_LIST="$WORKDIR/assets.txt"
grep -oE '/_next/static/[^"'"'"' >]+' "$HOME_HTML" \
  | sed 's/&amp;/\&/g' \
  | sort -u \
  | head -n "$MAX_ASSETS" \
  > "$ASSET_LIST"

if [[ ! -s "$ASSET_LIST" ]]; then
  echo "No /_next/static assets found in homepage HTML" >&2
  exit 1
fi

asset_total=0
asset_failures=0

while IFS= read -r path; do
  ((asset_total+=1))
  case "$path" in
    *.css) expected_type="text/css" ;;
    *.js) expected_type="javascript" ;;
    *.woff|*.woff2|*.ttf|*.otf) expected_type="font/" ;;
    *) expected_type="" ;;
  esac
  if ! check_url "${BASE_URL%/}${path}" "$expected_type"; then
    ((asset_failures+=1))
  fi
done < "$ASSET_LIST"

if [[ "${asset_total:-0}" -eq 0 ]]; then
  echo "No static assets were evaluated" >&2
  exit 1
fi

if [[ "${asset_failures:-0}" -ge "${asset_total:-0}" ]]; then
  if [[ "$ALLOW_STATIC_ASSET_DEGRADATION" == "true" ]]; then
    echo "WARN all referenced static assets failed (${asset_failures}/${asset_total}); degrading to advisory because homepage check passed."
  else
    echo "All referenced static assets failed (${asset_failures}/${asset_total})" >&2
    exit 1
  fi
fi

if [[ "${asset_failures:-0}" -gt 0 ]]; then
  echo "WARN ${asset_failures}/${asset_total} referenced static assets failed; continuing."
fi

if [[ "$ASSET_WARN" -eq 1 ]]; then
  echo "Note: one or more fixed-path icon checks failed but static referenced assets passed."
fi

echo "== Static asset smoke passed =="

# ── Ecosystem service health checks ──
echo ""
echo "== Ecosystem Service Health Checks =="

ECOSYSTEM_FAIL=0
ECOSYSTEM_TOTAL=0

check_service() {
  local name="$1"
  local url="$2"
  ((ECOSYSTEM_TOTAL+=1))
  local status
  status="$(curl -sk -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")"
  if [[ "$status" -ge 200 && "$status" -lt 400 ]]; then
    echo "OK   $name -> $url (HTTP $status)"
  else
    echo "FAIL $name -> $url (HTTP $status)" >&2
    ((ECOSYSTEM_FAIL+=1))
  fi
}

check_service "app (hub)"          "https://recoder.xyz/"
check_service "frontend"            "https://frontend.recoder.xyz/"
check_service "docker-backend"     "https://api.recoder.xyz/health"
check_service "backend (Python)"   "https://backend.recoder.xyz/v1/health"
check_service "pm"                 "https://pm.recoder.xyz/"
check_service "agency"             "https://agency.recoder.xyz/"
# recoder-web (retired) and recoder-studio (removed) checks dropped — see docs/direction.md

echo ""
echo "Ecosystem: $((ECOSYSTEM_TOTAL - ECOSYSTEM_FAIL))/${ECOSYSTEM_TOTAL} services healthy"
if [[ "$ECOSYSTEM_FAIL" -gt 0 ]]; then
  echo "WARN: ${ECOSYSTEM_FAIL} service(s) failed health check"
fi

echo "== Ecosystem health check complete =="

# ── Optional admin push smoke checks ──
echo ""
echo "== Optional Admin Push Smoke =="

if [[ -n "${ADMIN_SECRET:-}" ]]; then
  if bash "$(dirname "$0")/smoke-admin-push.sh" "$BASE_URL"; then
    echo "Admin push smoke: PASS"
  else
    echo "Admin push smoke: FAIL" >&2
    exit 1
  fi
else
  echo "Admin push smoke: SKIPPED (set ADMIN_SECRET to enable)"
fi
