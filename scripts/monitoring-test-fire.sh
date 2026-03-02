#!/usr/bin/env bash
set -euo pipefail

ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://127.0.0.1:9093}"
ALERT_NAME="${ALERT_NAME:-RecoderSyntheticTestAlert}"
ALERT_SEVERITY="${ALERT_SEVERITY:-warning}"
ALERT_TEAM="${ALERT_TEAM:-platform}"
ALERT_SUMMARY="${ALERT_SUMMARY:-Synthetic monitoring alert test}"
ALERT_DESCRIPTION="${ALERT_DESCRIPTION:-This is a synthetic alert used to verify alert routing.}"

status_code="$(curl -sS -o /tmp/alertmanager_status.json -w '%{http_code}' "${ALERTMANAGER_URL}/api/v2/status" || true)"
if [[ "$status_code" != "200" ]]; then
  echo "FAIL: Alertmanager status endpoint unreachable (${ALERTMANAGER_URL}/api/v2/status, http=${status_code})"
  exit 1
fi

echo "OK: Alertmanager reachable at ${ALERTMANAGER_URL}"

starts_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
ends_at="$(date -u -d '+5 minutes' +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v+5M +'%Y-%m-%dT%H:%M:%SZ')"

cat > /tmp/alertmanager_test_alert.json <<JSON
[
  {
    "labels": {
      "alertname": "${ALERT_NAME}",
      "severity": "${ALERT_SEVERITY}",
      "team": "${ALERT_TEAM}",
      "source": "manual-test"
    },
    "annotations": {
      "summary": "${ALERT_SUMMARY}",
      "description": "${ALERT_DESCRIPTION}"
    },
    "startsAt": "${starts_at}",
    "endsAt": "${ends_at}",
    "generatorURL": "manual://scripts/monitoring-test-fire.sh"
  }
]
JSON

post_code="$(curl -sS -o /tmp/alertmanager_post.json -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST "${ALERTMANAGER_URL}/api/v2/alerts" \
  --data-binary @/tmp/alertmanager_test_alert.json || true)"

if [[ "$post_code" != "200" && "$post_code" != "202" ]]; then
  echo "FAIL: Alert post failed (http=${post_code})"
  cat /tmp/alertmanager_post.json || true
  exit 1
fi

echo "OK: Synthetic alert posted (http=${post_code})"
echo "Next: verify Slack/email/webhook receiver got '${ALERT_NAME}'."
