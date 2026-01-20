#!/bin/bash
# Hetzner Server Setup Script for Recoder Docker Backend
# Run with: sudo bash setup-hetzner.sh

set -e

echo "=========================================="
echo "  Recoder Docker Backend - Hetzner Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}Step 1: Installing system dependencies...${NC}"
apt-get update
apt-get install -y curl wget git docker.io docker-compose nodejs npm

# Enable and start Docker
systemctl enable docker
systemctl start docker

echo ""
echo -e "${YELLOW}Step 2: Installing cloudflared for tunnel support...${NC}"
if command -v cloudflared &> /dev/null; then
  echo -e "${GREEN}cloudflared is already installed${NC}"
  cloudflared --version
else
  curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  dpkg -i /tmp/cloudflared.deb
  rm /tmp/cloudflared.deb
  echo -e "${GREEN}cloudflared installed successfully${NC}"
  cloudflared --version
fi

echo ""
echo -e "${YELLOW}Step 3: Creating .env.production file...${NC}"
if [ ! -f .env.production ]; then
  cat > .env.production << 'EOF'
# Docker Backend Production Configuration
PORT=3100

# CORS - Add your domains
ALLOWED_ORIGINS=https://recoder.xyz,https://web.recoder.xyz

# Authentication
APP_API_URL=https://recoder.xyz
REQUIRE_AUTH=true

# Generate a new key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
INTERNAL_SERVICE_KEY=CHANGE_THIS_TO_A_SECURE_KEY

# Public URL for this backend (for tunnel callbacks)
BACKEND_PUBLIC_URL=https://docker.recoder.xyz
EOF
  echo -e "${GREEN}Created .env.production - PLEASE EDIT WITH YOUR SETTINGS${NC}"
else
  echo -e "${YELLOW}.env.production already exists, skipping...${NC}"
fi

echo ""
echo -e "${YELLOW}Step 4: Building Docker image...${NC}"
if [ -f docker/Dockerfile ]; then
  docker build -t recoder-dev-container -f docker/Dockerfile docker/
  echo -e "${GREEN}Docker image built successfully${NC}"
else
  echo -e "${RED}docker/Dockerfile not found. Run this script from docker-backend directory.${NC}"
fi

echo ""
echo -e "${YELLOW}Step 5: Installing Node.js dependencies...${NC}"
npm install

echo ""
echo -e "${YELLOW}Step 6: Building TypeScript...${NC}"
npm run build

echo ""
echo "=========================================="
echo -e "${GREEN}  Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env.production with your settings"
echo "  2. Generate INTERNAL_SERVICE_KEY:"
echo "     node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
echo "  3. Start the server:"
echo "     NODE_ENV=production node dist/server.js"
echo ""
echo "Or use PM2 for production:"
echo "  npm install -g pm2"
echo "  pm2 start dist/server.js --name recoder-docker-backend"
echo "  pm2 save"
echo "  pm2 startup"
echo ""
echo "Features enabled:"
echo "  - Clone URL (website cloning)"
echo "  - Browser Automation (Puppeteer)"
echo "  - Code Index (semantic search)"
echo "  - One-Click Deploy (cloudflared tunnels)"
echo ""
