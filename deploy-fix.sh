#!/bin/bash

echo "Deploying ecosystem config and restarting services..."

# Upload ecosystem config
sshpass -p 'ti7LXfmEds3f3wqxgVfa.' scp -o StrictHostKeyChecking=no ecosystem.config.js root@77.42.23.19:/home/recoder/recoder.xyz/

# Kill PM2 and restart with new config
sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh -o StrictHostKeyChecking=no root@77.42.23.19 << 'EOF'
su - recoder << 'INNER_EOF'
cd /home/recoder/recoder.xyz
pm2 kill
pm2 start ecosystem.config.js
pm2 save --force
pm2 list
INNER_EOF
EOF

echo "Done! Check status above."
