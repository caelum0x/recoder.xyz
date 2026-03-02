#!/usr/bin/env bash
set -euo pipefail

# smoke-admin-push.sh
# Verifies admin push controls against /api/push/test.
#
# Usage:
#   ADMIN_SECRET=... bash scripts/smoke-admin-push.sh [BASE_URL]
#   bash scripts/smoke-admin-push.sh https://recoder.xyz

BASE_URL="${1:-${BASE_URL:-https://recoder.xyz}}"
ADMIN_SECRET="${ADMIN_SECRET:-}"

if [[ -z "${ADMIN_SECRET}" ]]; then
  echo "ERROR: ADMIN_SECRET is required (export ADMIN_SECRET=...)." >&2
  exit 2
fi

PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local method="${3:-GET}"
  local body="${4:-}"

  local tmp
  tmp="$(mktemp)"
  local code

  if [[ "${method}" == "GET" ]]; then
    code="$(curl -sS -o "${tmp}" -w "%{http_code}" \
      -H "x-admin-secret: ${ADMIN_SECRET}" \
      "${url}")"
  else
    code="$(curl -sS -o "${tmp}" -w "%{http_code}" \
      -X "${method}" \
      -H "x-admin-secret: ${ADMIN_SECRET}" \
      -H "content-type: application/json" \
      -d "${body}" \
      "${url}")"
  fi

  local resp
  resp="$(cat "${tmp}")"
  rm -f "${tmp}"

  if [[ "${code}" =~ ^2[0-9][0-9]$ ]] && [[ "${resp}" == *"\"success\":true"* ]]; then
    echo "PASS: ${name} (${code})"
    PASS=$((PASS + 1))
  else
    echo "FAIL: ${name} (${code})"
    echo "  Response: ${resp}" >&2
    FAIL=$((FAIL + 1))
  fi
}

echo "== Admin Push Smoke =="
echo "Base URL: ${BASE_URL}"
echo

check "Status endpoint" "${BASE_URL}/api/push/test" "GET"
check "Dry run direct" "${BASE_URL}/api/push/test" "POST" '{"dryRun":true,"transport":"direct","title":"smoke dry run","body":"smoke"}'
check "Direct send" "${BASE_URL}/api/push/test" "POST" '{"dryRun":false,"transport":"direct","title":"smoke direct send","body":"smoke","url":"/dashboard"}'

echo
echo "Summary: PASS=${PASS} FAIL=${FAIL}"

if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi

echo "== Admin push smoke passed =="
