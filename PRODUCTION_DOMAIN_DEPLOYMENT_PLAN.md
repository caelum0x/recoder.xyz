# 🚀 Production Domain Deployment Plan for Recoder.xyz

## 📊 Current Infrastructure Analysis

**Existing Setup:**
- ✅ Docker containers ready (router, backend, production-engine)
- ✅ Kubernetes manifests available
- ✅ Nginx reverse proxy configuration
- ✅ SSL certificate management with cert-manager
- ✅ Monitoring with Prometheus/Grafana
- ✅ All 5 platforms successfully running locally

## 🌐 Domain Architecture Plan

### **Proposed Domain Mapping:**
```
recoder.xyz              → Main Website (app/)
api.recoder.xyz         → Backend API (backend/)
engine.recoder.xyz      → Production Engine (production-engine/)
app.recoder.xyz         → Recoder Web Platform (recoder-web/)
chat.recoder.xyz        → AI Chat Platform (recoder-chat/)
```

## 🏗️ Phase 1: Production Build Configuration

### 1.1 Environment Configuration
```bash
# Create production environment files
cp .env.example .env.production
cp backend/.env.example backend/.env.production
cp production-engine/.env.example production-engine/.env.production
```

### 1.2 Production Builds
```bash
# Build all platforms for production
npm run build:production:all

# Individual builds
cd app && npm run build
cd backend && npm run build
cd production-engine && npm run build
cd recoder-web && npm run build
cd recoder-chat && npm run build
```

## 🚢 Phase 2: Container Deployment Strategy

### 2.1 Docker Compose Production
```yaml
# docker-compose.production.yml
version: '3.8'
services:
  main-web:
    image: recoder/main-web:latest
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://api.recoder.xyz
    labels:
      - "traefik.http.routers.main.rule=Host(\`recoder.xyz\`)"
      
  backend:
    image: recoder/backend:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    labels:
      - "traefik.http.routers.api.rule=Host(\`api.recoder.xyz\`)"
      
  production-engine:
    image: recoder/production-engine:latest
    environment:
      - NODE_ENV=production
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
    labels:
      - "traefik.http.routers.engine.rule=Host(\`engine.recoder.xyz\`)"
      
  recoder-web:
    image: recoder/recoder-web:latest
    labels:
      - "traefik.http.routers.app.rule=Host(\`app.recoder.xyz\`)"
      
  recoder-chat:
    image: recoder/recoder-chat:latest
    labels:
      - "traefik.http.routers.chat.rule=Host(\`chat.recoder.xyz\`)"
```

### 2.2 Kubernetes Deployment (Alternative)
```bash
# Apply Kubernetes manifests
kubectl create namespace recoder-production
kubectl apply -f kubernetes/ -n recoder-production
```

## 🔒 Phase 3: SSL & DNS Configuration

### 3.1 DNS Records Setup
```dns
# A Records (pointing to your server IP)
recoder.xyz        A    YOUR_SERVER_IP
api.recoder.xyz    A    YOUR_SERVER_IP
engine.recoder.xyz A    YOUR_SERVER_IP
app.recoder.xyz    A    YOUR_SERVER_IP
chat.recoder.xyz   A    YOUR_SERVER_IP

# Optional: CNAME for www
www.recoder.xyz    CNAME recoder.xyz
```

### 3.2 SSL Certificate Management
```yaml
# cert-manager ClusterIssuer
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@recoder.xyz
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

## 🚀 Phase 4: Deployment Execution

### 4.1 Server Setup Requirements
```bash
# Minimum server specifications:
# - 4 CPU cores
# - 8GB RAM
# - 100GB SSD storage
# - Ubuntu 20.04+ or similar

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 4.2 Deployment Commands
```bash
# 1. Clone repository to server
git clone https://github.com/recoder-team/recoder.git /opt/recoder
cd /opt/recoder

# 2. Set up environment variables
cp .env.production.example .env.production
nano .env.production  # Edit with actual values

# 3. Build and deploy
docker-compose -f docker-compose.production.yml up -d

# 4. Monitor deployment
docker-compose -f docker-compose.production.yml logs -f
```

## 🔧 Phase 5: Nginx Reverse Proxy

### 5.1 Nginx Configuration
```nginx
# /etc/nginx/sites-available/recoder.xyz
server {
    listen 80;
    server_name recoder.xyz www.recoder.xyz;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name recoder.xyz www.recoder.xyz;
    
    ssl_certificate /etc/letsencrypt/live/recoder.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/recoder.xyz/privkey.pem;
    
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

# Similar configurations for api.recoder.xyz, engine.recoder.xyz, etc.
```

## 📊 Phase 6: Monitoring & Health Checks

### 6.1 Health Check Endpoints
```bash
# Verify all services are running
curl https://recoder.xyz/health
curl https://api.recoder.xyz/health
curl https://engine.recoder.xyz/health
curl https://app.recoder.xyz/health
curl https://chat.recoder.xyz/health
```

### 6.2 Monitoring Setup
```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
      
  grafana:
    image: grafana/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your_password
    ports:
      - "3001:3000"
```

## 🔐 Phase 7: Security Hardening

### 7.1 Firewall Configuration
```bash
# Configure UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 7.2 Environment Security
```bash
# Secure environment variables
sudo chmod 600 .env.production
sudo chown root:root .env.production

# Set up log rotation
sudo nano /etc/logrotate.d/recoder
```

## 📋 Phase 8: Deployment Checklist

### Pre-Deployment Checklist:
- [ ] DNS records configured and propagated
- [ ] SSL certificates obtained
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] All services built for production
- [ ] Monitoring configured
- [ ] Backup strategy in place

### Post-Deployment Verification:
- [ ] All domains resolve correctly
- [ ] SSL certificates valid
- [ ] All health checks pass
- [ ] API endpoints responding
- [ ] Frontend applications loading
- [ ] Authentication working
- [ ] AI services functional

## 🚀 Execution Commands

### Quick Deploy Script:
```bash
#!/bin/bash
# deploy-production.sh

echo "🚀 Starting Recoder.xyz Production Deployment..."

# Build all services
docker-compose -f docker-compose.production.yml build

# Deploy with zero downtime
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be healthy
./wait-for-health.sh

# Run post-deployment tests
./test-production-deployment.sh

echo "✅ Deployment complete! Visit https://recoder.xyz"
```

## 📞 Support & Maintenance

### Monitoring Commands:
```bash
# Check service status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f [service_name]

# Update services
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

This deployment plan provides a complete path from your current local setup to production domains with proper security, monitoring, and scalability considerations.