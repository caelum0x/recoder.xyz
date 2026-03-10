#!/usr/bin/env bash
set -euo pipefail

# End-to-end CLI device-flow verifier:
# - register + verify email via admin seed endpoint
# - sign in
# - request device code
# - approve user_code in browser-authorize endpoint (with session cookie)
# - exchange via /api/auth/cli/token
# - validate and refresh token
#
# Required env:
#   ADMIN_SECRET
# Optional env:
#   RECODER_BASE_URL (default https://recoder.xyz)

RECODER_BASE_URL="${RECODER_BASE_URL:-https://recoder.xyz}"
ADMIN_SECRET="${ADMIN_SECRET:-}"
CLIENT_ID="${CLIENT_ID:-recoder-code}"

if [[ -z "${ADMIN_SECRET}" ]]; then
  echo "ERROR: ADMIN_SECRET is required" >&2
  exit 2
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: Missing required command: $1" >&2
    exit 2
  fi
}

require_cmd curl
require_cmd jq

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1" >&2
  FAIL=$((FAIL + 1))
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
cookie_jar="${tmp_dir}/cookies.txt"

suffix="$(date +%s)"
email="phase14-cli-flow-${suffix}@example.com"
name="Phase14 CLI Flow ${suffix}"
password="CliFlow_${suffix}!Aa1"

post_json() {
  local url="$1"
  local payload="$2"
  local out="$3"
  curl -sS -o "${out}" -w "%{http_code}" \
    -H "content-type: application/json" \
    --data "${payload}" \
    "${url}" || true
}

post_json_with_cookies() {
  local url="$1"
  local payload="$2"
  local out="$3"
  curl -sS -o "${out}" -w "%{http_code}" \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    -H "content-type: application/json" \
    --data "${payload}" \
    "${url}" || true
}

echo "Running CLI device-flow E2E against ${RECODER_BASE_URL}"
echo "Test email: ${email}"

register_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/register" \
    "{\"name\":\"${name}\",\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${tmp_dir}/register.json"
)"
if [[ "${register_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/register.json")" == "true" ]]; then
  pass "register returned success"
else
  fail "register failed (code=${register_code})"
fi

seed_verify_code="$(
  curl -sS -o "${tmp_dir}/seed-verify.json" -w "%{http_code}" \
    -X POST "${RECODER_BASE_URL}/api/admin/pending-verifications" \
    -H "content-type: application/json" \
    -H "x-admin-secret: ${ADMIN_SECRET}" \
    --data "{\"email\":\"${email}\",\"mode\":\"email-code\"}" || true
)"
verify_code="$(jq -r '.value // empty' "${tmp_dir}/seed-verify.json")"
if [[ "${seed_verify_code}" == "200" && -n "${verify_code}" ]]; then
  pass "seeded verification code"
else
  fail "failed to seed verification code (code=${seed_verify_code})"
fi

verify_resp_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/verify-code" \
    "{\"email\":\"${email}\",\"code\":\"${verify_code}\"}" \
    "${tmp_dir}/verify-code.json"
)"
if [[ "${verify_resp_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/verify-code.json")" == "true" ]]; then
  pass "verify-code succeeded"
else
  fail "verify-code failed (code=${verify_resp_code})"
fi

signin_code="$(
  post_json_with_cookies \
    "${RECODER_BASE_URL}/api/auth/sign-in/email" \
    "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${tmp_dir}/signin.json"
)"
if [[ "${signin_code}" == "200" ]]; then
  pass "sign-in succeeded"
else
  fail "sign-in failed (code=${signin_code})"
fi

device_code_resp="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/cli/device" \
    "{\"client_id\":\"${CLIENT_ID}\"}" \
    "${tmp_dir}/device.json"
)"
device_code="$(jq -r '.device_code // empty' "${tmp_dir}/device.json")"
user_code="$(jq -r '.user_code // empty' "${tmp_dir}/device.json")"
if [[ "${device_code_resp}" == "200" && -n "${device_code}" && -n "${user_code}" ]]; then
  pass "device code issued"
else
  fail "device code request failed (code=${device_code_resp})"
fi

authorize_code="$(
  post_json_with_cookies \
    "${RECODER_BASE_URL}/api/auth/cli/authorize" \
    "{\"user_code\":\"${user_code}\",\"action\":\"approve\"}" \
    "${tmp_dir}/authorize.json"
)"
if [[ "${authorize_code}" == "200" ]] && [[ "$(jq -r '.success // true' "${tmp_dir}/authorize.json")" != "false" ]]; then
  pass "device code approved by signed-in user"
else
  fail "device approve failed (code=${authorize_code})"
fi

token_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/cli/token" \
    "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"${device_code}\",\"client_id\":\"${CLIENT_ID}\"}" \
    "${tmp_dir}/token.json"
)"
access_token="$(jq -r '.access_token // empty' "${tmp_dir}/token.json")"
refresh_token="$(jq -r '.refresh_token // empty' "${tmp_dir}/token.json")"
if [[ "${token_code}" == "200" && -n "${access_token}" && -n "${refresh_token}" ]]; then
  pass "token endpoint returned access+refresh token"
else
  fail "token exchange failed (code=${token_code})"
fi

verify_cli_token_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/cli/verify" \
    "{\"access_token\":\"${access_token}\"}" \
    "${tmp_dir}/verify-token.json"
)"
if [[ "${verify_cli_token_code}" == "200" ]] && [[ "$(jq -r '.valid // false' "${tmp_dir}/verify-token.json")" == "true" ]]; then
  pass "issued access token validates"
else
  fail "issued access token validation failed (code=${verify_cli_token_code})"
fi

refresh_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/cli/token" \
    "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"${refresh_token}\",\"client_id\":\"${CLIENT_ID}\"}" \
    "${tmp_dir}/refresh.json"
)"
new_access_token="$(jq -r '.access_token // empty' "${tmp_dir}/refresh.json")"
if [[ "${refresh_code}" == "200" && -n "${new_access_token}" ]]; then
  pass "refresh grant returned new access token"
else
  fail "refresh grant failed (code=${refresh_code})"
fi

echo "Summary: PASS=${PASS} FAIL=${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
