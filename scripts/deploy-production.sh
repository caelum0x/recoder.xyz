#!/usr/bin/env bash
set -euo pipefail

echo "scripts/deploy-production.sh is deprecated for direct production deploys."
echo "Use the canonical deploy path instead:"
echo "  bash scripts/deploy-all-services.sh"
echo ""
echo "That workflow is the supported production entrypoint and targets docker-compose.deploy.yml."
exit 1
