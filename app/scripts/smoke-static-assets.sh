#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://recoder.xyz}"
MAX_ASSETS="${MAX_ASSETS:-12}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

echo "== Static Asset Smoke =="
echo "Base URL: $BASE_URL"

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
check_url "${BASE_URL%/}/logo.png" "image/"
check_url "${BASE_URL%/}/favicon.ico" "image/"

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

while IFS= read -r path; do
  case "$path" in
    *.css) expected_type="text/css" ;;
    *.js) expected_type="javascript" ;;
    *.woff|*.woff2|*.ttf|*.otf) expected_type="font/" ;;
    *) expected_type="" ;;
  esac
  check_url "${BASE_URL%/}${path}" "$expected_type"
done < "$ASSET_LIST"

echo "== Static asset smoke passed =="
