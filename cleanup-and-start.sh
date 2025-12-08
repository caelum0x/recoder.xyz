#!/bin/bash

sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
echo "=== Killing all node processes ==="
pkill -9 -f 'next build'
pkill -9 -f 'next start'
pkill -9 -f 'node server.js'
pkill -9 -f 'node dist/server.js'
pkill -9 -f 'npm'
sleep 3

echo ""
echo "=== Checking ports ==="
netstat -tlnp | grep -E ':(3000|3009|3010)' || echo "All ports free"

echo ""
echo "=== Starting PM2 fresh ==="
su - recoder << 'INNER'
pm2 kill
sleep 2
cd /home/recoder/recoder.xyz
pm2 start ecosystem.config.js
pm2 save
sleep 10
pm2 list
INNER
EOF
