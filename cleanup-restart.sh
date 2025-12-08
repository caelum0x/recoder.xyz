#!/bin/bash

sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
echo "=== Killing zombie processes ==="
pkill -9 -f 'next-server'
pkill -9 -f 'npm start'
sleep 2

echo "=== Checking ports are free ==="
netstat -tlnp | grep -E ':(3000|3009|3010)'

echo ""
echo "=== Restarting PM2 services ==="
su - recoder -c 'cd /home/recoder/recoder.xyz && pm2 restart all'

sleep 5

echo ""
echo "=== Final status ==="
su - recoder -c 'pm2 list'
EOF
