#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"

SSH_OPTS=(-o StrictHostKeyChecking=no -o BatchMode=yes)
if [[ -f "$SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

ssh "${SSH_OPTS[@]}" "$REMOTE_HOST" 'bash -s' <<'EOS'
set -euo pipefail

DB="$(grep -E '^DATABASE_URL=' /root/recoder.xyz/recoder-pm/apps/app/.env.local | cut -d= -f2- | tr -d '"')"
if [[ -z "$DB" ]]; then
  echo "No PM DATABASE_URL found" >&2
  exit 1
fi

readarray -t feature_row < <(psql "$DB" -Atc 'select id, title, "organizationId", "creatorId" from feature limit 1;')
if [[ "${#feature_row[@]}" -eq 0 || -z "${feature_row[0]}" ]]; then
  echo "No feature rows available to seed portal data" >&2
  exit 1
fi

IFS='|' read -r FEATURE_ID FEATURE_TITLE ORG_ID CREATOR_ID <<<"${feature_row[0]}"
PORTAL_ID="portal-live-$(date +%s)"
PORTAL_FEATURE_ID="portal-feature-live-$(date +%s)"
PORTAL_SLUG="recoder-live-portal"

psql "$DB" <<SQL
insert into portal ("id","organizationId","name","slug","enableRoadmap","enableChangelog","createdAt","updatedAt")
values ('${PORTAL_ID}','${ORG_ID}','Recoder Live Portal','${PORTAL_SLUG}',true,true,now(),now())
on conflict ("slug") do nothing;

insert into portal_feature ("id","title","organizationId","featureId","portalId","creatorId","content","createdAt","updatedAt")
values (
  '${PORTAL_FEATURE_ID}',
  ${FEATURE_TITLE@Q},
  '${ORG_ID}',
  '${FEATURE_ID}',
  (select id from portal where slug='${PORTAL_SLUG}' limit 1),
  '${CREATOR_ID}',
  '{"type":"doc","content":[]}'::json,
  now(),
  now()
)
on conflict ("featureId") do nothing;

select f.id, f.title, pf.id as portal_feature_id, p.slug
from feature f
join portal_feature pf on pf."featureId" = f.id
join portal p on p.id = pf."portalId"
where f.id = '${FEATURE_ID}';
SQL
EOS
