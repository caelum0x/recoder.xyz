#!/bin/bash
set -e

# Check for required environment variables
if [ -z "$SERVER_IP" ] || [ -z "$SERVER_PASS" ]; then
    echo "❌ Error: SERVER_IP and SERVER_PASS environment variables must be set"
    echo "💡 Run: source .env.server"
    exit 1
fi

echo "Building app..."
npm run build

echo "Deploying to server..."
rsync -avz --delete .next/ recoder@$SERVER_IP:/home/recoder/recoder.xyz/app/.next/

echo "Restarting app..."
sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP "su - recoder -c 'pm2 restart recoder-app'"

echo "Deployment complete!"
