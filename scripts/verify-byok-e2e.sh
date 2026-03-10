#!/usr/bin/env bash
set -euo pipefail

# End-to-end BYOK verifier (deterministic, mailbox-free):
# - register + verify email code via admin seed endpoint
# - sign in and manage AI provider keys (create/list/decrypt/delete)
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
email="phase14-byok-${suffix}@example.com"
name="Phase14 BYOK ${suffix}"
password="Byok_${suffix}!Aa1"
openrouter_key="sk-or-v1-byok${suffix}abcdefghijklmnopqrstuvwxyz"

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

get_with_cookies() {
  local url="$1"
  local out="$2"
  curl -sS -o "${out}" -w "%{http_code}" \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    "${url}" || true
}

delete_with_cookies() {
  local url="$1"
  local out="$2"
  curl -sS -o "${out}" -w "%{http_code}" \
    -X DELETE \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    "${url}" || true
}

echo "Running BYOK E2E against ${RECODER_BASE_URL}"
echo "Test email: ${email}"

register_code="$({
  post_json \
    "${RECODER_BASE_URL}/api/auth/register" \
    "{\"name\":\"${name}\",\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${tmp_dir}/register.json"
})"
if [[ "${register_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/register.json")" == "true" ]]; then
  pass "register returned success"
else
  fail "register failed (code=${register_code})"
fi

seed_verify_code="$({
  curl -sS -o "${tmp_dir}/seed-verify.json" -w "%{http_code}" \
    -X POST "${RECODER_BASE_URL}/api/admin/pending-verifications" \
    -H "content-type: application/json" \
    -H "x-admin-secret: ${ADMIN_SECRET}" \
    --data "{\"email\":\"${email}\",\"mode\":\"email-code\"}" || true
})"
verify_code="$(jq -r '.value // empty' "${tmp_dir}/seed-verify.json")"
if [[ "${seed_verify_code}" == "200" && -n "${verify_code}" ]]; then
  pass "seeded verification code"
else
  fail "failed to seed verification code (code=${seed_verify_code})"
fi

verify_resp_code="$({
  post_json \
    "${RECODER_BASE_URL}/api/auth/verify-code" \
    "{\"email\":\"${email}\",\"code\":\"${verify_code}\"}" \
    "${tmp_dir}/verify-code.json"
})"
if [[ "${verify_resp_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/verify-code.json")" == "true" ]]; then
  pass "verify-code succeeded"
else
  fail "verify-code failed (code=${verify_resp_code})"
fi

signin_code="$({
  post_json_with_cookies \
    "${RECODER_BASE_URL}/api/auth/sign-in/email" \
    "{\"email\":\"${email}\",\"password\":\"${password}\"}" \
    "${tmp_dir}/signin.json"
})"
if [[ "${signin_code}" == "200" ]]; then
  pass "sign-in succeeded"
else
  fail "sign-in failed (code=${signin_code})"
fi

list_before_code="$({
  get_with_cookies "${RECODER_BASE_URL}/api/user/ai-provider-keys" "${tmp_dir}/list-before.json"
})"
if [[ "${list_before_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/list-before.json")" == "true" ]]; then
  pass "initial key list fetched"
else
  fail "initial key list failed (code=${list_before_code})"
fi

create_key_code="$({
  post_json_with_cookies \
    "${RECODER_BASE_URL}/api/user/ai-provider-keys" \
    "{\"provider\":\"openrouter\",\"apiKey\":\"${openrouter_key}\",\"name\":\"BYOK E2E\"}" \
    "${tmp_dir}/create-key.json"
})"
created_key_id="$(jq -r '.key.id // empty' "${tmp_dir}/create-key.json")"
if [[ "${create_key_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/create-key.json")" == "true" ]] && [[ -n "${created_key_id}" ]]; then
  pass "created API key"
else
  fail "create API key failed (code=${create_key_code})"
fi

list_after_code="$({
  get_with_cookies "${RECODER_BASE_URL}/api/user/ai-provider-keys" "${tmp_dir}/list-after.json"
})"
found_created="$(jq -r --arg id "${created_key_id}" '[.keys[]? | select(.id == $id)] | length' "${tmp_dir}/list-after.json")"
if [[ "${list_after_code}" == "200" && "${found_created}" == "1" ]]; then
  pass "created key present in list"
else
  fail "created key missing from list (code=${list_after_code})"
fi

decrypt_code="$({
  get_with_cookies "${RECODER_BASE_URL}/api/user/ai-provider-keys/decrypt?provider=openrouter" "${tmp_dir}/decrypt.json"
})"
decrypted_key="$(jq -r '.apiKey // empty' "${tmp_dir}/decrypt.json")"
if [[ "${decrypt_code}" == "200" && "${decrypted_key}" == "${openrouter_key}" ]]; then
  pass "decrypt endpoint returned expected key"
else
  fail "decrypt endpoint check failed (code=${decrypt_code})"
fi

delete_code="$({
  delete_with_cookies "${RECODER_BASE_URL}/api/user/ai-provider-keys?id=${created_key_id}" "${tmp_dir}/delete.json"
})"
if [[ "${delete_code}" == "200" ]] && [[ "$(jq -r '.success // false' "${tmp_dir}/delete.json")" == "true" ]]; then
  pass "deleted API key"
else
  fail "delete API key failed (code=${delete_code})"
fi

list_final_code="$({
  get_with_cookies "${RECODER_BASE_URL}/api/user/ai-provider-keys" "${tmp_dir}/list-final.json"
})"
found_final="$(jq -r --arg id "${created_key_id}" '[.keys[]? | select(.id == $id)] | length' "${tmp_dir}/list-final.json")"
if [[ "${list_final_code}" == "200" && "${found_final}" == "0" ]]; then
  pass "deleted key no longer listed"
else
  fail "deleted key still present (code=${list_final_code})"
fi

echo "Summary: PASS=${PASS} FAIL=${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
  exit 1
fi
