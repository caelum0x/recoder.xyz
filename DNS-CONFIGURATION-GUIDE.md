# 🌐 DNS Configuration Guide for Recoder.xyz 5-Platform Ecosystem

## 📋 Required DNS Records

After deploying all 5 platforms locally, configure these DNS records to point to your server:

### **Primary Domains:**
```
recoder.xyz → Your Server IP (Main Website)
api.recoder.xyz → Your Server IP (Backend API)
engine.recoder.xyz → Your Server IP (Production Engine)
web.recoder.xyz → Your Server IP (Recoder Web Platform)
chat.recoder.xyz → Your Server IP (Recoder Chat Platform)
```

## 🔧 DNS Record Configuration

### **If using Cloudflare:**
1. Add A records:
   - `@` → Your Server IP (recoder.xyz)
   - `api` → Your Server IP (api.recoder.xyz)
   - `engine` → Your Server IP (engine.recoder.xyz)
   - `web` → Your Server IP (web.recoder.xyz)
   - `chat` → Your Server IP (chat.recoder.xyz)

2. Enable Cloudflare Proxy (orange cloud) for SSL/CDN

### **If using other DNS providers:**
Create A records for each subdomain pointing to your server IP.

## 🔒 Reverse Proxy Configuration (Nginx)

Create `/etc/nginx/sites-available/recoder.xyz`:

```nginx
# Main Website (recoder.xyz)
server {
    listen 80;
    server_name recoder.xyz;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Backend API (api.recoder.xyz)
server {
    listen 80;
    server_name api.recoder.xyz;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Production Engine (engine.recoder.xyz)
server {
    listen 80;
    server_name engine.recoder.xyz;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Recoder Web (web.recoder.xyz)
server {
    listen 80;
    server_name web.recoder.xyz;
    
    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Recoder Chat (chat.recoder.xyz)
server {
    listen 80;
    server_name chat.recoder.xyz;
    
    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/recoder.xyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔐 SSL Certificate Configuration

### **Using Certbot (Let's Encrypt):**
```bash
sudo certbot --nginx -d recoder.xyz -d api.recoder.xyz -d engine.recoder.xyz -d web.recoder.xyz -d chat.recoder.xyz
```

### **Using Cloudflare (Recommended):**
1. Enable "Full (strict)" SSL mode in Cloudflare
2. Certificates are handled automatically
3. Enable HSTS and other security features

## 🚀 Production Environment Variables

Update your `.env` file for production:

```bash
# Production URLs
NEXT_PUBLIC_WEB_URL=https://recoder.xyz
NEXT_PUBLIC_API_URL=https://api.recoder.xyz
NEXT_PUBLIC_ENGINE_URL=https://engine.recoder.xyz

# CORS Configuration
CORS_ORIGINS=https://recoder.xyz,https://api.recoder.xyz,https://engine.recoder.xyz,https://web.recoder.xyz,https://chat.recoder.xyz

# SSL Configuration
FORCE_HTTPS=true
SECURE_COOKIES=true
```

## 📊 Health Monitoring

Set up monitoring for all 5 platforms:

```bash
# Health check URLs
https://recoder.xyz/health
https://api.recoder.xyz/health
https://engine.recoder.xyz/health
https://web.recoder.xyz/health
https://chat.recoder.xyz/health
```

## 🔄 Deployment Commands

1. **Deploy all 5 platforms:**
   ```bash
   ./deploy-5-platforms.sh
   ```

2. **Check status:**
   ```bash
   ./check-5-platforms.sh
   ```

3. **Stop all platforms:**
   ```bash
   ./stop-5-platforms.sh
   ```

## 💰 CLI Integration Ready

Once domains are configured, users can:

1. **Install CLI:**
   ```bash
   npm install -g recoder-cli
   npm install -g recoder-cli-router
   ```

2. **Use CLI with production services:**
   ```bash
   recoder "create a React component"
   ```

3. **CLI will automatically connect to:**
   - `https://api.recoder.xyz` for authentication
   - `https://engine.recoder.xyz` for AI generation
   - Users pay $20/month, you handle all AI costs

## 🎯 Success Validation

✅ All 5 platforms accessible via their domains  
✅ SSL certificates working  
✅ CLI packages connecting to production services  
✅ OpenRouter API key handling all AI requests  
✅ User authentication and billing working  

Your Recoder.xyz 5-platform ecosystem is now ready for users!