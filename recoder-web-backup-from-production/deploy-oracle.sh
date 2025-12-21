#!/bin/bash
# Deploy recoder-web to Oracle Cloud

SERVER="opc@130.162.228.194"
DEPLOY_DIR="/home/opc/recoder-web"

echo "📦 Building production bundle..."
npm run build

echo "📤 Creating deployment archive..."
tar -czf deploy.tar.gz \
  build/ \
  server.js \
  package.json \
  pnpm-lock.yaml \
  .env.production 2>/dev/null || tar -czf deploy.tar.gz build/ server.js package.json pnpm-lock.yaml

echo "🚀 Uploading to Oracle Cloud..."
scp deploy.tar.gz $SERVER:/tmp/

echo "📥 Extracting and setting up on server..."
ssh $SERVER << 'ENDSSH'
  set -e
  
  # Create deploy directory
  mkdir -p /home/opc/recoder-web
  cd /home/opc/recoder-web
  
  # Extract files
  tar -xzf /tmp/deploy.tar.gz
  rm /tmp/deploy.tar.gz
  
  # Install Node.js if not present
  if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
  fi
  
  # Install pnpm if not present
  if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
  fi
  
  # Install production dependencies
  pnpm install --prod
  
  # Create systemd service
  sudo tee /etc/systemd/system/recoder-web.service > /dev/null << 'EOF'
[Unit]
Description=Recoder Web Application
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/home/opc/recoder-web
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=5173
EnvironmentFile=/home/opc/recoder-web/.env

[Install]
WantedBy=multi-user.target
EOF

  # Reload and restart service
  sudo systemctl daemon-reload
  sudo systemctl enable recoder-web
  sudo systemctl restart recoder-web
  
  echo "✅ Deployment complete!"
  sudo systemctl status recoder-web --no-pager
ENDSSH

rm deploy.tar.gz
echo "🎉 Done! Server should be running at http://130.162.228.194:5173"
