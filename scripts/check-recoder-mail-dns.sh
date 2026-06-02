#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-recoder.xyz}"
MAIL_HOST="${2:-mail.${DOMAIN}}"
SENDER_IP="${3:-77.42.23.19}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

need_cmd dig

echo "== Recoder Mail DNS Check =="
echo "domain: ${DOMAIN}"
echo "mail host: ${MAIL_HOST}"
echo "sender ip: ${SENDER_IP}"
echo

echo "-- SPF (${DOMAIN}) --"
dig +short TXT "${DOMAIN}" || true
echo

echo "-- DMARC (_dmarc.${DOMAIN}) --"
dig +short TXT "_dmarc.${DOMAIN}" || true
echo

echo "-- MX (${DOMAIN}) --"
dig +short MX "${DOMAIN}" || true
echo

echo "-- MX (${MAIL_HOST}) --"
dig +short MX "${MAIL_HOST}" || true
echo

echo "-- A/AAAA (${MAIL_HOST}) --"
dig +short A "${MAIL_HOST}" || true
dig +short AAAA "${MAIL_HOST}" || true
echo

echo "-- PTR (${SENDER_IP}) --"
dig +short -x "${SENDER_IP}" || true
echo

for selector in resend default postal mail smtp dkim; do
  echo "-- DKIM (${selector}._domainkey.${DOMAIN}) --"
  dig +short TXT "${selector}._domainkey.${DOMAIN}" || true
  echo
done

cat <<EOF
Expected production-ready shape:
- SPF should authorize the actual sender path you use.
- DMARC should exist and eventually move beyond p=none.
- MX for ${DOMAIN} should be intentional.
- ${MAIL_HOST} should not point at a proxied web edge if you plan to use it for SMTP.
- PTR for ${SENDER_IP} should align with the hostname used by the mail server.
- At least one DKIM selector should exist for the active sender.
EOF
