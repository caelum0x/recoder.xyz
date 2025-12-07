# 🚀 Hetzner Deployment Plan - Recoder.xyz

## 📋 Overview

Deploy 3 applications to a single Hetzner server:
1. **recoder-web** (Remix) - Main web interface (port 3001)
2. **app** (Next.js) - Main app (port 3000)
3. **docker-backend** - Execution backend (port 3100)

**Server Required**: CPX21 (3 vCPU, 4GB RAM) - €5.83/month

---

## 🔐 Step 1: Prepare SSH Keys

### Option A: Generate New SSH Key (Recommended)
```bash
# Generate new SSH key for Hetzner
ssh-keygen -t ed25519 -f ~/.ssh/hetzner_recoder -C "recoder@hetzner"

# Display public key (copy this for Hetzner)
cat ~/.ssh/hetzner_recoder.pub
```

### Option B: Use Existing SSH Key
```bash
# Check if you have an existing SSH key
ls -la ~/.ssh/id_*.pub

# If yes, display it
cat ~/.ssh/id_ed25519.pub  # or id_rsa.pub
```

---

## 🏗️ Step 2: Create Hetzner Account & Server

### 2.1 Sign Up
1. Go to https://hetzner.cloud
2. Sign up with email
3. Verify email
4. Add payment method (will charge ~€6/month)

### 2.2 Create Project
1. Click **"New Project"**
2. Name: `recoder-production`
3. Click **"Add Server"**

### 2.3 Server Configuration
- **Location**: Nuremberg (eu-central) or Helsinki (eu-north)
- **Image**: Ubuntu 22.04
- **Type**: **Shared vCPU** → **CPX21**
  - 3 vCPU
  - 4 GB RAM
  - 80 GB SSD
  - €5.83/month
- **Networking**:
  - ✓ Public IPv4
  - ✓ Public IPv6
- **SSH Keys**:
  - Click "New SSH key"
  - Paste your public key from Step 1
  - Name: "recoder-main"
- **Cloud config**: Leave empty
- **Name**: `recoder-production-01`

### 2.4 Create Server
- Click **"Create & Buy now"**
- Wait 30-60 seconds for server creation
- **Copy the IP address** (e.g., 65.108.123.45)

---

## 🔧 Step 3: Initial Server Setup

Once server is created, SSH into it:

```bash
# SSH to server (replace IP with your server IP)
ssh root@YOUR_SERVER_IP

# Update system
apt update && apt upgrade -y

# Install essentials
apt install -y curl git build-essential

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install Nginx (reverse proxy)
apt install -y nginx certbot python3-certbot-nginx

# Verify installations
node --version
npm --version
pnpm --version
docker --version
nginx -v
```

---

## 📦 Step 4: Deploy Applications

### 4.1 Create Deployment User

```bash
# Create non-root user
adduser recoder
usermod -aG docker recoder
usermod -aG sudo recoder

# Switch to recoder user
su - recoder
```

### 4.2 Clone Repository

```bash
cd /home/recoder

# Option A: Clone via HTTPS (public repo)
git clone https://github.com/YOUR_USERNAME/recoder.xyz.git

# Option B: Deploy directly via rsync (from local machine)
# Run this from your Mac terminal:
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude 'build' \
  /Users/arhansubasi/recoder.xyz/ \
  root@YOUR_SERVER_IP:/home/recoder/recoder.xyz/
```

---

## 🚀 Step 5: Deploy Each Application

### 5.1 Deploy recoder-web (Remix App)

```bash
cd /home/recoder/recoder.xyz/recoder-web

# Install dependencies
pnpm install

# Create .env file
cp .env.example .env
nano .env  # Edit with your production values

# Build
pnpm run build

# Create systemd service
sudo tee /etc/systemd/system/recoder-web.service > /dev/null << 'EOF'
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

# Start service
sudo systemctl daemon-reload
sudo systemctl enable recoder-web
sudo systemctl start recoder-web
sudo systemctl status recoder-web
```

### 5.2 Deploy app (Next.js App)

