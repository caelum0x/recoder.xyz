#!/bin/bash
set -e

echo "🚀 Deploying to production server..."

# Server details
SERVER="root@77.42.23.19"
PASSWORD="ti7LXfmEds3f3wqxgVfa."

# Deploy function
deploy() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
        set -e
        cd /root/recoder.xyz

        echo "📥 Pulling latest code..."
        git pull origin main

        echo "🔨 Building recoder-web..."
        cd recoder-web
        pnpm install
        pnpm run build

        echo "🔨 Building docker-backend..."
        cd ../docker-backend
        npm install

        echo "🔄 Restarting services with PM2..."
        pm2 restart recoder-web || pm2 start npm --name "recoder-web" -- start
        pm2 restart docker-backend || pm2 start npm --name "docker-backend" -- run dev

        echo "✅ Deployment complete!"
        pm2 status
ENDSSH
}

deploy
