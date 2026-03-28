#!/bin/bash
# Remove OpenClaw from production server
# Run on server: bash /root/recoder.xyz/scripts/remove-openclaw.sh

set -e

echo "=== OpenClaw Docker cleanup only ==="
echo "NOTE: vcpeer and vcpeer-cron are NOT OpenClaw — DO NOT touch them"

echo "=== Stopping OpenClaw Docker container ==="
docker stop openclaw-gateway 2>/dev/null || true
docker rm openclaw-gateway 2>/dev/null || true

echo "=== Removing OpenClaw Docker volumes ==="
docker volume rm recoder_openclaw_config 2>/dev/null || true
docker volume rm recoder_openclaw_workspace 2>/dev/null || true

echo "=== Reloading nginx ==="
cp /root/recoder.xyz/nginx/nginx-production.conf /etc/nginx/nginx.conf
nginx -t && nginx -s reload

echo "=== Done ==="
echo "OpenClaw removed. openclaw.recoder.xyz now redirects to agency.recoder.xyz"
echo ""
echo "Freed resources:"
echo "  - OpenClaw Docker container + volumes"
echo "  - 2 Docker volumes"
echo ""
pm2 list | grep -E "name|recoder|vcpeer"
