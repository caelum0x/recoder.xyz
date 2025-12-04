#!/bin/bash
set -e

echo "🚀 Deploying Recoder Docker Backend"

# Configuration
SERVER_USER=${SERVER_USER:-root}
SERVER_HOST=${SERVER_HOST:-docker.recoder.xyz}
DEPLOY_DIR=/opt/recoder-backend

# Build locally
echo "📦 Building Docker image..."
docker build -t recoder-backend:latest .

# Save and transfer
echo "📤 Transferring to server..."
docker save recoder-backend:latest | gzip > /tmp/recoder-backend.tar.gz
scp /tmp/recoder-backend.tar.gz $SERVER_USER@$SERVER_HOST:/tmp/
scp docker-compose.prod.yml $SERVER_USER@$SERVER_HOST:$DEPLOY_DIR/docker-compose.yml
scp nginx.conf $SERVER_USER@$SERVER_HOST:$DEPLOY_DIR/nginx.conf

# Deploy on server
echo "🔄 Deploying on server..."
ssh $SERVER_USER@$SERVER_HOST << 'EOF'
cd /opt/recoder-backend
docker load < /tmp/recoder-backend.tar.gz
docker-compose down || true
docker-compose up -d
docker-compose ps
EOF

# Cleanup
rm /tmp/recoder-backend.tar.gz

echo "✅ Deployment complete!"
echo "🌐 Backend available at: https://docker.recoder.xyz"
