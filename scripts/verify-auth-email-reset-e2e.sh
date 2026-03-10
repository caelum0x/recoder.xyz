#!/usr/bin/env bash
set -euo pipefail

# End-to-end auth verifier (code-side deterministic):
# - register user
# - seed email verification code via admin endpoint, verify code
# - sign in with original password
# - request forgot-password
# - seed reset token via admin endpoint, validate + apply reset
# - verify old password fails and new password succeeds
#
# Required env:
#   ADMIN_SECRET
# Optional env:
#   RECODER_BASE_URL (default https://recoder.xyz)

RECODER_BASE_URL="${RECODER_BASE_URL:-https://recoder.xyz}"
ADMIN_SECRET="${ADMIN_SECRET:-}"

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
email="phase14-e2e-${suffix}@example.com"
name="Phase14 E2E ${suffix}"
old_password="E2E_old_${suffix}!Aa1"
new_password="E2E_new_${suffix}!Bb2"

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
  local code
  code="$(
    curl -sS -o "${out}" -w "%{http_code}" \
      -c "${cookie_jar}" \
      -b "${cookie_jar}" \
      -H "content-type: application/json" \
      --data "${payload}" \
      "${url}" || true
  )"
  echo "${code}"
}

echo "Running auth E2E against ${RECODER_BASE_URL}"
echo "Test email: ${email}"

register_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/register" \
    "{\"name\":\"${name}\",\"email\":\"${email}\",\"password\":\"${old_password}\"}" \
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

verify_code_resp="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/verify-code" \
    "{\"email\":\"${email}\",\"code\":\"${verify_code}\"}" \
    "${tmp_dir}/verify-code.json"
)"
if [[ "${verify_code_resp}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/verify-code.json")" == "true" ]]; then
  pass "verify-code succeeded"
else
  fail "verify-code failed (code=${verify_code_resp})"
fi

signin_old_code="$(
  post_json_with_cookies \
    "${RECODER_BASE_URL}/api/auth/sign-in/email" \
    "{\"email\":\"${email}\",\"password\":\"${old_password}\"}" \
    "${tmp_dir}/signin-old.json"
)"
if [[ "${signin_old_code}" == "200" ]]; then
  pass "sign-in with original password succeeded"
else
  fail "sign-in with original password failed (code=${signin_old_code})"
fi

forgot_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/forgot-password" \
    "{\"email\":\"${email}\"}" \
    "${tmp_dir}/forgot.json"
)"
if [[ "${forgot_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/forgot.json")" == "true" ]]; then
  pass "forgot-password returned safe success"
else
  fail "forgot-password failed (code=${forgot_code})"
fi

seed_reset_code="$(
  curl -sS -o "${tmp_dir}/seed-reset.json" -w "%{http_code}" \
    -X POST "${RECODER_BASE_URL}/api/admin/pending-verifications" \
    -H "content-type: application/json" \
    -H "x-admin-secret: ${ADMIN_SECRET}" \
    --data "{\"email\":\"${email}\",\"mode\":\"password-reset\"}" || true
)"
reset_token="$(jq -r '.value // empty' "${tmp_dir}/seed-reset.json")"
if [[ "${seed_reset_code}" == "200" && -n "${reset_token}" ]]; then
  pass "seeded password reset token"
else
  fail "failed to seed password reset token (code=${seed_reset_code})"
fi

reset_validate_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/reset-password" \
    "{\"token\":\"${reset_token}\",\"validate\":true}" \
    "${tmp_dir}/reset-validate.json"
)"
if [[ "${reset_validate_code}" == "200" ]] && [[ "$(jq -r '.valid // false' "${tmp_dir}/reset-validate.json")" == "true" ]]; then
  pass "reset token validation succeeded"
else
  fail "reset token validation failed (code=${reset_validate_code})"
fi

reset_apply_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/reset-password" \
    "{\"token\":\"${reset_token}\",\"password\":\"${new_password}\"}" \
    "${tmp_dir}/reset-apply.json"
)"
if [[ "${reset_apply_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/reset-apply.json")" == "true" ]]; then
  pass "password reset apply succeeded"
else
  fail "password reset apply failed (code=${reset_apply_code})"
fi

signin_old_after_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/sign-in/email" \
    "{\"email\":\"${email}\",\"password\":\"${old_password}\"}" \
    "${tmp_dir}/signin-old-after.json"
)"
if [[ "${signin_old_after_code}" != "200" ]]; then
  pass "old password no longer works after reset"
else
  fail "old password still works after reset"
fi

signin_new_code="$(
  post_json \
    "${RECODER_BASE_URL}/api/auth/sign-in/email" \
    "{\"email\":\"${email}\",\"password\":\"${new_password}\"}" \
    "${tmp_dir}/signin-new.json"
)"
if [[ "${signin_new_code}" == "200" ]]; then
  pass "new password works after reset"
else
  fail "new password sign-in failed (code=${signin_new_code})"
fi

echo "Summary: PASS=${PASS} FAIL=${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
