#!/bin/sh
# Alertmanager entrypoint — expands ${VAR} references in config template.
# Alertmanager does NOT support env var substitution natively.

set -e

TEMPLATE="/etc/alertmanager/alertmanager.yml.tpl"
CONFIG="/tmp/alertmanager.yml"
SUBST_VARS='${ALERT_WEBHOOK_URL} ${ALERT_EMAIL} ${SMTP_SMARTHOST} ${SMTP_FROM} ${SMTP_AUTH_USERNAME} ${SMTP_AUTH_PASSWORD}'

render_without_envsubst() {
  awk '
    {
      gsub(/\$\{ALERT_WEBHOOK_URL\}/, ENVIRON["ALERT_WEBHOOK_URL"])
      gsub(/\$\{ALERT_EMAIL\}/, ENVIRON["ALERT_EMAIL"])
      gsub(/\$\{SMTP_SMARTHOST\}/, ENVIRON["SMTP_SMARTHOST"])
      gsub(/\$\{SMTP_FROM\}/, ENVIRON["SMTP_FROM"])
      gsub(/\$\{SMTP_AUTH_USERNAME\}/, ENVIRON["SMTP_AUTH_USERNAME"])
      gsub(/\$\{SMTP_AUTH_PASSWORD\}/, ENVIRON["SMTP_AUTH_PASSWORD"])
      print
    }
  ' "$TEMPLATE" > "$CONFIG"
}

# Only substitute explicitly listed vars (avoid clobbering Alertmanager's
# own {{ .template }} syntax used in email_configs).
if grep -Eq '\$\{(ALERT_WEBHOOK_URL|ALERT_EMAIL|SMTP_SMARTHOST|SMTP_FROM|SMTP_AUTH_USERNAME|SMTP_AUTH_PASSWORD)\}' "$TEMPLATE"; then
  if command -v envsubst >/dev/null 2>&1; then
    envsubst "$SUBST_VARS" < "$TEMPLATE" > "$CONFIG"
  else
    render_without_envsubst
  fi
else
  cp "$TEMPLATE" "$CONFIG"
fi

exec alertmanager \
  --config.file="$CONFIG" \
  --storage.path=/alertmanager \
  "$@"
