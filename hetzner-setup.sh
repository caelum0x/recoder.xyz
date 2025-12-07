#!/bin/bash
set -e

echo "🚀 Hetzner Server Setup - Recoder.xyz"
echo "======================================"

SERVER_IP="77.42.23.19"
SERVER_USER="root"

echo ""
echo "📦 Step 1: Running initial server setup..."
echo "This will install Docker, Node.js, Nginx, and create deployment user"
echo ""

# Run setup on remote server
sshpass -p "ti7LXfmEds3f3wqxgVfa." ssh -o StrictHostKeyChecking=no $SERVER_USER@$SERVER_IP << 'ENDSSH'
set -e

echo "🔄 Updating system..."
apt update && apt upgrade -y

echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "📦 Installing pnpm..."
npm install -g pnpm

echo "🌐 Installing Nginx..."
apt install -y nginx certbot python3-certbot-nginx

echo "👤 Creating deployment user..."
useradd -m -s /bin/bash recoder || true
usermod -aG docker recoder
usermod -aG sudo recoder

echo ""
echo "✅ Initial setup complete!"
echo "Installed versions:"
node --version
npm --version
pnpm --version
docker --version
nginx -v
ENDSSH

echo ""
echo "✅ Server setup complete!"
echo ""
echo "📤 Next: Run ./hetzner-deploy.sh to upload and deploy applications"
