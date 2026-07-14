#!/usr/bin/env bash
# Provision (or reuse) an OpenZiti zero-trust identity for a Recoder runner and
# emit its one-time enrollment JWT. Mirrors src/ziti-client.ts createIdentity()
# so the CLI and backend produce byte-for-byte identical identities.
#
# Usage:   scripts/provision-ziti-runner.sh <runner-name>
# Env:     ZITI_CONTROLLER_URL (default https://localhost:1280)
#          ZITI_ADMIN_USERNAME (default admin)
#          ZITI_ADMIN_PASSWORD (required)
#
# Fail-safe: exits non-zero on any missing token/JWT — never fakes success.
set -euo pipefail

RUNNER_NAME="${1:?usage: provision-ziti-runner.sh <runner-name>}"
CTRL="${ZITI_CONTROLLER_URL:-https://localhost:1280}"
ZUSER="${ZITI_ADMIN_USERNAME:-admin}"
ZPWD="${ZITI_ADMIN_PASSWORD:?set ZITI_ADMIN_PASSWORD}"
EDGE="$CTRL/edge/management/v1"
# -k: the controller serves a self-signed cert; this CLI context trusts it
# explicitly. (The backend instead uses NODE_EXTRA_CA_CERTS — see .env example.)
CURL=(curl -sk --max-time 20)

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

echo "==> Waiting for controller edge API at $EDGE"
ready=0
for _ in $(seq 1 30); do
  if "${CURL[@]}" "$EDGE/version" | grep -q '"data"'; then ready=1; break; fi
  sleep 2
done
[ "$ready" = "1" ] || { echo "error: controller not ready at $EDGE" >&2; exit 1; }

echo "==> Authenticating as $ZUSER"
TOKEN=$("${CURL[@]}" -X POST "$EDGE/authenticate?method=password" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"$ZUSER\",\"password\":\"$ZPWD\"}" | jq -r '.data.token // empty')
[ -n "$TOKEN" ] || { echo "error: authentication failed (no session token)" >&2; exit 1; }

echo "==> Looking up existing identity '$RUNNER_NAME'"
EXISTING_ID=$("${CURL[@]}" -H "zt-session: $TOKEN" \
  "$EDGE/identities?filter=name=%22$RUNNER_NAME%22" | jq -r '.data[0].id // empty')

if [ -n "$EXISTING_ID" ]; then
  ID="$EXISTING_ID"
  echo "==> Reusing existing identity id=$ID (note: JWT only present if not yet enrolled)"
else
  echo "==> Creating Device identity with OTT enrollment"
  ID=$("${CURL[@]}" -X POST "$EDGE/identities" -H "zt-session: $TOKEN" \
    -H 'content-type: application/json' \
    -d "{\"name\":\"$RUNNER_NAME\",\"type\":\"Device\",\"isAdmin\":false,\"enrollment\":{\"ott\":true},\"roleAttributes\":[\"recoder-runner\"]}" \
    | jq -r '.data.id // empty')
  [ -n "$ID" ] || { echo "error: identity creation returned no id" >&2; exit 1; }
fi

echo "==> Fetching enrollment JWT for id=$ID"
JWT=$("${CURL[@]}" -H "zt-session: $TOKEN" "$EDGE/identities/$ID" | jq -r '.data.enrollment.ott.jwt // empty')
[ -n "$JWT" ] || { echo "error: no enrollment JWT (already enrolled? re-create the identity)" >&2; exit 1; }

mkdir -p "$(dirname "$0")/../out"
OUT="$(cd "$(dirname "$0")/.." && pwd)/out/${RUNNER_NAME}.jwt"
printf '%s' "$JWT" > "$OUT"
chmod 600 "$OUT"

echo
echo "==> Identity provisioned: id=$ID  name=$RUNNER_NAME"
echo "==> Enrollment JWT written to: $OUT"
echo "==> On the RUNNER host, enroll with the ziti CLI:"
echo "      ziti edge enroll \"$OUT\" -o /etc/ziti/${RUNNER_NAME}.json"
echo "    The runner then loads that identity JSON to dial the overlay (no inbound ports)."
