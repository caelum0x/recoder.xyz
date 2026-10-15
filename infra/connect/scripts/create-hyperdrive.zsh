#!/usr/bin/env zsh
# Owner-run (needs `wrangler login` + the box's Cloudflare Tunnel id).
# Creates the Workers VPC service + Hyperdrive config that let the Recoder
# Connect Worker reach box Postgres without opening any public port — the
# same pattern already live for Bidstage
# (~/products/deploy-scripts/bidstage-to-box.sh, "bidstage-box").
#
# Prereqs this script assumes are already done on the box (infra-box):
#   1. A `recoder-connect-pg` Postgres instance (pgvector/pg17 image is fine,
#      pgvector unused) listening on 127.0.0.1 only, TLS enabled with a
#      self-signed cert (Hyperdrive requires TLS; the hop is inside the
#      authenticated tunnel so cert verification is safely disabled below).
#   2. A `recoder_connect_runtime` role with least-privilege grants on the
#      `recoder_connect` database (see ../drizzle/0000_init.sql for the
#      schema the grants must cover).
#   3. A Cloudflare Tunnel already running on the box (reuse the box's
#      existing tunnel id — do not create a second tunnel per product).
set -euo pipefail

typeset tunnel_id
typeset db_port
typeset runtime_password

read -r "tunnel_id?Box Cloudflare Tunnel id: "
if [[ -z "$tunnel_id" ]]; then
  print -u2 "A tunnel id is required."
  exit 1
fi

read -r "db_port?recoder-connect-pg local port (e.g. 5443): "
if [[ -z "$db_port" || ! "$db_port" =~ ^[0-9]+$ ]]; then
  print -u2 "A numeric port is required."
  exit 1
fi

read -r -s "runtime_password?Password for the recoder_connect_runtime role: "
print
if [[ -z "$runtime_password" ]]; then
  print -u2 "A runtime-role password is required."
  exit 1
fi

trap 'unset runtime_password' EXIT INT TERM

echo "== creating Workers VPC service recoder-connect-pg (tcp:$db_port -> tunnel $tunnel_id)"
SVC_OUT="$(npx -y wrangler@latest vpc service create recoder-connect-pg --type tcp --tcp-port "$db_port" \
  --app-protocol postgresql --tunnel-id "$tunnel_id" --ipv4 127.0.0.1 --cert-verification-mode disabled)"
echo "$SVC_OUT" | grep -v -i password
SVC_ID="$(grep -oE '[0-9a-f-]{32,36}' <<<"$SVC_OUT" | grep -v "$tunnel_id" | head -1)"
if [[ -z "$SVC_ID" ]]; then
  print -u2 "Could not parse the VPC service id from wrangler's output. Create it manually, then rerun with --service-id."
  exit 1
fi
echo "vpc service id: $SVC_ID"

echo "== creating Hyperdrive config recoder-connect-box"
HD_OUT="$(npx -y wrangler@latest hyperdrive create recoder-connect-box --service-id "$SVC_ID" \
  --database recoder_connect --user recoder_connect_runtime --password "$runtime_password" \
  --scheme postgresql --caching-disabled)"
unset runtime_password
echo "$HD_OUT" | grep -v -i password
HD_ID="$(grep -oE '[0-9a-f]{32}' <<<"$HD_OUT" | head -1)"
if [[ -z "$HD_ID" ]]; then
  print -u2 "Could not parse the Hyperdrive id. Copy it from the output above into wrangler.jsonc manually."
  exit 1
fi

echo "== done. Put this id into infra/connect/wrangler.jsonc under hyperdrive[0].id:"
echo "$HD_ID"
echo "Then: wrangler secret put BETTER_AUTH_SECRET / SCRIBASE_MAIL_API_KEY / RECODER_CONNECT_DODO_API_KEY / RECODER_CONNECT_DODO_WEBHOOK_SECRET"
