# Recoder.xyz Server Setup Guide

Complete guide for deploying Recoder.xyz to production with HTTPS SSL.

## 🚀 Quick Deploy

```bash
# 1. Clone repository
git clone https://github.com/your-username/recoder.xyz.git
cd recoder.xyz

# 2. Configure environment
cp .env.domain .env.production
nano .env.production  # Update with your API keys

# 3. Deploy with HTTPS
./deploy-domain.sh
```

## 📋 Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: Minimum 20GB SSD
- **CPU**: 2+ cores
- **Network**: Public IP with ports 80, 443 open

### Domain Requirements
- **Domain**: Purchased domain (e.g., recoder.xyz)
- **DNS**: A records pointing to your server IP
- **Email**: Valid email for Let's Encrypt certificates

## 🌐 DNS Configuration

Configure these DNS records with your domain provider:

```dns
Type  Name              Value           TTL
A     recoder.xyz       YOUR_SERVER_IP  300
A     *.recoder.xyz     YOUR_SERVER_IP  300
AAAA  recoder.xyz       YOUR_IPv6       300  (optional)
AAAA  *.recoder.xyz     YOUR_IPv6       300  (optional)
```

**Required Subdomains:**
- `recoder.xyz` - Main web platform
- `chat.recoder.xyz` - AI chat interface
- `api.recoder.xyz` - Backend API
- `engine.recoder.xyz` - Production engine
- `traefik.recoder.xyz` - Reverse proxy dashboard
- `grafana.recoder.xyz` - Analytics dashboard
- `prometheus.recoder.xyz` - Metrics collection
- `ollama.recoder.xyz` - Local AI models

## 🔧 Server Setup Steps

### 1. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git nano htop unzip

# Create deployment user
sudo adduser recoder
sudo usermod -aG sudo recoder
su - recoder
```

### 2. Clone Repository

```bash
cd /home/recoder
git clone https://github.com/your-username/recoder.xyz.git
cd recoder.xyz
```

### 3. Configure Environment

```bash
# Copy domain environment template
cp .env.domain .env.production

# Edit with your configuration
nano .env.production
```

**Required Configuration Updates:**
```bash
# Your domain
WEB_URL=https://yourdomain.com
CHAT_URL=https://chat.yourdomain.com
API_URL=https://api.yourdomain.com
ENGINE_URL=https://engine.yourdomain.com

# SSL email for Let's Encrypt
ACME_EMAIL=admin@yourdomain.com

# Secure passwords (generate strong ones!)
DB_PASSWORD=your_secure_database_password
REDIS_PASSWORD=your_secure_redis_password
JWT_SECRET=your_secure_jwt_secret_32_chars_minimum
NEXTAUTH_SECRET=your_secure_nextauth_secret_32_chars

# AI API Keys (required for functionality)
ANTHROPIC_API_KEY=sk-ant-your_key_here
GROQ_API_KEY=gsk_your_key_here
GOOGLE_API_KEY=your_google_key_here

# Payment processing (optional)
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
```

### 4. Deploy to Domain

```bash
# Run domain deployment
./deploy-domain.sh
```

The script will:
- ✅ Install Docker and Docker Compose
- ✅ Configure firewall (UFW)
- ✅ Validate DNS configuration
- ✅ Deploy all services with Docker
- ✅ Obtain Let's Encrypt SSL certificates
- ✅ Configure security headers
- ✅ Set up monitoring (Prometheus + Grafana)
- ✅ Run health checks

## 🔒 Security Configuration

### Firewall Rules
```bash
# Automatic via deploy script
sudo ufw allow ssh
sudo ufw allow 80/tcp   # HTTP (redirects to HTTPS)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### SSL/TLS Security
- ✅ Automatic Let's Encrypt certificates
- ✅ HTTPS redirects
- ✅ HSTS (HTTP Strict Transport Security)
- ✅ Secure ciphers only
- ✅ OCSP stapling

### Security Headers
- ✅ `X-Frame-Options: DENY`
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ `Strict-Transport-Security: max-age=31536000`

## 📊 Monitoring & Analytics

### Access Dashboards
- **Grafana**: https://grafana.yourdomain.com
- **Prometheus**: https://prometheus.yourdomain.com
- **Traefik**: https://traefik.yourdomain.com

