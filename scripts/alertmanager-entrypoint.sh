#!/bin/sh
# Alertmanager entrypoint — expands ${VAR} references in config template.
# Alertmanager does NOT support env var substitution natively, so we
# use envsubst to process the template before starting.

set -e

TEMPLATE="/etc/alertmanager/alertmanager.yml.tpl"
CONFIG="/tmp/alertmanager.yml"

# Only substitute explicitly listed vars (avoid clobbering Alertmanager's
# own {{ .template }} syntax used in email_configs).
envsubst '${ALERT_WEBHOOK_URL} ${ALERT_EMAIL} ${SMTP_SMARTHOST} ${SMTP_FROM} ${SMTP_AUTH_USERNAME} ${SMTP_AUTH_PASSWORD}' \
  < "$TEMPLATE" > "$CONFIG"

exec alertmanager \
  --config.file="$CONFIG" \
  --storage.path=/alertmanager \
  "$@"