```bash
cd /home/recoder/recoder.xyz/app

# Install dependencies
pnpm install

# Create .env.production
cp .env.example .env.production
nano .env.production  # Edit with your production values

# Build
pnpm run build

# Create systemd service
sudo tee /etc/systemd/system/recoder-app.service > /dev/null << 'EOF'
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

# Start service
sudo systemctl daemon-reload
sudo systemctl enable recoder-app
sudo systemctl start recoder-app
sudo systemctl status recoder-app
```

### 5.3 Deploy docker-backend

```bash
cd /home/recoder/recoder.xyz/docker-backend

# Install dependencies
npm install

# Build TypeScript
npm run build

# Build Docker image (this will take 10-15 minutes)
cd docker
docker build -t recoder-universal:latest -f Dockerfile .
cd ..

# Create systemd service
sudo tee /etc/systemd/system/docker-backend.service > /dev/null << 'EOF'
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

# Start service
sudo systemctl daemon-reload
sudo systemctl enable docker-backend
sudo systemctl start docker-backend
sudo systemctl status docker-backend
```

---

## 🌐 Step 6: Configure Nginx Reverse Proxy

```bash
# Create Nginx configuration
sudo tee /etc/nginx/sites-available/recoder > /dev/null << 'EOF'
# Recoder Web (Remix) - Main domain
server {
    listen 80;
    server_name recoder.xyz www.recoder.xyz;

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

# Recoder App (Next.js) - app subdomain
server {
    listen 80;
    server_name app.recoder.xyz;

    location / {
        proxy_pass http://localhost:3000;
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

# Docker Backend - api subdomain
server {
    listen 80;
    server_name api.recoder.xyz;

    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/recoder /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 🔒 Step 7: Configure DNS

In your domain registrar (Namecheap, GoDaddy, Cloudflare, etc.):

### A Records (IPv4):
```
Type    Name    Value               TTL
A       @       YOUR_SERVER_IP      300
A       www     YOUR_SERVER_IP      300
A       app     YOUR_SERVER_IP      300
A       api     YOUR_SERVER_IP      300
```

### Optional: AAAA Records (IPv6):
```
Type    Name    Value               TTL
AAAA    @       YOUR_SERVER_IPv6    300
AAAA    www     YOUR_SERVER_IPv6    300
AAAA    app     YOUR_SERVER_IPv6    300
AAAA    api     YOUR_SERVER_IPv6    300
```

**Wait 5-10 minutes for DNS propagation**

---

## 🔐 Step 8: Setup SSL Certificates (HTTPS)

Once DNS is configured:

```bash
# Install SSL certificates for all domains
sudo certbot --nginx -d recoder.xyz -d www.recoder.xyz -d app.recoder.xyz -d api.recoder.xyz

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (option 2)

# Test auto-renewal
sudo certbot renew --dry-run

# Certificates auto-renew every 90 days
```

---

## ✅ Step 9: Verify Deployment

### 9.1 Check Services
```bash
# Check all services are running
sudo systemctl status recoder-web
sudo systemctl status recoder-app
sudo systemctl status docker-backend

# Check logs if issues
sudo journalctl -u recoder-web -f
sudo journalctl -u recoder-app -f
sudo journalctl -u docker-backend -f
```

### 9.2 Test URLs
```bash
# Test locally first
curl http://localhost:3001  # recoder-web
curl http://localhost:3000  # recoder-app
curl http://localhost:3100/health  # docker-backend

# Test via domain (after DNS + SSL setup)
curl https://recoder.xyz
curl https://app.recoder.xyz
curl https://api.recoder.xyz/health
```

### 9.3 Browser Tests
- Main site: https://recoder.xyz
- App: https://app.recoder.xyz
- API health: https://api.recoder.xyz/health

---

## 🔄 Step 10: Setup Automatic Deployments (Optional)

### 10.1 Create Deploy Script
```bash
# On server
nano /home/recoder/deploy.sh
```

```bash
#!/bin/bash
set -e

