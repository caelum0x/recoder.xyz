#!/bin/bash
set -e

echo "🚀 Deploying Recoder.xyz to Hetzner"
echo "===================================="

SERVER_IP="77.42.23.19"
SERVER_USER="root"
SERVER_PASS="ti7LXfmEds3f3wqxgVfa."
DEPLOY_DIR="/home/recoder/recoder.xyz"

echo ""
echo "📤 Step 1: Uploading code to server..."
echo ""

# Upload code via rsync
sshpass -p "$SERVER_PASS" rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude 'build' \
  --exclude '*.log' \
  -e "ssh -o StrictHostKeyChecking=no" \
  /Users/arhansubasi/recoder.xyz/ \
  $SERVER_USER@$SERVER_IP:$DEPLOY_DIR/

echo ""
echo "🔧 Step 2: Deploying applications..."
echo ""

sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'ENDSSH'
set -e

DEPLOY_DIR="/home/recoder/recoder.xyz"

# Set ownership
chown -R recoder:recoder $DEPLOY_DIR

echo "📦 1/3: Deploying recoder-web (Remix)..."
cd $DEPLOY_DIR/recoder-web

# Install dependencies
su - recoder -c "cd $DEPLOY_DIR/recoder-web && pnpm install"

# Build
su - recoder -c "cd $DEPLOY_DIR/recoder-web && pnpm run build"

# Create systemd service
cat > /etc/systemd/system/recoder-web.service << 'EOF'
[Unit]
Description=Recoder Web (Remix)
After=network.target

[Service]
Type=simple
User=recoder
WorkingDirectory=/home/recoder/recoder.xyz/recoder-web
Environment="NODE_ENV=production"
Environment="PORT=3001"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable recoder-web
systemctl start recoder-web

echo "✅ recoder-web deployed!"

echo "📦 2/3: Deploying app (Next.js)..."
cd $DEPLOY_DIR/app

# Install dependencies
su - recoder -c "cd $DEPLOY_DIR/app && pnpm install"

# Build
su - recoder -c "cd $DEPLOY_DIR/app && pnpm run build"

# Create systemd service
cat > /etc/systemd/system/recoder-app.service << 'EOF'
[Unit]
Description=Recoder App (Next.js)
After=network.target

[Service]
Type=simple
User=recoder
WorkingDirectory=/home/recoder/recoder.xyz/app
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable recoder-app
systemctl start recoder-app

echo "✅ recoder-app deployed!"

echo "📦 3/3: Deploying docker-backend..."
cd $DEPLOY_DIR/docker-backend

# Install dependencies
su - recoder -c "cd $DEPLOY_DIR/docker-backend && npm install"

# Build TypeScript
su - recoder -c "cd $DEPLOY_DIR/docker-backend && npm run build"

# Build Docker image (this takes 10-15 minutes)
echo "🐳 Building Docker image (this may take 10-15 minutes)..."
su - recoder -c "cd $DEPLOY_DIR/docker-backend/docker && docker build -t recoder-universal:latest -f Dockerfile ."

# Create systemd service
cat > /etc/systemd/system/docker-backend.service << 'EOF'
[Unit]
Description=Recoder Docker Backend
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=recoder
WorkingDirectory=/home/recoder/recoder.xyz/docker-backend
Environment="NODE_ENV=production"
Environment="PORT=3100"
ExecStart=/usr/bin/node /home/recoder/recoder.xyz/docker-backend/dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable docker-backend
systemctl start docker-backend

echo "✅ docker-backend deployed!"

echo ""
echo "🌐 Configuring Nginx reverse proxy..."

# Create Nginx configuration
cat > /etc/nginx/sites-available/recoder << 'EOF'
# Recoder Web (Remix) - Main domain
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/recoder /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl reload nginx

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Service Status:"
systemctl status recoder-web --no-pager | head -10
systemctl status recoder-app --no-pager | head -10
systemctl status docker-backend --no-pager | head -10

echo ""
echo "🌐 Access your applications:"
echo "   Main site: http://77.42.23.19"
echo "   Or configure DNS to point to 77.42.23.19"
echo ""
echo "📝 View logs:"
echo "   sudo journalctl -u recoder-web -f"
echo "   sudo journalctl -u recoder-app -f"
echo "   sudo journalctl -u docker-backend -f"
ENDSSH

echo ""
echo "✅ All applications deployed successfully!"
echo ""
echo "🧪 Testing deployment..."
curl -I http://77.42.23.19 2>/dev/null | head -5

echo ""
echo "🎉 Deployment complete! Your apps are live at:"
echo "   http://77.42.23.19"