### Default Credentials
- **Grafana**: admin / [GRAFANA_PASSWORD from .env]
- **Traefik**: admin / admin (change immediately)
- **Prometheus**: admin / admin (change immediately)

## 🔧 Management Commands

### Service Management
```bash
# View all services status
docker-compose -f docker-compose.domain.yml ps

# View service logs
docker-compose -f docker-compose.domain.yml logs -f [service_name]

# Restart specific service
docker-compose -f docker-compose.domain.yml restart [service_name]

# Update deployment
./deploy-domain.sh --update

# Create backup
./deploy-domain.sh --backup

# Renew SSL certificates
./deploy-domain.sh --renew-ssl
```

### Health Checks
```bash
# Check deployment status
./deploy-domain.sh --status

# Run security tests
./deploy-domain.sh --security

# View logs
./deploy-domain.sh --logs
```

## 🚨 Troubleshooting

### Common Issues

#### 1. DNS Not Propagating
```bash
# Check DNS resolution
nslookup yourdomain.com
dig yourdomain.com

# Wait up to 24 hours for global propagation
```

#### 2. SSL Certificate Issues
```bash
# Check certificate status
docker-compose -f docker-compose.domain.yml logs traefik

# Force certificate renewal
./deploy-domain.sh --renew-ssl
```

#### 3. Service Not Starting
```bash
# Check specific service logs
docker-compose -f docker-compose.domain.yml logs [service_name]

# Check resource usage
htop
df -h
```

#### 4. Port Already in Use
```bash
# Find process using port
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# Stop conflicting service
sudo systemctl stop apache2  # or nginx
sudo systemctl disable apache2
```

### Log Locations
- **Application Logs**: `./logs/[service]/`
- **Docker Logs**: `docker-compose logs [service]`
- **System Logs**: `/var/log/`
- **SSL Logs**: `./logs/traefik/`

## 🔄 Backup & Recovery

### Automatic Backups
```bash
# Create full backup
./deploy-domain.sh --backup

# Backup files location
ls -la backups/
```

### Manual Database Backup
```bash
# PostgreSQL backup
docker-compose -f docker-compose.domain.yml exec postgres pg_dump -U recoder recoder_production > backup.sql

# Redis backup
docker-compose -f docker-compose.domain.yml exec redis redis-cli BGSAVE
```

### Recovery
```bash
# Restore database
docker-compose -f docker-compose.domain.yml exec -T postgres psql -U recoder recoder_production < backup.sql

# Restore Redis
docker cp backup.rdb $(docker-compose -f docker-compose.domain.yml ps -q redis):/data/dump.rdb
docker-compose -f docker-compose.domain.yml restart redis
```

## 📈 Performance Optimization

### Resource Monitoring
```bash
# Monitor resource usage
htop
docker stats
df -h
```

### Database Optimization
```bash
# PostgreSQL performance tuning
docker-compose -f docker-compose.domain.yml exec postgres psql -U recoder -c "ANALYZE;"
```

### Cache Optimization
```bash
# Redis cache stats
docker-compose -f docker-compose.domain.yml exec redis redis-cli info memory
```

## 🎯 Production Checklist

### Pre-Launch
- [ ] DNS records configured and propagated
- [ ] SSL certificates obtained and valid
- [ ] All services healthy and responding
- [ ] Environment variables configured
- [ ] API keys added and functional
- [ ] Database initialized and accessible
- [ ] Monitoring dashboards accessible
- [ ] Firewall configured and active
- [ ] Backups tested and functional

### Post-Launch
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Monitoring alerts configured
- [ ] Documentation updated
- [ ] Team access configured
- [ ] Backup schedule established
- [ ] Update procedures documented

## 🆘 Support

### Get Help
- **Documentation**: https://docs.recoder.xyz
- **Issues**: https://github.com/your-repo/recoder.xyz/issues
- **Support**: support@recoder.xyz

### Emergency Contacts
- **System Admin**: admin@recoder.xyz
- **DevOps**: devops@recoder.xyz
- **Security**: security@recoder.xyz

---

## 🌟 Success!

Your Recoder.xyz platform is now live with enterprise-grade security, monitoring, and scalability!

Visit https://yourdomain.com to start using your AI-powered development platform.