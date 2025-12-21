# 🔐 Secure Deployment Guide

## ⚠️ IMPORTANT: Secrets Management

This project now uses environment variables for all sensitive information. **Never commit secrets to git.**

## Setup Instructions

### 1. Create Server Environment File

```bash
# Copy template
cp .env.server.template .env.server

# Edit with your actual credentials
nano .env.server
```

Your `.env.server` should contain:
```bash
SERVER_IP=77.42.23.19
SERVER_USER=root
SERVER_PASS=your_actual_password
API_TOKEN=your_api_token
```

### 2. Load Environment Variables

Before running any deployment scripts:
```bash
source .env.server
```

### 3. Available Deployment Scripts

**Main App Deployment:**
```bash
cd app
source ../.env.server
./deploy.sh
```

**Template Scripts (copy and configure):**
- `deploy-fix.sh.template` → `deploy-fix.sh`
- `fresh-start.sh.template` → `fresh-start.sh`

## Security Features

✅ Pre-commit hook blocks secrets  
✅ Environment variables for all credentials  
✅ Template files for safe sharing  
✅ .gitignore excludes sensitive files  

## If You Need to Commit

```bash
# This will work now - no secrets in tracked files
git add .
git commit -m "your message"
```

## Server Credentials

- **IP**: 77.42.23.19
- **User**: root
- **Password**: *Use .env.server*
- **Production Dir**: `/home/recoder/recoder.xyz/`

## Emergency Access

If you need to access the server directly:
```bash
sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP
```

Make sure you have sourced `.env.server` first!
