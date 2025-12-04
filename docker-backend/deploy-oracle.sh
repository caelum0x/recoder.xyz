#!/bin/bash
set -e

echo "🚀 Deploying Recoder Docker Backend to Oracle Cloud"

# Configuration
SERVER_IP="130.162.228.194"
SSH_KEY="/Users/arhansubasi/Downloads/ssh-key-2025-12-04.key"
SERVER_USER="opc"
REMOTE_DIR="/home/opc/docker-backend"

echo "📦 Step 1: Creating remote directory..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_DIR"

echo "📤 Step 2: Uploading docker-backend files..."
rsync -avz --progress \
  -e "ssh -i $SSH_KEY" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  . $SERVER_USER@$SERVER_IP:$REMOTE_DIR/

echo "🔧 Step 3: Installing Node.js on server..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP << 'ENDSSH'
# Install Node.js 20.x via nodesource
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Verify installation
node --version
npm --version
ENDSSH

echo "📦 Step 4: Installing dependencies..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP "cd $REMOTE_DIR && npm install"

echo "🐳 Step 5: Building Docker image..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP << 'ENDSSH'
cd /home/opc/docker-backend/docker
sudo docker build -t recoder-universal:latest -f Dockerfile .
ENDSSH

echo "🔧 Step 6: Creating systemd service..."
ssh -i "$SSH_KEY" $SERVER_USER@$SERVER_IP << 'ENDSSH'
sudo tee /etc/systemd/system/recoder-docker-backend.service > /dev/null << 'EOF'
[Unit]
Description=Recoder Docker Backend
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=opc
WorkingDirectory=/home/opc/docker-backend
Environment="NODE_ENV=production"
Environment="PORT=3100"
ExecStart=/usr/bin/node /home/opc/docker-backend/dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Build TypeScript
cd /home/opc/docker-backend
npm run build

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable recoder-docker-backend
sudo systemctl start recoder-docker-backend

# Show status
sudo systemctl status recoder-docker-backend --no-pager
ENDSSH

echo "✅ Deployment complete!"
echo "🌐 Backend should be accessible at: http://$SERVER_IP:3100"
echo ""
echo "📊 To check logs:"
echo "  ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'sudo journalctl -u recoder-docker-backend -f'"
echo ""
echo "🔄 To restart:"
echo "  ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'sudo systemctl restart recoder-docker-backend'"
