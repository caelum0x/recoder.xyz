#!/bin/bash

sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
su - recoder << 'INNER'
pm2 kill
rm -f /home/recoder/.pm2/dump.pm2
cd /home/recoder/recoder.xyz
pm2 start ecosystem.config.js
pm2 save --force
sleep 10
pm2 list
INNER
EOF
