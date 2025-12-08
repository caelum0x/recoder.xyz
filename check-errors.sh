#!/bin/bash

sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
echo "=== RECODER-APP ERRORS ==="
tail -30 /home/recoder/.pm2/logs/recoder-app-error.log

echo ""
echo "=== RECODER-WEB ERRORS ==="
tail -30 /home/recoder/.pm2/logs/recoder-web-error.log

echo ""
echo "=== DOCKER-BACKEND ERRORS ==="
tail -30 /home/recoder/.pm2/logs/docker-backend-error.log

echo ""
echo "=== PM2 STATUS ==="
su - recoder -c 'pm2 list'
EOF
