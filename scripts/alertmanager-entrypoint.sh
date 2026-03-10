#!/bin/sh
# Alertmanager entrypoint — expands ${VAR} references in config template.
# Alertmanager does NOT support env var substitution natively.

set -e

TEMPLATE="/etc/alertmanager/alertmanager.yml.tpl"
CONFIG="/tmp/alertmanager.yml"
SUBST_VARS='${ALERT_WEBHOOK_URL} ${ALERT_CRITICAL_WEBHOOK_URL} ${ALERT_SLACK_API_URL} ${ALERT_EMAIL} ${ALERT_EMAIL_TO} ${RESEND_API_KEY} ${SMTP_SMARTHOST} ${SMTP_FROM} ${SMTP_AUTH_USERNAME} ${SMTP_AUTH_PASSWORD}'

: "${ALERT_WEBHOOK_URL:=http://localhost:9095/alertmanager-not-configured}"
: "${ALERT_CRITICAL_WEBHOOK_URL:=${ALERT_WEBHOOK_URL}}"
: "${ALERT_SLACK_API_URL:=http://localhost:9095/alertmanager-not-configured}"
export ALERT_WEBHOOK_URL ALERT_CRITICAL_WEBHOOK_URL ALERT_SLACK_API_URL

render_without_envsubst() {
  awk '
    {
      gsub(/\$\{ALERT_WEBHOOK_URL\}/, ENVIRON["ALERT_WEBHOOK_URL"])
      gsub(/\$\{ALERT_CRITICAL_WEBHOOK_URL\}/, ENVIRON["ALERT_CRITICAL_WEBHOOK_URL"])
      gsub(/\$\{ALERT_SLACK_API_URL\}/, ENVIRON["ALERT_SLACK_API_URL"])
      gsub(/\$\{ALERT_EMAIL\}/, ENVIRON["ALERT_EMAIL"])
      gsub(/\$\{ALERT_EMAIL_TO\}/, ENVIRON["ALERT_EMAIL_TO"])
      gsub(/\$\{RESEND_API_KEY\}/, ENVIRON["RESEND_API_KEY"])
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
if grep -Eq '\$\{(ALERT_WEBHOOK_URL|ALERT_CRITICAL_WEBHOOK_URL|ALERT_SLACK_API_URL|ALERT_EMAIL|ALERT_EMAIL_TO|RESEND_API_KEY|SMTP_SMARTHOST|SMTP_FROM|SMTP_AUTH_USERNAME|SMTP_AUTH_PASSWORD)\}' "$TEMPLATE"; then
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
