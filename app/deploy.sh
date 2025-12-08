#!/bin/bash
set -e

echo "Building app..."
npm run build

echo "Deploying to server..."
rsync -avz --delete .next/ recoder@77.42.23.19:/home/recoder/recoder.xyz/app/.next/

echo "Restarting app..."
sshpass -p 'ti7LXfmEds3f3wqxgVfa.' ssh root@77.42.23.19 "su - recoder -c 'pm2 restart recoder-app'"

echo "Deployment complete!"