echo "🚀 Deploying Recoder.xyz..."

cd /home/recoder/recoder.xyz

# Pull latest code
git pull origin main

# Deploy recoder-web
echo "📦 Deploying recoder-web..."
cd recoder-web
pnpm install
pnpm run build
sudo systemctl restart recoder-web

# Deploy app
echo "📦 Deploying app..."
cd ../app
pnpm install
pnpm run build
sudo systemctl restart recoder-app

# Deploy docker-backend
echo "📦 Deploying docker-backend..."
cd ../docker-backend
npm install
npm run build
sudo systemctl restart docker-backend

echo "✅ Deployment complete!"
sudo systemctl status recoder-web --no-pager
sudo systemctl status recoder-app --no-pager
sudo systemctl status docker-backend --no-pager
```

```bash
# Make executable
chmod +x /home/recoder/deploy.sh
```

### 10.2 Deploy Updates
```bash
# SSH to server
ssh recoder@YOUR_SERVER_IP

# Run deploy script
./deploy.sh
```

---

## 📊 Monitoring & Maintenance

### View Logs
```bash
# Real-time logs
sudo journalctl -u recoder-web -f
sudo journalctl -u recoder-app -f
sudo journalctl -u docker-backend -f

# Last 100 lines
sudo journalctl -u recoder-web -n 100
```

### Restart Services
```bash
sudo systemctl restart recoder-web
sudo systemctl restart recoder-app
sudo systemctl restart docker-backend
```

### Check Resource Usage
```bash
# CPU/Memory
htop

# Disk space
df -h

# Docker images/containers
docker ps
docker images
docker system df
```

### Update Server
```bash
# Monthly maintenance
sudo apt update && sudo apt upgrade -y
sudo systemctl restart recoder-web recoder-app docker-backend
```

---

## 💰 Cost Breakdown

| Item | Cost/Month |
|------|------------|
| Hetzner CPX21 | €5.83 (~$6.35) |
| Domain (if new) | ~$1-2 |
| **Total** | **~$7-8/month** |

**Free features:**
- ✅ Let's Encrypt SSL (free)
- ✅ Unlimited bandwidth
- ✅ 20TB traffic included

---

## 🆘 Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u recoder-web -n 50

# Check port conflicts
sudo netstat -tulpn | grep :3001

# Restart
sudo systemctl restart recoder-web
```

### Can't access via domain
```bash
# Check DNS
nslookup recoder.xyz

# Check Nginx
sudo nginx -t
sudo systemctl status nginx

# Check firewall
sudo ufw status
```

### Out of memory
```bash
# Check memory
free -h

# Clear Docker cache
docker system prune -a

# Upgrade to CPX31 (4 vCPU, 8GB RAM, €10.59/month)
```

---

## 🎯 Quick Reference

### Important Directories
- Code: `/home/recoder/recoder.xyz/`
- Logs: `/var/log/nginx/` and `journalctl -u SERVICE_NAME`
- Nginx config: `/etc/nginx/sites-available/recoder`

### Important Commands
```bash
# SSH to server
ssh root@YOUR_SERVER_IP

# Check all services
sudo systemctl status recoder-*

# Restart all services
sudo systemctl restart recoder-web recoder-app docker-backend

# View logs
sudo journalctl -u recoder-web -f

# Deploy updates
cd /home/recoder/recoder.xyz && git pull && ./deploy.sh
```

---

## ✅ Deployment Checklist

- [ ] Create Hetzner account
- [ ] Create CPX21 server
- [ ] Add SSH key
- [ ] Note server IP address
- [ ] SSH to server and run initial setup
- [ ] Deploy recoder-web
- [ ] Deploy app
- [ ] Deploy docker-backend
- [ ] Configure Nginx
- [ ] Configure DNS A records
- [ ] Setup SSL with Let's Encrypt
- [ ] Test all URLs
- [ ] Setup monitoring/alerts (optional)

---

**Estimated Total Time: 45-60 minutes**
**Monthly Cost: ~$7-8**
**Uptime: 99.9%+**
