#!/usr/bin/env bash
set -euo pipefail

# Real signed-in SSO + logout propagation matrix.
# Default scope excludes studio (per current production scope).
#
# Usage:
#   bash scripts/sso-logout-matrix.sh
#   BASE_URL=https://recoder.xyz bash scripts/sso-logout-matrix.sh

BASE_URL="${BASE_URL:-https://recoder.xyz}"
AGENTS_URL="${AGENTS_URL:-https://agents.recoder.xyz}"
AGENCY_URL="${AGENCY_URL:-https://agency.recoder.xyz}"
PM_URL="${PM_URL:-https://pm.recoder.xyz}"
AUTO_VERIFY_OVER_SSH="${AUTO_VERIFY_OVER_SSH:-true}"
REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"

EMAIL="sso-matrix-$(date +%s)@example.com"
PASS='TestPass123!Aa'
COOKIE_JAR="$(mktemp)"

SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=10)
if [[ -f "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

cleanup() {
  rm -f "$COOKIE_JAR" /tmp/sso_matrix_*.json /tmp/sso_matrix_*.hdr
}
trap cleanup EXIT

auto_verify_email_over_ssh() {
  local email="$1"

  if [[ "$AUTO_VERIFY_OVER_SSH" != "true" ]]; then
    return 1
  fi

ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" "EMAIL_TO_VERIFY='$email' bash -s" <<'ENDSSH'
set -euo pipefail
EMAIL_TO_VERIFY="${EMAIL_TO_VERIFY:?missing email}"
resolve_db_url() {
  for env_file in /root/recoder.xyz/app/.env.production /root/recoder.xyz/.env.production /root/recoder.xyz/.env; do
    [[ -f "$env_file" ]] || continue
    db_url="$(grep '^DATABASE_URL=' "$env_file" | head -n1 | cut -d= -f2- || true)"
    [[ -n "$db_url" ]] || continue
    db_url="${db_url%%#*}"
    db_url="${db_url#"${db_url%%[![:space:]]*}"}"
    db_url="${db_url%"${db_url##*[![:space:]]}"}"
    if [[ "${db_url:0:1}" == "\"" && "${db_url: -1}" == "\"" ]]; then
      db_url="${db_url:1:-1}"
    fi
    if [[ "${db_url:0:1}" == "'" && "${db_url: -1}" == "'" ]]; then
      db_url="${db_url:1:-1}"
    fi
    if [[ "$db_url" == postgres* ]]; then
      printf '%s' "$db_url"
      return 0
    fi
  done
  return 1
}

DB_URL="$(resolve_db_url)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "UPDATE users SET \"emailVerified\" = true WHERE email = '$EMAIL_TO_VERIFY';" >/dev/null
psql "$DB_URL" -c "UPDATE \"user\" SET \"emailVerified\" = true WHERE email = '$EMAIL_TO_VERIFY';" >/dev/null 2>&1 || true
ENDSSH
}

probe() {
  local name="$1"
  local url="$2"
  local code loc body_file auth_state
  body_file="/tmp/sso_matrix_probe_${name}.json"
  code="$(curl -sS -L -o "$body_file" -w "%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$url")"
  curl -sS -o /dev/null -D /tmp/sso_matrix_probe.hdr -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$url" >/dev/null 2>&1 || true
  loc="$(awk 'tolower($1)=="location:"{print $2}' /tmp/sso_matrix_probe.hdr | tr -d '\r' | tail -n1)"
  auth_state=""
  if [[ "$url" == */api/auth/session ]]; then
    auth_state="$(jq -r 'if (.user?.id // .session?.user?.id // .data?.user?.id) then "auth" else "anon" end' "$body_file" 2>/dev/null || echo "unknown")"
  elif [[ "$url" == */api/auth/session-token ]]; then
    auth_state="$(jq -r 'if ((.accessToken // .data?.accessToken // "") != "") then "auth" else "anon" end' "$body_file" 2>/dev/null || echo "unknown")"
  fi
  echo "$name|$code|${loc:-}|${auth_state:-}"
}

echo "== Register =="
REG_CODE="$(curl -sS -o /tmp/sso_matrix_register.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/register" \
  -H "content-type: application/json" \
  --data "{\"name\":\"SSO Matrix\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
echo "register=$REG_CODE"
cat /tmp/sso_matrix_register.json
echo

if [[ "$REG_CODE" -ne 200 ]]; then
  echo "STOP: registration failed (likely DB/auth infra issue)."
  exit 1
fi

echo "== Sign In =="
SIGNIN_CODE="$(curl -sS -o /tmp/sso_matrix_signin.json -w "%{http_code}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/auth/sign-in/email" \
  -H "content-type: application/json" \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
echo "signin=$SIGNIN_CODE"
cat /tmp/sso_matrix_signin.json
echo

if [[ "$SIGNIN_CODE" -ne 200 ]]; then
  if jq -e '.code=="EMAIL_NOT_VERIFIED"' /tmp/sso_matrix_signin.json >/dev/null 2>&1; then
    echo "signin blocked by EMAIL_NOT_VERIFIED; attempting smoke-only auto-verify..."
    if auto_verify_email_over_ssh "$EMAIL"; then
      SIGNIN_CODE="$(curl -sS -o /tmp/sso_matrix_signin_retry.json -w "%{http_code}" \
        -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
        -X POST "$BASE_URL/api/auth/sign-in/email" \
        -H "content-type: application/json" \
        --data "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
      echo "signin_retry=$SIGNIN_CODE"
      cat /tmp/sso_matrix_signin_retry.json
      echo
      if [[ "$SIGNIN_CODE" -ne 200 ]]; then
        echo "STOP: sign-in retry failed; cannot run signed-in matrix."
        exit 1
      fi
    else
      echo "STOP: auto-verify over SSH failed; cannot run signed-in matrix."
      exit 1
    fi
  else
    echo "STOP: sign-in failed; cannot run signed-in matrix."
    exit 1
  fi
fi

echo "== Pre-logout probes (signed-in cookie) =="
probe "recoder_session" "$BASE_URL/api/auth/session"
probe "agents_session" "$AGENTS_URL/api/auth/session"
probe "agents_session_token" "$AGENTS_URL/api/auth/session-token"
probe "agency_root" "$AGENCY_URL/"
probe "agency_workspaces" "$AGENCY_URL/workspaces"
probe "pm_root" "$PM_URL/"
probe "pm_app" "$PM_URL/app"

echo "== Sign out =="
SIGNOUT_CODE="$(curl -sS -o /tmp/sso_matrix_signout.json -w "%{http_code}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -X POST "$BASE_URL/api/auth/sign-out" \
  -H "origin: $BASE_URL" \
  -H "content-type: application/json")"
echo "signout=$SIGNOUT_CODE"
cat /tmp/sso_matrix_signout.json
echo

if [[ "$SIGNOUT_CODE" -ne 200 ]]; then
  echo "signout primary failed -> trying fallback /api/auth/logout"
  FALLBACK_CODE="$(curl -sS -o /tmp/sso_matrix_logout.json -w "%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST "$BASE_URL/api/auth/logout" \
    -H "content-type: application/json")"
  echo "logout_fallback=$FALLBACK_CODE"
  cat /tmp/sso_matrix_logout.json
  echo
fi

echo "== Post-logout probes =="
probe "recoder_session" "$BASE_URL/api/auth/session"
probe "agents_session" "$AGENTS_URL/api/auth/session"
probe "agents_session_token" "$AGENTS_URL/api/auth/session-token"
probe "agency_root" "$AGENCY_URL/"
probe "agency_workspaces" "$AGENCY_URL/workspaces"
probe "pm_root" "$PM_URL/"
probe "pm_app" "$PM_URL/app"

echo "smoke_user=$EMAIL"
