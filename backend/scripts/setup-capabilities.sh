#!/usr/bin/env bash
# Bring up the self-hosted, keyless capability backends (Qdrant + Ollama) and
# pull the models mem0 OSS / the LLM router use. Idempotent.
#
# Usage:
#   scripts/setup-capabilities.sh            # core: qdrant + ollama + models
#   WITH_INFERENCE=1 scripts/setup-capabilities.sh   # also start vLLM
#   WITH_ZITI=1 scripts/setup-capabilities.sh        # also start ziti controller
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.capabilities.yml"
LLM_MODEL="${MEM0_LLM_MODEL:-llama3.1}"
EMBED_MODEL="${MEM0_EMBED_MODEL:-nomic-embed-text}"

echo "==> Starting Qdrant + Ollama"
$COMPOSE up -d qdrant ollama

profiles=()
[ "${WITH_INFERENCE:-0}" = "1" ] && profiles+=(--profile inference)
[ "${WITH_ZITI:-0}" = "1" ] && profiles+=(--profile ziti)
if [ ${#profiles[@]} -gt 0 ]; then
  echo "==> Starting optional services: ${profiles[*]}"
  $COMPOSE "${profiles[@]}" up -d
fi

echo "==> Waiting for Ollama to accept connections"
for i in $(seq 1 30); do
  if docker exec recoder-ollama ollama list >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Pulling models: $LLM_MODEL, $EMBED_MODEL"
docker exec recoder-ollama ollama pull "$LLM_MODEL"
docker exec recoder-ollama ollama pull "$EMBED_MODEL"

echo
echo "==> Done. Set these on the backend (see .env.capabilities.example):"
echo "      QDRANT_URL=http://localhost:6333"
echo "      OLLAMA_BASE_URL=http://localhost:11434/v1"
echo "      MEM0_LLM_PROVIDER=ollama   MEM0_EMBEDDER_PROVIDER=ollama"
echo "      MEM0_LLM_MODEL=$LLM_MODEL  MEM0_EMBED_MODEL=$EMBED_MODEL"
if [ "${WITH_ZITI:-0}" = "1" ]; then
  echo
  echo "==> Waiting for OpenZiti controller edge API"
  for _ in $(seq 1 30); do
    if docker exec recoder-ziti-controller curl -skf https://localhost:1280/edge/management/v1/version >/dev/null 2>&1; then
      echo "    controller ready."
      break
    fi
    sleep 2
  done
  echo
  echo "==> Admin password: ZITI_ADMIN_PASSWORD env (default 'recoder_ziti_admin'),"
  echo "    or scrape a generated one: docker logs recoder-ziti-controller 2>&1 | grep -i password"
  echo "==> Trust the self-signed CA for the backend (export from the volume):"
  echo "      CERT=\$(docker exec recoder-ziti-controller sh -c 'ls /persistent/pki/*/certs/*.cert | head -1')"
  echo "      docker cp recoder-ziti-controller:\"\$CERT\" ./ziti-ca.pem"
  echo "      # then set NODE_EXTRA_CA_CERTS=\$(pwd)/ziti-ca.pem on the backend"
  echo "==> Set backend env: ZITI_CONTROLLER_URL=https://localhost:1280, ZITI_ADMIN_USERNAME, ZITI_ADMIN_PASSWORD"
  echo "==> Then provision a runner:  ZITI_ADMIN_PASSWORD=... scripts/provision-ziti-runner.sh recoder-runner-1"
fi
echo
echo "==> Verify capabilities once the backend reloads env:"
echo "      curl -s localhost:3001/api/capabilities | jq"
