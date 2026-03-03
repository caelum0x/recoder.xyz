#!/bin/bash
set -euo pipefail

echo "deploy-prod.sh is deprecated."
echo "Use the PM2-first deploy path instead:"
echo "  bash scripts/deploy-pm2-services.sh"
echo ""
echo "That workflow updates the PM2-managed Hetzner apps without treating Docker services as PM2 apps."
exit 1
