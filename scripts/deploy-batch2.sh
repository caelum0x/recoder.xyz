#!/bin/bash
# Deploy batch 2: Model ID fix + preview + OpenClaw removal + all Agent 1+2 fixes
# Run locally: bash scripts/deploy-batch2.sh
# Prerequisites: SSH key at ~/.ssh/id_ed25519_hetzner

set -e
SSH="ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19"
RSYNC="rsync -avz -e 'ssh -i ~/.ssh/id_ed25519_hetzner'"
SERVER="root@77.42.23.19"
BASE="/root/recoder.xyz"

echo "=== Step 1: Sync files ==="

# Backend (Python — no build needed)
rsync -avz --relative \
  backend/core/ai_models/registry.py \
  backend/core/prompts/core_prompt.py \
  backend/core/tools/sb_code_interpreter_tool.py \
  backend/core/tools/sb_upload_file_tool.py \
  backend/core/utils/thread_name_generator.py \
  backend/core/utils/project_helpers.py \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/

# Docker-backend
rsync -avz --relative \
  docker-backend/src/preview.ts \
  docker-backend/src/server.ts \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/

# Nginx
rsync -avz nginx/nginx-production.conf \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/nginx/

# Docker compose
rsync -avz docker-compose.production.yml \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/

# Auth package (accountLinking fix)
rsync -avz packages/auth/src/index.ts \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/packages/auth/src/

# Agents frontend
rsync -avz --relative \
  recoder-agents/src/components/thread/tool-views/command-tool/CommandToolView.tsx \
  recoder-agents/src/components/thread/tool-views/command-tool/_utils.ts \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/

# Web IDE (language model registry)
rsync -avz --relative \
  recoder-web/app/lib/services/language-model-registry/ \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/

# OpenClaw removal script
rsync -avz scripts/remove-openclaw.sh \
  -e "ssh -i ~/.ssh/id_ed25519_hetzner" \
  ${SERVER}:${BASE}/scripts/

echo ""
echo "=== Step 2: Remove OpenClaw ==="
$SSH "bash ${BASE}/scripts/remove-openclaw.sh"

echo ""
echo "=== Step 3: Restart backend ==="
$SSH "pm2 restart recoder-backend && sleep 2 && pm2 logs recoder-backend --err --lines 3 --nostream"

echo ""
echo "=== Step 4: Build docker-backend ==="
$SSH "cd ${BASE}/docker-backend && npx tsc 2>&1 | tail -5 && echo TSC_OK"
$SSH "cd ${BASE} && docker compose -f docker-compose.production.yml restart docker-backend 2>&1 | tail -3"

echo ""
echo "=== Step 5: Build + restart agents (memory-limited) ==="
$SSH "cd ${BASE}/recoder-agents && NODE_OPTIONS='--max-old-space-size=3072' npm run build 2>&1 | tail -5"
$SSH "pm2 restart recoder-agents"

echo ""
echo "=== Step 6: Build + restart agency ==="
$SSH "cd ${BASE}/recoder-agency && NODE_OPTIONS='--max-old-space-size=3072' pnpm build-sdk 2>&1 | tail -3 && NODE_OPTIONS='--max-old-space-size=3072' pnpm -F agency build 2>&1 | tail -5"
$SSH "pm2 restart recoder-agency"

echo ""
echo "=== Step 7: Health check ==="
$SSH "sleep 5 && curl -sf https://agents.recoder.xyz -o /dev/null -w '%{http_code} agents\n' && curl -sf https://agency.recoder.xyz -o /dev/null -w '%{http_code} agency\n' && curl -sf https://web.recoder.xyz -o /dev/null -w '%{http_code} web\n' && curl -sf https://api.recoder.xyz/v1/health -o /dev/null -w '%{http_code} api\n'"

echo ""
echo "=== Deploy complete ==="
echo "Test in browser:"
echo "  1. agents.recoder.xyz — send chat message"
echo "  2. web.recoder.xyz — create project, check preview"
echo "  3. agency.recoder.xyz — copilot button"
