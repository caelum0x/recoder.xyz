#!/usr/bin/env bash
set -euo pipefail

# Audits production containers for presence of sensitive key names.
# Output never prints secret values.

TARGET="${1:-local}"
REMOTE_HOST="${REMOTE_HOST:-root@77.42.23.19}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"

if [[ "$TARGET" == "local" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker command not found" >&2
    exit 1
  fi

  docker ps >/dev/null 2>&1 || {
    echo "ERROR: docker is not accessible locally" >&2
    exit 1
  }

  for c in recoder-app recoder-docker-backend recoder-web recoder-redis openclaw-gateway; do
    echo "=== ${c} ==="
    docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$c" 2>/dev/null \
      | sed -E 's/=.*$/=SET/' \
      | grep -E '^(DATABASE_URL|AUTH_DATABASE_URL|REDIS_PASSWORD|REDIS_URL|BETTER_AUTH_SECRET|NEXTAUTH_SECRET|SESSION_SYNC_SECRET|INTERNAL_SERVICE_KEY|JWT_SECRET|JWT_REFRESH_SECRET|ENCRYPTION_KEY|ENCRYPTION_SALT|GITHUB_SECRET|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_SECRET_LOCAL|DISCORD_CLIENT_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|GROQ_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|DODO_.*|PADDLE_.*|POLAR_.*|RECODER_A2A_SHARED_SECRET|RECODER_A2A_WORKER_TOKEN|RECODER_A2A_ADMIN_TOKEN|RECODER_A2A_BRIDGE_TOKEN|OPENCLAW_GATEWAY_TOKEN|SMTP_.*|ALERT_WEBHOOK_URL|ALERT_EMAIL)=' \
      | sort || true
  done
  exit 0
fi

if [[ "$TARGET" == "remote" ]]; then
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_HOST" '
    set -e
    for c in recoder-app recoder-docker-backend recoder-web recoder-redis openclaw-gateway; do
      echo "=== ${c} ==="
      docker inspect --format "{{range .Config.Env}}{{println .}}{{end}}" "$c" 2>/dev/null \
        | sed -E "s/=.*$/=SET/" \
        | grep -E "^(DATABASE_URL|AUTH_DATABASE_URL|REDIS_PASSWORD|REDIS_URL|BETTER_AUTH_SECRET|NEXTAUTH_SECRET|SESSION_SYNC_SECRET|INTERNAL_SERVICE_KEY|JWT_SECRET|JWT_REFRESH_SECRET|ENCRYPTION_KEY|ENCRYPTION_SALT|GITHUB_SECRET|GOOGLE_CLIENT_SECRET|GOOGLE_CLIENT_SECRET_LOCAL|DISCORD_CLIENT_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|GROQ_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|DODO_.*|PADDLE_.*|POLAR_.*|RECODER_A2A_SHARED_SECRET|RECODER_A2A_WORKER_TOKEN|RECODER_A2A_ADMIN_TOKEN|RECODER_A2A_BRIDGE_TOKEN|OPENCLAW_GATEWAY_TOKEN|SMTP_.*|ALERT_WEBHOOK_URL|ALERT_EMAIL)=" \
        | sort || true
    done
  '
  exit 0
fi

echo "Usage: $0 [local|remote]" >&2
exit 1
