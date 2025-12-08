#!/bin/bash

sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
echo "=== Deploying app ==="
cd /home/recoder/recoder.xyz/app
rm -rf .next
tar -xzf /tmp/app-deploy.tar.gz
chown -R recoder:recoder .next

echo "=== Checking miner status ==="
ps aux | grep -E 'xmrig|monero' | grep -v grep || echo "No miner running"

echo "=== Restarting PM2 ==="
su - recoder -c 'cd /home/recoder/recoder.xyz && pm2 restart recoder-app'

sleep 5

echo "=== Status ==="
su - recoder -c 'pm2 list'
EOF
