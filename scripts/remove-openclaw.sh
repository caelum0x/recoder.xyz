#!/bin/bash
# Remove OpenClaw from production server
# Run on server: bash /root/recoder.xyz/scripts/remove-openclaw.sh

set -e

echo "=== Stopping OpenClaw PM2 services ==="
pm2 stop vcpeer vcpeer-cron 2>/dev/null || true
pm2 delete vcpeer vcpeer-cron 2>/dev/null || true
pm2 save

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
echo "  - ~400MB RAM (OpenClaw gateway)"
echo "  - ~120MB RAM (vcpeer + vcpeer-cron)"
echo "  - 1 Docker container"
echo "  - 2 Docker volumes"
echo ""
pm2 list | grep -E "name|recoder|vcpeer"
