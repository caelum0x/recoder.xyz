# 🚀 Vercel + Server Hybrid Deployment Guide for Recoder.xyz

## Deployment Strategy Overview

Since you have Namecheap domain, here's the optimal hybrid approach:

### **Vercel** (for Next.js apps - Fast & Free)
- ✅ `recoder.xyz` → Main website (app/)
- ✅ `app.recoder.xyz` → Recoder web platform (recoder-web/)
- ✅ `chat.recoder.xyz` → AI chat platform (recoder-chat/)

### **VPS Server** (for Node.js backends)
- 🖥️ `api.recoder.xyz` → Backend API
- 🖥️ `engine.recoder.xyz` → Production engine

## 📋 Option 1: Full Vercel + Railway/Render

### Vercel Projects Setup

1. **Connect to Vercel**
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy main website
cd app
vercel --prod

# Deploy web platform  
cd ../recoder-web
vercel --prod

# Deploy chat platform
cd ../recoder-chat
vercel --prod
```

2. **Configure Vercel Projects**
- Main Website: `recoder.xyz`
- Web Platform: `app.recoder.xyz`  
- Chat Platform: `chat.recoder.xyz`

### Backend Deployment Options

#### Option A: Railway (Recommended - Easy)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy backend
cd backend
railway up

# Deploy production engine
cd ../production-engine  
railway up
```

#### Option B: Render (Good alternative)
1. Connect GitHub repo to Render
2. Create services for backend + production-engine
3. Set environment variables

## 📋 Option 2: DigitalOcean Droplet (Full Control)

### Server Setup (Ubuntu 20.04)
```bash
# Create $10/month droplet at DigitalOcean
# SSH into server
ssh root@YOUR_SERVER_IP

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Clone your repo
git clone https://github.com/your-username/recoder.git /opt/recoder
cd /opt/recoder

# Run deployment
sudo ./deploy-to-domains.sh
```

## 📋 Option 3: AWS/Google Cloud (Scalable)

### AWS Deployment
- **EC2 instance** for backend services
- **Vercel** for frontend apps
- **RDS** for PostgreSQL
- **ElastiCache** for Redis

### Google Cloud Deployment
- **Compute Engine** for backend
- **Vercel** for frontend
- **Cloud SQL** for database

## 🌐 Namecheap DNS Configuration

### For Hybrid Deployment (Vercel + Server)

1. **Login to Namecheap**
2. **Go to Domain List > Manage > Advanced DNS**
3. **Add these records:**

```
Type    Host        Value                           TTL
A       @           YOUR_SERVER_IP                  30 min
A       api         YOUR_SERVER_IP                  30 min  
A       engine      YOUR_SERVER_IP                  30 min
CNAME   app         cname.vercel-dns.com           30 min
CNAME   chat        cname.vercel-dns.com           30 min
CNAME   www         recoder.xyz                     30 min
```

### For Full Server Deployment
```
Type    Host        Value                           TTL
A       @           YOUR_SERVER_IP                  30 min
A       api         YOUR_SERVER_IP                  30 min
A       engine      YOUR_SERVER_IP                  30 min  
A       app         YOUR_SERVER_IP                  30 min
A       chat        YOUR_SERVER_IP                  30 min
CNAME   www         recoder.xyz                     30 min
```

## ⚡ Quick Start: Vercel Deployment

### 1. Create Vercel Configurations

**Main Website** (`app/vercel.json`):
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "functions": {
    "app/**/*.ts": {
      "runtime": "nodejs18.x"
    }
  },
  "env": {
    "NODE_ENV": "production",
    "NEXTAUTH_URL": "https://recoder.xyz",
    "NEXTAUTH_SECRET": "fb43a832342cc7646343a443eed7940c79fb41e132bff7fe1842d91fbd0ce804",
    "DATABASE_URL": "postgresql://neondb_owner:npg_LDgwo1PRFh2J@ep-rapid-queen-abgrjesz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    "ANTHROPIC_API_KEY": "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",
    "OPENROUTER_API_KEY": "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"
  }
}
```

**Web Platform** (`recoder-web/vercel.json`):
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "env": {
    "NODE_ENV": "production",
    "NEXT_PUBLIC_API_URL": "https://api.recoder.xyz",
    "NEXTAUTH_URL": "https://app.recoder.xyz",
    "NEXTAUTH_SECRET": "fb43a832342cc7646343a443eed7940c79fb41e132bff7fe1842d91fbd0ce804"
  }
}
```

**Chat Platform** (`recoder-chat/vercel.json`):
```json
{
  "framework": "nextjs", 
  "buildCommand": "npm run build",
  "env": {
    "NODE_ENV": "production",
    "NEXTAUTH_URL": "https://chat.recoder.xyz",
    "AUTH_SECRET": "bb3be4bcc274377e8cc42c190f8eed10df5441d4308ad53045ff01ab5119177f"
  }
}
```

### 2. Deploy to Vercel
```bash
# Main website
cd app
vercel --prod
# Follow prompts, set domain to recoder.xyz

# Web platform
cd ../recoder-web  
vercel --prod
# Set domain to app.recoder.xyz

# Chat platform
cd ../recoder-chat
vercel --prod  
# Set domain to chat.recoder.xyz
```

## 🖥️ Backend Server Options

### Cheapest Options ($5-10/month)
1. **DigitalOcean Droplet** - $6/month, 1GB RAM
2. **Linode Nanode** - $5/month, 1GB RAM  
3. **Vultr VPS** - $6/month, 1GB RAM
4. **Hetzner Cloud** - €4.51/month, 2GB RAM

### Managed Options ($7-15/month)
1. **Railway** - $5/month + usage
2. **Render** - $7/month per service
3. **Fly.io** - $5-10/month
4. **PlanetScale + Vercel** - $10-20/month

### Enterprise Options ($25+/month)
1. **AWS EC2** - $25+/month
2. **Google Cloud** - $30+/month
3. **Azure** - $25+/month

## 🚀 Recommended Quick Setup

**For MVP Launch (Free/Cheap):**
```
✅ Vercel (Free) - Frontend apps
✅ Railway ($5/month) - Backend + DB
✅ Namecheap DNS (Free with domain)
Total: ~$5/month
```

**For Production (Scalable):**  
```
✅ Vercel Pro ($20/month) - Frontend apps
✅ DigitalOcean Droplet ($12/month) - Backend services
✅ DigitalOcean Managed PostgreSQL ($15/month) 
Total: ~$47/month
```

## 📝 Next Steps

1. **Choose deployment strategy** (Vercel + Railway recommended for start)
2. **Set up Namecheap DNS** 
3. **Deploy frontend to Vercel**
4. **Deploy backend to Railway/server**
5. **Test all domains work**

Want me to help set up any specific option?