# 🚀 Recoder.xyz Production Deployment Guide

Complete enterprise-grade deployment of Recoder.xyz to production servers with HTTPS SSL, monitoring, and security.

## 📋 Quick Start

```bash
# 1. Clone repository
git clone https://github.com/your-username/recoder.xyz.git
cd recoder.xyz

# 2. Configure environment
cp .env.domain .env.production
nano .env.production  # Update with your settings

# 3. Deploy to domain
./deploy-domain.sh

# 4. Validate deployment
./validate-deployment.sh yourdomain.com
```

## 🏗️ Deployment Options

### 1. Local Development Deployment
```bash
# Uses localhost with basic Docker setup
./deploy-production.sh
```
- **URLs**: http://localhost:3000, http://localhost:3001
- **SSL**: No (HTTP only)
- **Use Case**: Development, testing, local demos

### 2. Domain Production Deployment
```bash
# Uses your domain with HTTPS SSL via Let's Encrypt
./deploy-domain.sh
```
- **URLs**: https://yourdomain.com, https://chat.yourdomain.com
- **SSL**: Yes (Let's Encrypt automatic)
- **Use Case**: Production, staging, public access

## 🌐 Domain Setup

### Prerequisites
1. **Server**: Ubuntu 20.04+ with 4GB+ RAM, 20GB+ storage
2. **Domain**: Purchased domain (e.g., recoder.xyz)
3. **DNS**: A records configured
4. **Ports**: 80, 443 open to internet

### DNS Configuration
Configure these DNS records with your domain provider:

```dns
Type  Name              Value           TTL
A     yourdomain.com    YOUR_SERVER_IP  300
A     *.yourdomain.com  YOUR_SERVER_IP  300
```

**Required Subdomains:**
- `yourdomain.com` - Main web platform
- `chat.yourdomain.com` - AI chat interface  
- `api.yourdomain.com` - Backend API
- `engine.yourdomain.com` - Production engine
- `traefik.yourdomain.com` - Load balancer dashboard
- `grafana.yourdomain.com` - Analytics dashboard
- `prometheus.yourdomain.com` - Metrics collection
- `ollama.yourdomain.com` - Local AI models

## ⚙️ Environment Configuration

### Copy and Edit Environment File
```bash
cp .env.domain .env.production
nano .env.production
```

### Required Updates

#### 1. Domain Configuration
```bash
# Update with your domain
WEB_URL=https://yourdomain.com
CHAT_URL=https://chat.yourdomain.com
API_URL=https://api.yourdomain.com
ENGINE_URL=https://engine.yourdomain.com

# SSL email for Let's Encrypt
ACME_EMAIL=admin@yourdomain.com
```

#### 2. Security Secrets
```bash
# Generate strong passwords (32+ characters)
DB_PASSWORD=your_secure_database_password_here
REDIS_PASSWORD=your_secure_redis_password_here
JWT_SECRET=your_secure_jwt_secret_32_chars_minimum
NEXTAUTH_SECRET=your_secure_nextauth_secret_32_chars
```

#### 3. AI Provider Keys
```bash
# Get keys from AI providers
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
GROQ_API_KEY=gsk_your_groq_key_here
GOOGLE_API_KEY=your_google_api_key_here
OPENAI_API_KEY=sk-your_openai_key_here
```

#### 4. Payment Processing (Optional)
```bash
# Stripe production keys
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
```

## 🚀 Deployment Process

### Step 1: Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Create deployment user
sudo adduser recoder
sudo usermod -aG sudo recoder
su - recoder

# Clone repository
git clone https://github.com/your-username/recoder.xyz.git
cd recoder.xyz
```

### Step 2: Configure Environment
```bash
# Copy and edit environment
cp .env.domain .env.production
nano .env.production
```

### Step 3: Deploy to Domain
```bash
# Run domain deployment script
./deploy-domain.sh
```

The script automatically:
- ✅ Installs Docker and Docker Compose
- ✅ Configures firewall (UFW)
- ✅ Validates DNS configuration  
- ✅ Builds and deploys all services
- ✅ Obtains Let's Encrypt SSL certificates
- ✅ Configures security headers
- ✅ Sets up monitoring (Prometheus + Grafana)
- ✅ Runs comprehensive health checks

### Step 4: Validate Deployment
```bash
# Run validation tests
./validate-deployment.sh yourdomain.com
```

## 📊 Services & Architecture

### Core Application Services
- **recoder-web** (Port 3000): Main web platform
- **recoder-chat** (Port 3000): AI chat interface
- **recoder-api** (Port 8000): Backend API server
- **production-engine** (Port 8001): Code validation engine

### Infrastructure Services
- **traefik**: Reverse proxy with SSL termination
- **postgres**: PostgreSQL database
- **redis**: Redis cache and sessions
- **ollama**: Local AI model server

### Monitoring Services
- **prometheus**: Metrics collection
- **grafana**: Analytics dashboards

### External URLs
| Service | URL | Description |
|---------|-----|-------------|
| Main Platform | https://yourdomain.com | Web interface |
| Chat Platform | https://chat.yourdomain.com | AI chat |
| Backend API | https://api.yourdomain.com | REST API |
| Production Engine | https://engine.yourdomain.com | Code engine |
| Traefik Dashboard | https://traefik.yourdomain.com | Load balancer |
| Grafana | https://grafana.yourdomain.com | Analytics |
| Prometheus | https://prometheus.yourdomain.com | Metrics |
| Ollama | https://ollama.yourdomain.com | Local AI |

## 🔒 Security Features

### SSL/TLS Security
- ✅ Automatic Let's Encrypt certificates
- ✅ HTTPS redirects (HTTP → HTTPS)
- ✅ HSTS (HTTP Strict Transport Security)
- ✅ Secure ciphers and protocols only
- ✅ OCSP stapling

### Security Headers
- ✅ `X-Frame-Options: DENY`
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ `Strict-Transport-Security: max-age=31536000`

### Network Security
- ✅ Firewall configuration (UFW)
- ✅ Docker network isolation
- ✅ Internal service communication
- ✅ Protected admin dashboards

### Authentication & Authorization
- ✅ JWT-based authentication
- ✅ NextAuth.js integration
- ✅ Secure session management
- ✅ API key protection

## 📊 Monitoring & Analytics

### Grafana Dashboards
Access: https://grafana.yourdomain.com
- **Application Performance**: Response times, error rates
- **Infrastructure**: CPU, memory, disk usage
- **Database**: Query performance, connections
- **Security**: Failed login attempts, suspicious activity

### Prometheus Metrics
Access: https://prometheus.yourdomain.com
- **Service Health**: Uptime, availability
- **Performance**: Latency, throughput
- **Resources**: System utilization
- **Custom**: Business metrics

### Health Checks
- ✅ Service endpoint monitoring
- ✅ Database connectivity checks
- ✅ SSL certificate validation
- ✅ Performance metrics

## 🔧 Management Commands

### Service Management
```bash
# View all services
docker-compose -f docker-compose.domain.yml ps

# Check service logs
docker-compose -f docker-compose.domain.yml logs -f [service]

# Restart service
docker-compose -f docker-compose.domain.yml restart [service]

# Update deployment
./deploy-domain.sh --update

# Full status check
./deploy-domain.sh --status
```

### Backup & Recovery
```bash
# Create full backup
./deploy-domain.sh --backup

# Manual database backup
docker-compose -f docker-compose.domain.yml exec postgres pg_dump -U recoder recoder_production > backup.sql

# Manual Redis backup
docker-compose -f docker-compose.domain.yml exec redis redis-cli BGSAVE
```

### SSL Certificate Management
```bash
# Check SSL status
./deploy-domain.sh --status

# Renew certificates
./deploy-domain.sh --renew-ssl

# View certificate info
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com
```

## 🚨 Troubleshooting

### Common Issues

#### 1. DNS Not Resolving
```bash
# Check DNS propagation
nslookup yourdomain.com
dig yourdomain.com

# Wait up to 24 hours for global propagation
```

#### 2. SSL Certificate Issues
```bash
# Check Traefik logs
docker-compose -f docker-compose.domain.yml logs traefik

# Restart Traefik
docker-compose -f docker-compose.domain.yml restart traefik
```

#### 3. Service Not Starting
```bash
# Check service logs
docker-compose -f docker-compose.domain.yml logs [service]

# Check system resources
htop
df -h
```

#### 4. Database Connection Issues
```bash
# Test database connectivity
docker-compose -f docker-compose.domain.yml exec postgres pg_isready -U recoder

# Check database logs
docker-compose -f docker-compose.domain.yml logs postgres
```

### Log Locations
- **Application Logs**: `./logs/[service]/`
- **Docker Logs**: `docker-compose logs [service]`
- **SSL Logs**: `./logs/traefik/`
- **System Logs**: `/var/log/`

## 📈 Performance Optimization

### Resource Monitoring
```bash
# System resources
htop
df -h

# Docker resources
docker stats

# Service performance
./validate-deployment.sh yourdomain.com
```

### Database Optimization
```bash
# PostgreSQL optimization
docker-compose -f docker-compose.domain.yml exec postgres psql -U recoder -c "ANALYZE;"

# Check slow queries
docker-compose -f docker-compose.domain.yml exec postgres psql -U recoder -c "SELECT * FROM pg_stat_activity;"
```

### Cache Optimization
```bash
# Redis cache stats
docker-compose -f docker-compose.domain.yml exec redis redis-cli info memory

# Clear cache if needed
docker-compose -f docker-compose.domain.yml exec redis redis-cli FLUSHALL
```

## 🔄 Updates & Maintenance

### Regular Updates
```bash
# Update deployment
./deploy-domain.sh --update

# Pull latest code
git pull origin main

# Rebuild services
docker-compose -f docker-compose.domain.yml up -d --build
```

### Security Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose -f docker-compose.domain.yml pull
docker-compose -f docker-compose.domain.yml up -d
```

### Certificate Renewal
Let's Encrypt certificates are automatically renewed, but you can manually trigger renewal:
```bash
./deploy-domain.sh --renew-ssl
```

## 🎯 Production Checklist

### Pre-Deployment
- [ ] Server provisioned with adequate resources
- [ ] Domain purchased and DNS configured
- [ ] SSL email configured for Let's Encrypt
- [ ] Environment variables updated with production values
- [ ] API keys obtained and added
- [ ] Firewall ports opened (80, 443)

### Post-Deployment
- [ ] All services running and healthy
- [ ] SSL certificates obtained and valid
- [ ] DNS resolution working for all subdomains
- [ ] Health checks passing
- [ ] Monitoring dashboards accessible
- [ ] Backup system tested
- [ ] Security headers verified
- [ ] Performance tested

### Ongoing Maintenance
- [ ] Regular backups scheduled
- [ ] Monitoring alerts configured
- [ ] Security updates applied
- [ ] Performance monitoring
- [ ] Certificate renewal working
- [ ] Log rotation configured

## 📞 Support

### Documentation
- **Setup Guide**: [server-setup.md](./server-setup.md)
- **Validation**: Run `./validate-deployment.sh`
- **Logs**: Check `./logs/` directory

### Emergency Procedures
1. **Service Down**: Check logs and restart service
2. **SSL Expired**: Run `./deploy-domain.sh --renew-ssl`
3. **Database Issues**: Check connectivity and logs
4. **High Load**: Check resources and scale services

### Getting Help
- **Issues**: Create GitHub issue with logs
- **Security**: Report to security@yourdomain.com
- **Support**: Contact support@yourdomain.com

---

## 🎉 Success!

Your Recoder.xyz platform is now live with:
- ✅ **Enterprise-grade security** (HTTPS, security headers, firewall)
- ✅ **Production monitoring** (Prometheus, Grafana, health checks)
- ✅ **Scalable architecture** (Docker, load balancing, caching)
- ✅ **Automated operations** (SSL renewal, backups, updates)

Visit https://yourdomain.com to start using your AI-powered development platform!